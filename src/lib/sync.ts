import "server-only";

import { z } from "zod";
import { Prisma, LeadSource } from "@prisma/client";

import { prisma } from "@/lib/prisma";

const SOURCE = "website";

const itemSchema = z.object({
  kind: z.string(),
  externalId: z.string().min(1),
  createdAt: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  email: z.string(),
  phone: z.string(),
  address: z.string(),
  suburb: z.string(),
  state: z.string(),
  postcode: z.string(),
  source: z.string(),
  title: z.string(),
});
const responseSchema = z.object({ items: z.array(itemSchema) });

function toLeadSource(s: string): LeadSource {
  switch (s) {
    case "AI_CHAT":
      return "AI_CHAT";
    case "WEBSITE_ASSESSMENT":
      return "WEBSITE_ASSESSMENT";
    case "WEBSITE_QUOTE":
      return "WEBSITE_QUOTE";
    default:
      return "OTHER";
  }
}

export type SyncResult = {
  total: number;
  imported: number;
  skipped: number;
  failed: number;
};

// Pull new website leads (since the stored cursor) and import each as a
// Contact/Site/Deal, idempotently keyed by Deal.externalId. One-way: we never
// write back to the website. The website DB is the durable buffer, so this is
// safe to run on a schedule or by hand, and re-running never duplicates.
export async function syncLeads(): Promise<SyncResult> {
  const base = process.env.CMS_BASE_URL;
  const key = process.env.CRM_SYNC_KEY;
  if (!base || !key) {
    throw new Error("CMS_BASE_URL / CRM_SYNC_KEY not configured");
  }

  const state = await prisma.syncState.findUnique({ where: { source: SOURCE } });
  const since = (state?.cursor ?? new Date(0)).toISOString();

  const url = `${base.replace(/\/$/, "")}/api/crm/leads?since=${encodeURIComponent(since)}`;
  const res = await fetch(url, {
    headers: { authorization: `Bearer ${key}` },
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`CMS sync fetch failed: ${res.status}`);
  }
  const { items } = responseSchema.parse(await res.json());

  let imported = 0;
  let skipped = 0;
  let failed = 0;
  let maxCreatedAt = state?.cursor ?? null;
  let firstFailedAt: Date | null = null;

  for (const it of items) {
    const createdAt = new Date(it.createdAt);
    if (!maxCreatedAt || createdAt > maxCreatedAt) maxCreatedAt = createdAt;

    try {
      const existing = await prisma.deal.findUnique({
        where: { externalId: it.externalId },
        select: { id: true },
      });
      if (existing) {
        skipped++;
        continue;
      }

      // Email is the dedup key — normalise case so "Foo@x" and "foo@x" are one
      // person (the Contact.email unique index is case-sensitive in Postgres).
      const email = it.email.trim().toLowerCase() || null;
      const firstName = it.firstName.trim() || "Website lead";

      await prisma.$transaction(async (tx) => {
        const contact = email
          ? await tx.contact.upsert({
              where: { email },
              update: {},
              create: {
                firstName,
                lastName: it.lastName.trim() || null,
                email,
                phone: it.phone.trim() || null,
              },
            })
          : await tx.contact.create({
              data: {
                firstName,
                lastName: it.lastName.trim() || null,
                phone: it.phone.trim() || null,
              },
            });

        let siteId: string | undefined;
        if (it.address || it.suburb || it.state || it.postcode) {
          const site = await tx.site.create({
            data: {
              contactId: contact.id,
              address: it.address.trim() || null,
              suburb: it.suburb.trim() || null,
              state: it.state.trim() || null,
              postcode: it.postcode.trim() || null,
            },
          });
          siteId = site.id;
        }

        await tx.deal.create({
          data: {
            externalId: it.externalId,
            contactId: contact.id,
            siteId,
            source: toLeadSource(it.source),
            title: it.title || null,
            activities: {
              create: { type: "NOTE", body: `Imported from website (${it.kind}).` },
            },
          },
        });
      });
      imported++;
    } catch (err) {
      // A concurrent run already imported this lead → not a failure, just a skip.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        skipped++;
      } else {
        failed++;
        if (!firstFailedAt || createdAt < firstFailedAt) firstFailedAt = createdAt;
        console.error(`[sync] item ${it.externalId} failed:`, err);
      }
    }
  }

  // Advance the cursor up to (but not past) the earliest failed item: successes
  // before it commit, and the failed item + anything after is retried next run
  // (re-imports are no-ops via externalId). So a transient error can never
  // permanently block discovery of newer leads.
  const newCursor = failed > 0 ? firstFailedAt : maxCreatedAt;
  if (newCursor) {
    await prisma.syncState.upsert({
      where: { source: SOURCE },
      update: { cursor: newCursor },
      create: { source: SOURCE, cursor: newCursor },
    });
  }

  return { total: items.length, imported, skipped, failed };
}
