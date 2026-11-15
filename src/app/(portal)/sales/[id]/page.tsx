import Link from "next/link";
import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { canUseLocation, requirePermission } from "@/lib/auth";
import { getDict } from "@/lib/locale";
import { db } from "@/lib/supabase/admin";
import { code128Svg } from "@/lib/barcode";
import { formatDateTime, formatHijri } from "@/lib/time";
import { PageHeader } from "@/components/PageHeader";
import { AutoPrint } from "@/components/AutoPrint";

const m = (v: string | number) => Number(v).toFixed(2);

export default async function InvoicePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ print?: string }> }) {
  const me = await requirePermission("sales.view");
  const { t, locale } = await getDict();
  const { id } = await params;
  const sp = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { data: inv } = await db().from("invoices").select("*").eq("id", id).maybeSingle();
  if (!inv || (!me.perms.has("sales.view_all_branches") && !canUseLocation(me, inv.location_id))) notFound();
  const [{ data: lines }, { data: pays }, { data: company }, { data: loc }, { data: people }, { data: cust }, { data: orig }, { data: methods }] = await Promise.all([
    db().from("invoice_lines").select("*").eq("invoice_id", id).order("line_no"),
    db().from("invoice_payments").select("method, amount").eq("invoice_id", id).order("line_no"),
    db().from("company").select("*").eq("id", 1).maybeSingle(),
    db().from("locations").select("name_en, name_ar, address_en, address_ar").eq("id", inv.location_id).maybeSingle(),
    db().from("profiles").select("id, full_name").in("id", [inv.cashier_id, inv.salesperson_id].filter(Boolean)),
    inv.customer_id ? db().from("customers").select("name, phone, customer_no, vat_number").eq("id", inv.customer_id).maybeSingle() : Promise.resolve({ data: null }),
    inv.original_invoice_id ? db().from("invoices").select("number").eq("id", inv.original_invoice_id).maybeSingle() : Promise.resolve({ data: null }),
    db().from("payment_methods").select("code, name_en, name_ar"),
  ]);
  const qrSvg = await QRCode.toString(inv.qr, { type: "svg", errorCorrectionLevel: "M", margin: 0, width: 150 });
  const barcode = code128Svg(inv.number, 42, 1.4);
  const who = (pid: string | null) => people?.find((x) => x.id === pid)?.full_name ?? "—";
  const isCN = inv.kind === "credit_note";
  const issued = new Date(inv.issued_at);
  const methodName = (c: string) => { const x = methods?.find((y) => y.code === c); return x ? (locale === "ar" ? x.name_ar : x.name_en) : c; };
  const both = (en: string, ar: string) => (<><span>{ar}</span> <span className="text-gray-500">{en}</span></>);

  return (
    <>
      <div className="no-print">
        <PageHeader title={inv.number} t={t} filename={inv.number}>
          <Link href="/sales" className="btn-ghost">← {t.sales.title}</Link>
        </PageHeader>
      </div>
      {sp.print && <AutoPrint mode="receipt80" />}
      <article className="receipt mx-auto max-w-[80mm] bg-white p-3 text-[12px] leading-snug text-black" dir="rtl">
        <header className="text-center">
          {company?.logo_url && /^https:\/\//.test(company.logo_url) && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={company.logo_url} alt="" className="mx-auto mb-1 h-12 w-auto" />
          )}
          <div className="text-[14px] font-bold">{company?.legal_name_ar}</div>
          <div className="font-semibold" dir="ltr">{company?.legal_name_en}</div>
          <div>{loc?.name_ar} · {loc?.address_ar || company?.address_ar}</div>
          <div>الرقم الضريبي / VAT No.: <span dir="ltr">{inv.seller_vat}</span></div>
          {company?.cr_number && <div>السجل التجاري / CR No.: <span dir="ltr">{company.cr_number}</span></div>}
          <div className="my-2 border-y border-black py-1 text-[13px] font-bold">
            {isCN ? both("Credit Note", "إشعار دائن") : both("Simplified Tax Invoice", "فاتورة ضريبية مبسطة")}
          </div>
        </header>
        <div className="space-y-0.5">
          <div className="flex justify-between"><span>رقم {isCN ? "الإشعار" : "الفاتورة"} / No.</span><b dir="ltr">{inv.number}</b></div>
          {orig && <div className="flex justify-between"><span>الفاتورة الأصلية / Original</span><b dir="ltr">{orig.number}</b></div>}
          <div className="flex justify-between"><span>التاريخ / Date</span><span dir="ltr">{formatDateTime(issued, "en")}</span></div>
          <div className="flex justify-between"><span>هجري</span><span>{formatHijri(issued, "ar")}</span></div>
          <div className="flex justify-between"><span>الكاشير / Cashier</span><span>{who(inv.cashier_id)}</span></div>
          {inv.salesperson_id && <div className="flex justify-between"><span>البائع / Salesperson</span><span>{who(inv.salesperson_id)}</span></div>}
          {cust && <div className="flex justify-between"><span>العميل / Customer</span><span>{cust.name || ""} <span dir="ltr">{cust.phone}</span> #{cust.customer_no}</span></div>}
          {cust?.vat_number && <div className="flex justify-between"><span>رقم العميل الضريبي</span><span dir="ltr">{cust.vat_number}</span></div>}
          {inv.offline_temp_no && <div className="flex justify-between"><span>رقم مؤقت / Offline</span><span dir="ltr">{inv.offline_temp_no}</span></div>}
        </div>
        <table className="mt-2 w-full border-t border-black text-[11px]">
          <thead><tr className="border-b border-black"><th className="py-1 text-start">الصنف Item</th><th>الكمية</th><th>السعر</th><th className="text-end">المبلغ</th></tr></thead>
          <tbody>
            {(lines ?? []).map((l) => (
              <tr key={l.line_no} className="align-top">
                <td className="py-0.5">{l.name}{l.sku && <div dir="ltr" className="text-[10px]">{l.sku}</div>}{Number(l.discount) > 0 && <div className="text-[10px]">خصم / Disc. {m(l.discount)}</div>}</td>
                <td className="text-center">{Number(l.qty)}</td>
                <td className="text-center">{m(l.unit_price)}</td>
                <td className="text-end">{m(l.gross)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="mt-2 space-y-0.5 border-t border-black pt-1">
          <div className="flex justify-between"><span>الإجمالي قبل الضريبة / Excl. VAT</span><span>{m(inv.net_total)}</span></div>
          <div className="flex justify-between"><span>ضريبة القيمة المضافة {Number(inv.vat_rate)}% / VAT</span><span>{m(inv.vat_total)}</span></div>
          <div className="flex justify-between text-[14px] font-bold"><span>الإجمالي شامل الضريبة / Total</span><span>{m(inv.gross_total)} ر.س</span></div>
          {(pays ?? []).map((pp, i) => <div key={i} className="flex justify-between"><span>{methodName(pp.method)}</span><span>{m(pp.amount)}</span></div>)}
          {Number(inv.change_given) > 0 && <div className="flex justify-between"><span>الباقي / Change</span><span>{m(inv.change_given)}</span></div>}
        </div>
        <div className="mt-3 flex flex-col items-center gap-2">
          <div className="h-[150px] w-[150px]" dangerouslySetInnerHTML={{ __html: qrSvg }} />
          <div className="w-full overflow-hidden" dangerouslySetInnerHTML={{ __html: barcode }} />
          <div dir="ltr" className="font-mono">{inv.number}</div>
          <div className="text-center">شكرًا لتسوقكم معنا · Thank you</div>
          {!isCN && <div className="text-center text-[10px]">الاسترجاع خلال 3 أيام مع هذا الإيصال · Returns within 3 days with this receipt</div>}
        </div>
      </article>
    </>
  );
}
