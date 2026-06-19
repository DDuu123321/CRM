"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { PipelineStage, QuoteStatus, Prisma } from "@prisma/client";
import { syncLeads } from "@/lib/sync";

async function requireUserId() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  return session.user.id;
}

const newDealSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().optional(),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().optional(),
  address: z.string().optional(),
  suburb: z.string().optional(),
  state: z.string().optional(),
  postcode: z.string().optional(),
  title: z.string().optional(),
});

export async function createDeal(formData: FormData) {
  const userId = await requireUserId();

  const d = newDealSchema.parse({
    firstName: formData.get("firstName"),
    lastName: formData.get("lastName") ?? "",
    email: formData.get("email") ?? "",
    phone: formData.get("phone") ?? "",
    address: formData.get("address") ?? "",
    suburb: formData.get("suburb") ?? "",
    state: formData.get("state") ?? "",
    postcode: formData.get("postcode") ?? "",
    title: formData.get("title") ?? "",
  });

  // Contact is the identity anchor: dedup by email when one is given, so a
  // repeat enquiry from the same person reuses their contact record.
  // Contact + Site + Deal in one transaction, so a partial failure can't leave
  // an orphaned contact or site behind.
  // Normalise the email (lowercase) so case variants dedup to one contact, and
  // an empty/whitespace value cleanly skips dedup.
  const email = (d.email ?? "").trim().toLowerCase() || null;

  const deal = await prisma.$transaction(async (tx) => {
    // Dedup by email when given; Contact is a stable identity anchor, so a
    // repeat enquiry reuses it WITHOUT overwriting existing name/phone
    // (sales can edit those by hand). No email → no dedup key → new contact.
    const contact = email
      ? await tx.contact.upsert({
          where: { email },
          update: {},
          create: {
            firstName: d.firstName,
            lastName: d.lastName || null,
            email,
            phone: d.phone || null,
          },
        })
      : await tx.contact.create({
          data: {
            firstName: d.firstName,
            lastName: d.lastName || null,
            phone: d.phone || null,
          },
        });

    // Only create a Site if an address detail was actually entered.
    let siteId: string | undefined;
    if (d.address || d.suburb || d.state || d.postcode) {
      const site = await tx.site.create({
        data: {
          contactId: contact.id,
          address: d.address || null,
          suburb: d.suburb || null,
          state: d.state || null,
          postcode: d.postcode || null,
        },
      });
      siteId = site.id;
    }

    return tx.deal.create({
      data: {
        contactId: contact.id,
        siteId,
        ownerId: userId,
        title: d.title || null,
        activities: {
          create: { type: "NOTE", body: "Deal created.", actorId: userId },
        },
      },
    });
  });

  revalidatePath("/leads");
  redirect(`/leads/${deal.id}`);
}

// NOTE (authz): the mutations below check authentication, not ownership — any
// signed-in user can act on any deal by id. Fine with a single admin. When
// multi-user RBAC lands (Phase 2), gate here with the chosen policy
// (owner-only vs team-visible vs role-based) before the write.
export async function advanceStage(formData: FormData) {
  const userId = await requireUserId();

  const dealId = String(formData.get("dealId") ?? "");
  const stage = String(formData.get("stage") ?? "");
  if (!dealId || !(stage in PipelineStage)) return;

  // Read the current stage INSIDE the transaction so the audit entry always
  // records the true previous stage, even under concurrent updates.
  await prisma.$transaction(async (tx) => {
    const deal = await tx.deal.findUnique({ where: { id: dealId } });
    if (!deal || deal.stage === stage) return;

    await tx.deal.update({
      where: { id: dealId },
      data: { stage: stage as PipelineStage },
    });
    await tx.activity.create({
      data: {
        dealId,
        type: "STAGE_CHANGE",
        body: `Stage changed: ${deal.stage} → ${stage}`,
        actorId: userId,
      },
    });
  });

  revalidatePath(`/leads/${dealId}`);
  revalidatePath("/leads");
}

