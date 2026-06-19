import crypto from "crypto";
import { NextResponse } from "next/server";

import { syncLeads } from "@/lib/sync";

// Constant-time Bearer check (compare SHA-256 digests so length never leaks and
// timingSafeEqual always gets equal-length buffers).
function authOk(header: string | null, secret: string): boolean {
  const a = crypto.createHash("sha256").update(header ?? "").digest();
  const b = crypto.createHash("sha256").update(`Bearer ${secret}`).digest();
  return crypto.timingSafeEqual(a, b);
}

// Scheduled entry point for the website→CRM lead pull. Guarded by CRON_SECRET
// (this route is outside the auth middleware matcher). Point a cron at:
//   POST /api/sync   with header  Authorization: Bearer <CRON_SECRET>
export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || !authOk(req.headers.get("authorization"), secret)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const result = await syncLeads();
    return NextResponse.json(result);
  } catch (err) {
    console.error("[api/sync]", err);
    return NextResponse.json({ error: "sync failed" }, { status: 500 });
  }
}
