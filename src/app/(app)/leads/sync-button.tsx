"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { syncNow } from "./actions";

export function SyncButton() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  return (
    <div className="flex items-center gap-3">
      {msg && <span className="text-sm text-slate-500">{msg}</span>}
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await syncNow();
            setMsg(
              r.ok
                ? `Imported ${r.imported}, skipped ${r.skipped}`
                : `Sync failed: ${r.error}`,
            );
            router.refresh();
          })
        }
        className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium hover:bg-slate-100 disabled:opacity-50"
      >
        {pending ? "Syncing…" : "Sync website leads"}
      </button>
    </div>
  );
}