export async function addActivity(formData: FormData) {
  const userId = await requireUserId();

  const dealId = String(formData.get("dealId") ?? "");
  const body = String(formData.get("body") ?? "").trim();
  if (!dealId || !body) return;

  // Guard the FK so a stale dealId fails gracefully instead of a 500.
  const deal = await prisma.deal.findUnique({
    where: { id: dealId },
    select: { id: true },
  });
  if (!deal) return;

  await prisma.activity.create({
    data: { dealId, type: "NOTE", body, actorId: userId },
  });

  revalidatePath(`/leads/${dealId}`);
}

// Manual "Sync website leads" trigger (auth-gated by the session). Pulls new
// quotes/assessments from the website and imports them. The /api/sync route
// wraps the same syncLeads() for scheduled (cron) runs once deployed.
export async function syncNow() {
  await requireUserId();
  try {
    const result = await syncLeads();
    // No revalidatePath here — it would reset the client SyncButton's state and
    // wipe the result message. The button calls router.refresh() instead.
    return {
      ok: true as const,
      imported: result.imported,
      skipped: result.skipped,
    };
  } catch (err) {
    console.error("[syncNow]", err);
    return {
      ok: false as const,
      error: err instanceof Error ? err.message : "Sync failed",
    };
  }
}

// ── Lead assignment ────────────────────────────────────────
export async function assignDeal(formData: FormData) {
  const userId = await requireUserId();
  const dealId = String(formData.get("dealId") ?? "");
  if (!dealId) return;
  const ownerId = String(formData.get("ownerId") ?? "") || null;

  // Validate the owner + write inside one transaction, so the user can't be
  // deleted between the FK check and the update.
  await prisma.$transaction(async (tx) => {
    const deal = await tx.deal.findUnique({
      where: { id: dealId },
      include: { owner: { select: { name: true } } },
    });
    if (!deal || deal.ownerId === ownerId) return;

    let newOwnerName = "Unassigned";
    if (ownerId) {
      const u = await tx.user.findUnique({
        where: { id: ownerId },
        select: { name: true },
      });
      if (!u) return; // unknown user → ignore (guards the FK)
      newOwnerName = u.name ?? "user";
    }

    await tx.deal.update({ where: { id: dealId }, data: { ownerId } });
    await tx.activity.create({
      data: {
        dealId,
        type: "NOTE",
        body: `Owner: ${deal.owner?.name ?? "Unassigned"} → ${newOwnerName}.`,
        actorId: userId,
      },
    });
  });

  revalidatePath(`/leads/${dealId}`);
  revalidatePath("/leads");
}

// ── Quotes (minimal CPQ — manual line items, no product catalog) ───────────
const lineItemSchema = z.object({
  description: z.string().min(1).max(200),
  quantity: z.coerce.number().int().min(1).max(999999),
  // Validate the raw string to ≤2 decimals so it stores into Decimal(10,2)
  // exactly — a JS float (z.coerce.number) like 100.555 would silently round.
  // Prisma accepts the string for a Decimal column.
  unitPrice: z
    .string()
    .trim()
    .regex(/^\d+(\.\d{1,2})?$/)
    .refine((v) => Number(v) <= 99999999.99),
});

function aud(d: Prisma.Decimal) {
  return "$" + d.toFixed(2);
}

export async function createQuote(formData: FormData) {
  await requireUserId();
  const dealId = String(formData.get("dealId") ?? "");
  if (!dealId) return;
  const deal = await prisma.deal.findUnique({
    where: { id: dealId },
    select: { id: true },
  });
  if (!deal) return;
  await prisma.quote.create({ data: { dealId } });
  revalidatePath(`/leads/${dealId}`);
}

