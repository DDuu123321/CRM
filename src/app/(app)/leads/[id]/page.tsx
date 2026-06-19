import Link from "next/link";
import { notFound } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { PipelineStage, Prisma } from "@prisma/client";
import {
  addActivity,
  addLineItem,
  advanceStage,
  assignDeal,
  createQuote,
  removeLineItem,
  setQuoteStatus,
} from "../actions";

const STAGES = Object.values(PipelineStage);

function aud(d: Prisma.Decimal) {
  return "$" + d.toFixed(2);
}

export default async function DealDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const [deal, users] = await Promise.all([
    prisma.deal.findUnique({
      where: { id: params.id },
      include: {
        contact: true,
        site: true,
        owner: true,
        activities: { orderBy: { createdAt: "desc" }, include: { actor: true } },
        quotes: {
          orderBy: { createdAt: "desc" },
          include: { lineItems: { orderBy: { createdAt: "asc" } } },
        },
      },
    }),
    prisma.user.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

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
            action={assignDeal}
            className="rounded-xl border border-slate-200 bg-white p-5"
          >
            <input type="hidden" name="dealId" value={deal.id} />
            <label className="block text-sm">
              <span className="font-medium text-slate-700">Owner</span>
              <select
                name="ownerId"
                defaultValue={deal.ownerId ?? ""}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="">Unassigned</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name ?? u.id}
                  </option>
                ))}
              </select>
            </label>
            <button className="mt-3 w-full rounded-md border border-slate-300 px-3 py-2 text-sm font-medium hover:bg-slate-100">
              Assign
            </button>
          </form>

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

      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Quotes</h2>
          <form action={createQuote}>
            <input type="hidden" name="dealId" value={deal.id} />
            <button className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium hover:bg-slate-100">
              New quote
            </button>
          </form>
        </div>

        {deal.quotes.length === 0 && (
          <p className="text-sm text-slate-400">No quotes yet.</p>
        )}

        {deal.quotes.map((quote) => {
          const total = quote.lineItems.reduce(
            (acc, li) => acc.plus(li.unitPrice.mul(li.quantity)),
            new Prisma.Decimal(0),
          );
          const isDraft = quote.status === "DRAFT";

          return (
            <div
              key={quote.id}
              className="rounded-xl border border-slate-200 bg-white p-5"
            >
              <div className="flex items-center justify-between">
                <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                  {quote.status}
                </span>
                <span className="text-xs text-slate-400">
                  {quote.createdAt.toLocaleString()}
                </span>
              </div>

              <table className="mt-3 w-full text-sm">
                <thead className="text-left text-xs text-slate-400">
                  <tr>
                    <th className="py-1 font-medium">Item</th>
                    <th className="py-1 text-right font-medium">Qty</th>
                    <th className="py-1 text-right font-medium">Unit</th>
                    <th className="py-1 text-right font-medium">Total</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {quote.lineItems.map((li) => (
                    <tr key={li.id} className="border-t border-slate-100">
                      <td className="py-1.5">{li.description}</td>
                      <td className="py-1.5 text-right">{li.quantity}</td>
                      <td className="py-1.5 text-right">{aud(li.unitPrice)}</td>
                      <td className="py-1.5 text-right">
                        {aud(li.unitPrice.mul(li.quantity))}
                      </td>
                      <td className="py-1.5 text-right">
                        {isDraft && (
                          <form action={removeLineItem} className="inline">
                            <input
                              type="hidden"
                              name="lineItemId"
                              value={li.id}
                            />
                            <button
                              aria-label="Remove line item"
                              className="text-xs text-slate-400 hover:text-red-600"
                            >
                              ✕
                            </button>
                          </form>
                        )}
                      </td>
                    </tr>
                  ))}
                  {quote.lineItems.length === 0 && (
                    <tr>
                      <td colSpan={5} className="py-2 text-slate-400">
                        No items.
                      </td>
                    </tr>
                  )}
                </tbody>
                <tfoot>
                  <tr className="border-t border-slate-200 font-medium">
                    <td className="py-1.5" colSpan={3}>
                      Total
                    </td>
                    <td className="py-1.5 text-right">{aud(total)}</td>
                    <td />
                  </tr>
                </tfoot>
              </table>

              {isDraft && (
                <form
                  key={quote.lineItems.length}
                  action={addLineItem}
                  className="mt-3 flex flex-wrap items-end gap-2"
                >
                  <input type="hidden" name="quoteId" value={quote.id} />
                  <input
                    name="description"
                    required
                    placeholder="Description"
                    className="flex-1 rounded-md border border-slate-300 px-3 py-1.5 text-sm"
                  />
                  <input
                    name="quantity"
                    type="number"
                    min="1"
                    defaultValue="1"
                    className="w-16 rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                  />
                  <input
                    name="unitPrice"
                    type="number"
                    min="0"
                    step="0.01"
                    required
                    placeholder="0.00"
                    className="w-28 rounded-md border border-slate-300 px-3 py-1.5 text-sm"
                  />
                  <button className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700">
                    Add item
                  </button>
                </form>
              )}

              <div className="mt-3 flex gap-2">
                {quote.status === "DRAFT" && (
                  <StatusButton
                    quoteId={quote.id}
                    status="SENT"
                    label="Send quote"
                    disabled={quote.lineItems.length === 0}
                  />
                )}
                {quote.status === "SENT" && (
                  <>
                    <StatusButton
                      quoteId={quote.id}
                      status="ACCEPTED"
                      label="Mark accepted"
                    />
                    <StatusButton
                      quoteId={quote.id}
                      status="DECLINED"
                      label="Mark declined"
                    />
                  </>
                )}
              </div>
            </div>
          );
        })}
      </section>
    </div>
  );
}

function StatusButton({
  quoteId,
  status,
  label,
  disabled = false,
}: {
  quoteId: string;
  status: string;
  label: string;
  disabled?: boolean;
}) {
  return (
    <form action={setQuoteStatus}>
      <input type="hidden" name="quoteId" value={quoteId} />
      <input type="hidden" name="status" value={status} />
      <button
        disabled={disabled}
        className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium hover:bg-slate-100 disabled:opacity-40"
      >
        {label}
      </button>
    </form>
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
