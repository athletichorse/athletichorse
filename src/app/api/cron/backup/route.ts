import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { saveNightlyBackup } from "@/lib/backup";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 16) return false;
  const got = req.headers.get("authorization") ?? "";
  const h = (s: string) => createHash("sha256").update(s).digest();
  return timingSafeEqual(h(got), h(`Bearer ${secret}`));
}

/** Called every night by Vercel Cron (see vercel.json): a full copy of the data in private storage. */
export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const r = await saveNightlyBackup();
  return NextResponse.json(r, { status: r.ok ? 200 : 500 });
}
