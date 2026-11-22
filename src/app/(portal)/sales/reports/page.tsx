import Link from "next/link";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth";
import { getDict } from "@/lib/locale";
import { PageHeader } from "@/components/PageHeader";
import type { PermissionKey } from "@/lib/permissions";

export const dynamic = "force-dynamic";

type CardKey = keyof import("@/i18n").Dict["rep"]["cards"];
type Card = { key: CardKey; href: string; perm?: PermissionKey };

/** All reports on one page, in groups of cards; each card opens its report. Only the ones this person may open. */
export default async function ReportsHub() {
  const me = await requireStaff();
  if (!me.perms.has("reports.view")) redirect("/forbidden?k=reports.view");
  const { t } = await getDict();
  const P = t.rep;
  const groups: { key: keyof typeof P.groups; cards: Card[] }[] = [
    { key: "sales", cards: [
      { key: "sales", href: "/sales/reports/sales#day" }, { key: "salespeople", href: "/sales/reports/sales#salesperson" }, { key: "customers", href: "/sales/reports/sales#customer" },
      { key: "best", href: "/sales/reports/sales#best" }, { key: "least", href: "/sales/reports/sales#least" }, { key: "items", href: "/sales/reports/sales#items" },
      { key: "analysis", href: "/sales/reports/analysis" }, { key: "invoices", href: "/sales/reports/invoices" },
    ] },
    { key: "treasury", cards: [
      { key: "treasury", href: "/sales/reports/treasury" }, { key: "collections", href: "/sales/reports/treasury#collections" },
      { key: "endOfDay", href: "/pos/day", perm: "pos.past_shifts" }, { key: "shifts", href: "/pos/shifts", perm: "pos.past_shifts" },
    ] },
    { key: "people", cards: [
      { key: "commission", href: "/staff/commission", perm: "staff.payroll" }, { key: "attendance", href: "/staff/attendance", perm: "staff.salespeople" },
    ] },
    { key: "stock", cards: [
      { key: "itemHistory", href: "/sales/reports/sales#history" }, { key: "stockLog", href: "/stock-log", perm: "stock.log" },
      { key: "shortages", href: "/stock/shortages", perm: "stock.view" }, { key: "stockValue", href: "/stock", perm: "stock.view" },
    ] },
    { key: "customers", cards: [
      { key: "b2b", href: "/sales/reports/b2b", perm: "sales.b2b" }, { key: "website", href: "/sales/orders", perm: "sales.website_orders" },
      { key: "courier", href: "/sales/collections", perm: "sales.website_orders" },
    ] },
    { key: "purchasing", cards: [{ key: "purchases", href: "/sales/reports/purchases", perm: "purchasing.view" }] },
  ];
  const shown = groups.map((g) => ({ ...g, cards: g.cards.filter((c) => !c.perm || me.perms.has(c.perm)) })).filter((g) => g.cards.length);
  return (
    <>
      <PageHeader title={P.hubTitle} subtitle={P.hubHint} t={t} />
      <nav className="no-print mb-6 flex flex-wrap gap-2">
        {shown.map((g) => <a key={g.key} href={`#g-${g.key}`} className="btn-ghost rounded-full py-1.5">{P.groups[g.key]}</a>)}
      </nav>
      <div className="space-y-8" data-testid="reports-hub">
        {shown.map((g) => (
          <section key={g.key} id={`g-${g.key}`}>
            <h2 className="mb-3 text-lg font-semibold">{P.groups[g.key]}</h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {g.cards.map((c) => (
                <Link key={c.key} href={c.href} className="card block transition hover:border-[var(--brand)] hover:shadow-md" data-report={c.key}>
                  <div className="font-semibold">{P.cards[c.key][0]}</div>
                  <p className="mt-1 text-sm text-gray-500">{P.cards[c.key][1]}</p>
                </Link>
              ))}
            </div>
          </section>
        ))}
      </div>
    </>
  );
}
