import Link from "next/link";
import { notFound } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { PipelineStage } from "@prisma/client";
import { addActivity, advanceStage } from "../actions";

const STAGES = Object.values(PipelineStage);

export default async function DealDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const deal = await prisma.deal.findUnique({
    where: { id: params.id },
    include: {
      contact: true,
      site: true,
      owner: true,
      activities: {
        orderBy: { createdAt: "desc" },
        include: { actor: true },
      },
    },
  });

  if (!deal) notFound();

  const contactName = `${deal.contact.firstName}${
    deal.contact.lastName ? ` ${deal.contact.lastName}` : ""
  }`;

  return (
    <div className="space-y-8">
      <div>
        <Link href="/leads" className="text-sm text-slate-500 hover:underline">
          ← Pipeline
        </Link>
        <h1 className="mt-2 text-2xl font-semibold">
          {deal.title ?? contactName}
        </h1>
        <p className="text-sm text-slate-500">{contactName}</p>
      </div>

      <div className="grid grid-cols-3 gap-8">
        <section className="col-span-1 space-y-6">
          <Card title="Contact">
            <Row label="Name" value={contactName} />
            <Row label="Email" value={deal.contact.email ?? "—"} />
            <Row label="Phone" value={deal.contact.phone ?? "—"} />
          </Card>

          <Card title="Site">
            {deal.site ? (
              <>
                <Row label="Address" value={deal.site.address ?? "—"} />
                <Row label="Suburb" value={deal.site.suburb ?? "—"} />
                <Row label="State" value={deal.site.state ?? "—"} />
                <Row label="Postcode" value={deal.site.postcode ?? "—"} />
              </>
            ) : (
              <p className="text-slate-400">No site on file.</p>
            )}
          </Card>

          <Card title="Deal">
            <Row label="Stage" value={deal.stage} />
            <Row label="Source" value={deal.source} />
            <Row label="Owner" value={deal.owner?.name ?? "—"} />
            <Row label="Created" value={deal.createdAt.toLocaleString()} />
          </Card>

          <form
            action={advanceStage}
            className="rounded-xl border border-slate-200 bg-white p-5"
          >
            <input type="hidden" name="dealId" value={deal.id} />
            <label className="block text-sm">
              <span className="font-medium text-slate-700">Advance stage</span>
              <select
                name="stage"
                defaultValue={deal.stage}
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
            key={deal.activities.length}
            action={addActivity}
            className="flex gap-2"
          >
            <input type="hidden" name="dealId" value={deal.id} />
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
            {deal.activities.map((a) => (
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
            {deal.activities.length === 0 && (
              <li className="text-sm text-slate-400">No activity yet.</li>
            )}
          </ol>
        </section>
      </div>
    </div>
  );
}

function Card({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 text-sm">
      <p className="mb-3 text-xs font-medium uppercase tracking-wide text-slate-400">
        {title}
      </p>
      <dl className="space-y-2">{children}</dl>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="shrink-0 text-slate-500">{label}</dt>
      <dd className="text-right font-medium text-slate-900">{value}</dd>
    </div>
  );
}
