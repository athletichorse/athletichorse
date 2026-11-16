import "server-only";
import { db } from "./supabase/admin";
import type { Dict } from "@/i18n";

export const PAYROLL_COLS = (P: Dict["pay"]) => [
  { key: "base", label: P.base, money: true }, { key: "days_present", label: P.present }, { key: "lates", label: P.lates },
  { key: "late_deduction", label: P.lateDed, money: true }, { key: "absences", label: P.absences }, { key: "unexcused", label: P.unexcused },
  { key: "absence_deduction", label: P.absenceDed, money: true }, { key: "overtime_hours", label: P.overtime }, { key: "overtime_pay", label: P.overtimePay, money: true },
  { key: "bonuses", label: P.bonuses, money: true }, { key: "deductions", label: P.deductions, money: true }, { key: "advance_deduction", label: P.advanceDed, money: true },
  { key: "advance_left", label: P.advanceLeft, money: true }, { key: "net", label: P.net, money: true },
];
export const COMMISSION_COLS = (P: Dict["pay"]) => [
  { key: "sales", label: P.sales, money: true }, { key: "rate_text", label: P.rate }, { key: "commission", label: P.commission, money: true },
  { key: "regularity_bonus", label: P.regularity, money: true }, { key: "food_allowance", label: P.food, money: true }, { key: "total", label: P.total, money: true },
];

/** Status + rows of a month sheet with names. */
export async function loadSheet(sheet: "payroll" | "commission", month: string) {
  const { data: m } = await db().from(sheet === "payroll" ? "payroll_months" : "commission_months").select("status").eq("month", month).maybeSingle();
  const { data: lines } = await db().from(sheet === "payroll" ? "payroll_lines" : "commission_lines").select("*").eq("month", month);
  const ids = (lines ?? []).map((l) => l.profile_id);
  const { data: people } = ids.length ? await db().from("profiles").select("id, full_name").in("id", ids) : { data: [] };
  const rows = (lines ?? []).map((l) => ({
    profileId: l.profile_id as string,
    name: people?.find((p) => p.id === l.profile_id)?.full_name ?? "—",
    values: { ...l, rate_text: `${Math.round(Number(l.rate ?? 0) * 1_000_000) / 1000}/1000` } as Record<string, string | number>,
    amount: String(sheet === "payroll" ? l.net : l.total),
    paidVia: (l.paid_via as string | null) ?? null,
  })).sort((a, b) => a.name.localeCompare(b.name));
  return { status: (m?.status ?? null) as "draft" | "approved" | "paid" | null, rows };
}
