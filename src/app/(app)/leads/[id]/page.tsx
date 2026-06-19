import Link from "next/link";
import { notFound } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { PipelineStage } from "@prisma/client";
import { addActivity, advanceStage } from "../actions";

const STAGES = Object.values(PipelineStage);

export default async function LeadDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const lead = await prisma.lead.findUnique({
    where: { id: params.id },
    include: {
      owner: true,
      activities: {
        orderBy: { createdAt: "desc" },
        include: { actor: true },
      },
    },
  });

  if (!lead) notFound();

  return (
    <div className="space-y-8">
      <div>
        <Link href="/leads" className="text-sm text-slate-500 hover:underline">
          ← Leads
        </Link>
        <h1 className="mt-2 text-2xl font-semibold">{lead.name}</h1>
        <p className="text-sm text-slate-500">
          {lead.email ?? "—"} · {lead.phone ?? "—"} · {lead.state ?? "—"}{" "}
          {lead.postcode ?? ""}
        </p>
      </div>

      <div className="grid grid-cols-3 gap-8">
        <section className="col-span-1 space-y-6">
          <div className="rounded-xl border border-slate-200 bg-white p-5 text-sm">
            <dl className="space-y-2">
              <Row label="Stage" value={lead.stage} />
              <Row label="Source" value={lead.source} />
              <Row label="Owner" value={lead.owner?.name ?? "—"} />
              <Row label="Created" value={lead.createdAt.toLocaleString()} />
            </dl>
          </div>

          <form
            action={advanceStage}
            className="rounded-xl border border-slate-200 bg-white p-5"
          >
            <input type="hidden" name="leadId" value={lead.id} />
            <label className="block text-sm">
              <span className="font-medium text-slate-700">Advance stage</span>
              <select
                name="stage"
                defaultValue={lead.stage}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              >
                {STAGES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
            <button className="mt-3 w-full rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700">
              Update stage
            </button>
          </form>
        </section>

        <section className="col-span-2 space-y-4">
          <h2 className="text-lg font-semibold">Activity</h2>

          <form
            key={lead.activities.length}
            action={addActivity}
            className="flex gap-2"
          >
            <input type="hidden" name="leadId" value={lead.id} />
            <input
              name="body"
              required
              placeholder="Add a note…"
              className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
            <button className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700">
              Add
            </button>
          </form>

          <ol className="space-y-3">
            {lead.activities.map((a) => (
              <li
                key={a.id}
                className="rounded-lg border border-slate-200 bg-white p-3 text-sm"
              >
                <div className="flex items-center justify-between">
                  <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600">
                    {a.type}
                  </span>
                  <span className="text-xs text-slate-400">
                    {a.createdAt.toLocaleString()}
                  </span>
                </div>
                <p className="mt-1 text-slate-800">{a.body}</p>
                <p className="mt-1 text-xs text-slate-400">
                  {a.actor?.name ?? "system"}
                </p>
              </li>
            ))}
            {lead.activities.length === 0 && (
              <li className="text-sm text-slate-400">No activity yet.</li>
            )}
          </ol>
        </section>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <dt className="text-slate-500">{label}</dt>
      <dd className="font-medium text-slate-900">{value}</dd>
    </div>
  );
}
