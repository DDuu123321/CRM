"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { PipelineStage } from "@prisma/client";

async function requireUserId() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  return session.user.id;
}

const newLeadSchema = z.object({
  name: z.string().min(1),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().optional(),
  postcode: z.string().optional(),
  state: z.string().optional(),
});

export async function createLead(formData: FormData) {
  const userId = await requireUserId();

  const parsed = newLeadSchema.parse({
    name: formData.get("name"),
    email: formData.get("email") ?? "",
    phone: formData.get("phone") ?? "",
    postcode: formData.get("postcode") ?? "",
    state: formData.get("state") ?? "",
  });

  const lead = await prisma.lead.create({
    data: {
      name: parsed.name,
      email: parsed.email || null,
      phone: parsed.phone || null,
      postcode: parsed.postcode || null,
      state: parsed.state || null,
      ownerId: userId,
      activities: {
        create: { type: "NOTE", body: "Lead created.", actorId: userId },
      },
    },
  });

  revalidatePath("/leads");
  redirect(`/leads/${lead.id}`);
}

// NOTE (authz): the mutations below check authentication, not ownership — any
// signed-in user can act on any lead by id. Fine with a single admin. When
// multi-user RBAC lands (Phase 2), gate here with the chosen policy
// (owner-only vs team-visible vs role-based) before the write.
export async function advanceStage(formData: FormData) {
  const userId = await requireUserId();

  const leadId = String(formData.get("leadId") ?? "");
  const stage = String(formData.get("stage") ?? "");
  if (!leadId || !(stage in PipelineStage)) return;

  const lead = await prisma.lead.findUnique({ where: { id: leadId } });
  if (!lead || lead.stage === stage) return;

  // Stage change + its audit entry, atomically.
  await prisma.$transaction([
    prisma.lead.update({
      where: { id: leadId },
      data: { stage: stage as PipelineStage },
    }),
    prisma.activity.create({
      data: {
        leadId,
        type: "STAGE_CHANGE",
        body: `Stage changed: ${lead.stage} → ${stage}`,
        actorId: userId,
      },
    }),
  ]);

  revalidatePath(`/leads/${leadId}`);
  revalidatePath("/leads");
}

export async function addActivity(formData: FormData) {
  const userId = await requireUserId();

  const leadId = String(formData.get("leadId") ?? "");
  const body = String(formData.get("body") ?? "").trim();
  if (!leadId || !body) return;

  await prisma.activity.create({
    data: { leadId, type: "NOTE", body, actorId: userId },
  });

  revalidatePath(`/leads/${leadId}`);
}
