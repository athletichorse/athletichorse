"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth";
import { db } from "@/lib/supabase/admin";
import { audit } from "@/lib/audit";
import { latin } from "@/lib/purchasing";
import { CAMPAIGN_STATUSES, CHANNELS } from "@/lib/marketing";
import { runMetaSync } from "@/lib/marketing-sync";

const isId = (v: unknown) => typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);
const day = (v: unknown) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v ?? "")) ? String(v) : null);
const txt = (v: unknown, max: number) => String(v ?? "").trim().replace(/\s+/g, " ").slice(0, max);
const money = (v: unknown) => { const s = latin(v); return s === "" ? 0 : /^\d{1,10}(\.\d{1,2})?$/.test(s) ? Number(s) : null; };

async function editor() {
  const s = await requireStaff();
  if (!s.perms.has("marketing.edit")) redirect("/forbidden?k=marketing.edit");
  return s;
}

/** The whole year's budget grid (fields b:<channel>:<month>). */
export async function saveBudgetAction(form: FormData) {
  const s = await editor();
  const year = Number(form.get("year"));
  if (!Number.isInteger(year) || year < 2020 || year > 2100) redirect("/marketing");
  const rows = [];
  for (const ch of CHANNELS) for (let m = 1; m <= 12; m++) {
    const v = money(form.get(`b:${ch}:${m}`));
    if (v === null) redirect(`/marketing?year=${year}&err=amount`);
    rows.push({ year, month: m, channel: ch, amount: v, updated_at: new Date().toISOString() });
  }
  const { error } = await db().from("marketing_budget").upsert(rows);
  if (error) redirect(`/marketing?year=${year}&err=${encodeURIComponent(error.message)}`);
  await audit(s.id, "marketing.budget", "marketing_budget", null, { year, total: rows.reduce((a, r) => a + r.amount, 0) });
  revalidatePath("/marketing");
  redirect(`/marketing?year=${year}&ok=1`);
}

/** Add or change a campaign. */
export async function saveCampaignAction(form: FormData) {
  const s = await editor();
  const id = isId(form.get("id")) ? String(form.get("id")) : null;
  const back = (err?: string) => redirect(id ? `/marketing/campaigns/${id}?${err ? `err=${err}` : "ok=1"}` : `/marketing/campaigns?${err ? `err=${err}` : "ok=1"}`);
  const name = txt(form.get("name"), 200);
  if (!name) return back("name");
  const channel = String(form.get("channel") ?? "");
  if (!(CHANNELS as readonly string[]).includes(channel)) return back("channel");
  const start = day(form.get("start_on"));
  if (!start) return back("start");
  const end = day(form.get("end_on"));
  if (end && end < start) return back("end");
  const budget = money(form.get("budget")), spend = money(form.get("spend_manual"));
  if (budget === null || spend === null) return back("amount");
  const status = String(form.get("status") ?? "planned");
  const row = {
    name, channel, start_on: start, end_on: end, budget, spend_manual: spend,
    status: (CAMPAIGN_STATUSES as readonly string[]).includes(status) ? status : "planned",
    discount_code: txt(form.get("discount_code"), 60) || null, goal: txt(form.get("goal"), 300), notes: String(form.get("notes") ?? "").trim().slice(0, 1000),
    updated_at: new Date().toISOString(),
  };
  if (id) {
    const { error } = await db().from("marketing_campaigns").update(row).eq("id", id);
    if (error) return back("amount");
    await audit(s.id, "marketing.campaign_update", "marketing_campaign", id, { name });
  } else {
    const { data, error } = await db().from("marketing_campaigns").insert({ ...row, created_by: s.id }).select("id").single();
    if (error || !data) return back("amount");
    await audit(s.id, "marketing.campaign_create", "marketing_campaign", data.id, { name });
  }
  revalidatePath("/marketing");
  revalidatePath("/marketing/campaigns");
  back();
}

/** "Read from Meta now". */
export async function syncMetaAction() {
  const s = await editor();
  const r = await runMetaSync();
  await audit(s.id, "marketing.meta_sync", "marketing_campaign", null, r.ok ? { campaigns: r.campaigns, days: r.days } : { error: r.error });
  revalidatePath("/marketing/campaigns");
  redirect(r.ok ? `/marketing/campaigns?meta=${r.campaigns}-${r.days}` : `/marketing/campaigns?merr=${encodeURIComponent(r.error)}`);
}
