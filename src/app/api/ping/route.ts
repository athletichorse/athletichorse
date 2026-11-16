import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** Connection check for the offline till (no data, no login). */
export function GET() {
  return NextResponse.json({ ok: true, t: Date.now() }, { headers: { "cache-control": "no-store" } });
}
