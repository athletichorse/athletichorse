import { requirePermission } from "@/lib/auth";
import { getDict } from "@/lib/locale";
import { db } from "@/lib/supabase/admin";
import { riyadhDate } from "@/lib/time";
import { monthParam } from "@/components/StaffTabs";
import { COMMISSION_COLS, PAYROLL_COLS, loadSheet } from "@/lib/pay-sheets";
import { AutoPrint } from "@/components/AutoPrint";

export const dynamic = "force-dynamic";

/** One slip per employee; only lines with a value, plus the advance still owed. */
export default async function SlipsPage({ searchParams }: { searchParams: Promise<{ sheet?: string; month?: string; p?: string }> }) {
  await requirePermission("staff.payroll");
  const { t } = await getDict();
  const sp = await searchParams;
  const sheet = sp.sheet === "commission" ? "commission" : "payroll";
  const month = monthParam(sp.month, riyadhDate(new Date()));
  const { rows } = await loadSheet(sheet, month);
  const { data: c } = await db().from("company").select("legal_name_ar, legal_name_en, logo_url").eq("id", 1).maybeSingle();
  const cols = (sheet === "payroll" ? PAYROLL_COLS : COMMISSION_COLS)(t.pay);
  const list = sp.p ? rows.filter((r) => r.profileId === sp.p) : rows;
  return (
    <div className="space-y-6">
      <AutoPrint mode="a4" />
      {list.map((r) => (
        <article key={r.profileId} className="card mx-auto max-w-md break-after-page">
          <header className="mb-3 flex items-center justify-between border-b border-[var(--line)] pb-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={c?.logo_url && /^https:\/\//.test(c.logo_url) ? c.logo_url : "/brand/logo.png"} alt="" className="h-10 w-auto" />
            <div className="text-end text-xs"><div className="font-semibold">{c?.legal_name_ar} · {c?.legal_name_en}</div><div>{sheet === "payroll" ? t.pay.slip : t.pay.tabs.commission} · {month.slice(0, 7)}</div></div>
          </header>
          <h2 className="mb-2 font-semibold">{r.name}</h2>
          <dl className="space-y-1 text-sm">
            {cols.filter((col) => col.key !== "rate_text" && Number(r.values[col.key] ?? 0) !== 0 && col.key !== "net" && col.key !== "total").map((col) => (
              <div key={col.key} className="flex justify-between"><dt className="text-gray-600">{col.label}</dt><dd dir="ltr">{col.money ? Number(r.values[col.key]).toFixed(2) : r.values[col.key]}</dd></div>
            ))}
            <div className="flex justify-between border-t border-[var(--line)] pt-2 text-base font-semibold"><dt>{sheet === "payroll" ? t.pay.net : t.pay.total}</dt><dd dir="ltr">{Number(r.amount).toFixed(2)} SAR</dd></div>
            {sheet === "payroll" && Number(r.values.advance_left ?? 0) > 0 && <div className="flex justify-between text-xs text-gray-600"><dt>{t.pay.advanceLeft}</dt><dd dir="ltr">{Number(r.values.advance_left).toFixed(2)}</dd></div>}
          </dl>
          <div className="mt-8 flex justify-between text-xs text-gray-500"><span>{t.pay.employee}: ____________</span><span>{t.pay.approve}: ____________</span></div>
        </article>
      ))}
    </div>
  );
}