export async function addLineItem(formData: FormData) {
  await requireUserId();
  const quoteId = String(formData.get("quoteId") ?? "");
  if (!quoteId) return;

  const parsed = lineItemSchema.safeParse({
    description: formData.get("description"),
    quantity: formData.get("quantity"),
    unitPrice: formData.get("unitPrice"),
  });
  if (!parsed.success) return;

  // Only DRAFT quotes are editable.
  const quote = await prisma.quote.findUnique({
    where: { id: quoteId },
    select: { dealId: true, status: true },
  });
  if (!quote || quote.status !== "DRAFT") return;

  await prisma.quoteLineItem.create({
    data: {
      quoteId,
      description: parsed.data.description,
      quantity: parsed.data.quantity,
      unitPrice: parsed.data.unitPrice,
    },
  });
  revalidatePath(`/leads/${quote.dealId}`);
}

export async function removeLineItem(formData: FormData) {
  await requireUserId();
  const lineItemId = String(formData.get("lineItemId") ?? "");
  if (!lineItemId) return;

  const li = await prisma.quoteLineItem.findUnique({
    where: { id: lineItemId },
    include: { quote: { select: { dealId: true, status: true } } },
  });
  if (!li || li.quote.status !== "DRAFT") return;

  await prisma.quoteLineItem.delete({ where: { id: lineItemId } });
  revalidatePath(`/leads/${li.quote.dealId}`);
}

// DRAFT → SENT (deal → QUOTED) · SENT → ACCEPTED (deal → WON) / DECLINED.
export async function setQuoteStatus(formData: FormData) {
  const userId = await requireUserId();
  const quoteId = String(formData.get("quoteId") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!quoteId || !(status in QuoteStatus)) return;

  const quote = await prisma.quote.findUnique({
    where: { id: quoteId },
    include: { lineItems: true },
  });
  if (!quote || quote.status === status) return;

  // Enforce the state machine: DRAFT→SENT, SENT→ACCEPTED/DECLINED only. Without
  // this a crafted POST could jump DRAFT→ACCEPTED and skip SENT (deal→WON).
  const allowed: Record<string, string[]> = {
    DRAFT: ["SENT"],
    SENT: ["ACCEPTED", "DECLINED"],
    ACCEPTED: [],
    DECLINED: [],
  };
  if (!allowed[quote.status]?.includes(status)) return;
  // Don't send an empty quote (the UI disables this; guard the direct POST too).
  if (status === "SENT" && quote.lineItems.length === 0) return;

  const total = quote.lineItems.reduce(
    (acc, li) => acc.plus(li.unitPrice.mul(li.quantity)),
    new Prisma.Decimal(0),
  );

  await prisma.$transaction(async (tx) => {
    await tx.quote.update({
      where: { id: quoteId },
      data: { status: status as QuoteStatus },
    });

    if (status === "SENT") {
      await tx.deal.update({
        where: { id: quote.dealId },
        data: { stage: "QUOTED" },
      });
      await tx.activity.create({
        data: {
          dealId: quote.dealId,
          type: "EMAIL",
          body: `Quote sent — ${aud(total)}.`,
          actorId: userId,
        },
      });
    } else if (status === "ACCEPTED") {
      await tx.deal.update({
        where: { id: quote.dealId },
        data: { stage: "WON" },
      });
      await tx.activity.create({
        data: {
          dealId: quote.dealId,
          type: "NOTE",
          body: `Quote accepted — ${aud(total)}. Deal won.`,
          actorId: userId,
        },
      });
    } else if (status === "DECLINED") {
      // Decline ≠ lost deal — the rep decides the deal's next stage (re-quote or
      // mark LOST by hand), so we only record the decline here.
      await tx.activity.create({
        data: {
          dealId: quote.dealId,
          type: "NOTE",
          body: "Quote declined.",
          actorId: userId,
        },
      });
    }
  });

  revalidatePath(`/leads/${quote.dealId}`);
  revalidatePath("/leads");
}
