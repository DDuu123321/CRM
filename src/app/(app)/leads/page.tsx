import Link from "next/link";

import { prisma } from "@/lib/prisma";
import { Prisma, PipelineStage, LeadSource } from "@prisma/client";
import { createDeal } from "./actions";
import { SyncButton } from "./sync-button";

const STAGE_LABELS: Record<string, string> = {
  NEW: "New",
  CONTACTED: "Contacted",
  QUALIFIED: "Qualified",
  QUOTED: "Quoted",
  WON: "Won",
  LOST: "Lost",
};

export default async function PipelinePage({
  searchParams,
}: {
  searchParams: { q?: string; stage?: string; source?: string; owner?: string };
}) {
  const q = (searchParams.q ?? "").trim();
  const stage = searchParams.stage ?? "";
  const source = searchParams.source ?? "";
  const owner = searchParams.owner ?? "";

  const where: Prisma.DealWhereInput = {};
  if (stage in PipelineStage) where.stage = stage as PipelineStage;
  if (source in LeadSource) where.source = source as LeadSource;
  if (owner === "unassigned") where.ownerId = null;
  else if (owner) where.ownerId = owner;
  if (q) {
    // Prisma parameterises `contains`, so q is always a literal — no SQL injection.
    where.contact = {
      OR: [
        { firstName: { contains: q, mode: "insensitive" } },
        { lastName: { contains: q, mode: "insensitive" } },
        { email: { contains: q, mode: "insensitive" } },
      ],
    };
  }

  const [deals, users] = await Promise.all([
    prisma.deal.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        contact: true,
        site: true,
        owner: true,
        _count: { select: { activities: true } },
      },
    }),
    prisma.user.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  const hasFilter = Boolean(q || stage || source || owner);

  return (
    <div className="space-y-6">
      <section className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Pipeline</h1>
          <p className="text-sm text-slate-500">
            {deals.length} deals{hasFilter ? " (filtered)" : ""}
          </p>
        </div>
        <SyncButton />
      </section>

      <form
        method="get"
        className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4"
      >
        <label className="text-sm">
          <span className="text-slate-500">Search</span>
          <input
            name="q"
            defaultValue={q}
            placeholder="name or email"
            className="mt-1 block w-48 rounded-md border border-slate-300 px-3 py-1.5 text-sm"
          />
        </label>
        <FilterSelect
          name="stage"
          label="Stage"
          value={stage}
          options={Object.values(PipelineStage)}
        />
        <FilterSelect
          name="source"
          label="Source"
          value={source}
          options={Object.values(LeadSource)}
        />
        <label className="text-sm">
          <span className="text-slate-500">Owner</span>
          <select
            name="owner"
            defaultValue={owner}
            className="mt-1 block w-44 rounded-md border border-slate-300 px-3 py-1.5 text-sm"
          >
            <option value="">Any</option>
            <option value="unassigned">Unassigned</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name ?? u.id}
              </option>
            ))}
          </select>
        </label>
        <button className="rounded-md bg-slate-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-slate-700">
          Filter
        </button>
        {hasFilter && (
          <Link href="/leads" className="text-sm text-slate-500 hover:underline">
            Clear
          </Link>
        )}
      </form>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-left text-slate-500">
            <tr>
              <th className="px-4 py-2 font-medium">Contact</th>
              <th className="px-4 py-2 font-medium">Deal</th>
              <th className="px-4 py-2 font-medium">Stage</th>
              <th className="px-4 py-2 font-medium">Source</th>
              <th className="px-4 py-2 font-medium">Location</th>
              <th className="px-4 py-2 font-medium">Owner</th>
              <th className="px-4 py-2 font-medium">Activity</th>
            </tr>
          </thead>
          <tbody>
            {deals.map((deal) => (
              <tr
                key={deal.id}
                className="border-b border-slate-100 last:border-0 hover:bg-slate-50"
              >
                <td className="px-4 py-2">
                  <Link
                    href={`/leads/${deal.id}`}
                    className="font-medium text-slate-900 hover:underline"
                  >
                    {deal.contact.firstName}
                    {deal.contact.lastName ? ` ${deal.contact.lastName}` : ""}
                  </Link>
                  <div className="text-xs text-slate-400">
                    {deal.contact.email ?? deal.contact.phone ?? "—"}
                  </div>
                </td>
                <td className="px-4 py-2 text-slate-600">{deal.title ?? "—"}</td>
                <td className="px-4 py-2">
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs">
                    {STAGE_LABELS[deal.stage] ?? deal.stage}
                  </span>
                </td>
                <td className="px-4 py-2 text-slate-500">{deal.source}</td>
                <td className="px-4 py-2 text-slate-500">
                  {deal.site
                    ? [deal.site.suburb, deal.site.state]
                        .filter(Boolean)
                        .join(", ") || "—"
                    : "—"}
                </td>
                <td className="px-4 py-2 text-slate-500">
                  {deal.owner?.name ?? "—"}
                </td>
                <td className="px-4 py-2 text-slate-500">
                  {deal._count.activities}
                </td>
              </tr>
            ))}
            {deals.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-slate-400">
                  {hasFilter ? "No deals match the filter." : "No deals yet."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="mb-4 text-lg font-semibold">New lead</h2>
        <form action={createDeal} className="space-y-6">
          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-400">
              Contact
            </p>
            <div className="grid grid-cols-2 gap-4">
              <Field name="firstName" label="First name *" required />
              <Field name="lastName" label="Last name" />
              <Field name="email" label="Email" type="email" />
              <Field name="phone" label="Phone" />
            </div>
          </div>

          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-400">
              Site
            </p>
            <div className="grid grid-cols-2 gap-4">
              <Field name="address" label="Address" />
              <Field name="suburb" label="Suburb" />
              <Field name="state" label="State" />
              <Field name="postcode" label="Postcode" />
            </div>
          </div>

          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-400">
              Deal
            </p>
            <Field name="title" label="Title (e.g. 6.6kW solar + battery)" />
          </div>

          <button className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700">
            Create lead
          </button>
        </form>
      </section>
    </div>
  );
}

function FilterSelect({
  name,
  label,
  value,
  options,
}: {
  name: string;
  label: string;
  value: string;
  options: string[];
}) {
  return (
    <label className="text-sm">
      <span className="text-slate-500">{label}</span>
      <select
        name={name}
        defaultValue={value}
        className="mt-1 block w-40 rounded-md border border-slate-300 px-3 py-1.5 text-sm"
      >
        <option value="">Any</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </label>
  );
}

function Field({
  name,
  label,
  type = "text",
  required = false,
}: {
  name: string;
  label: string;
  type?: string;
  required?: boolean;
}) {
  return (
    <label className="block text-sm">
      <span className="text-slate-700">{label}</span>
      <input
        name={name}
        type={type}
        required={required}
        className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
      />
    </label>
  );
}
