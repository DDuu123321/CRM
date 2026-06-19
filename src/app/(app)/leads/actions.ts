"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { PipelineStage } from "@prisma/client";
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
