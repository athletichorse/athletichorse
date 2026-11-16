import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { db } from "@/lib/supabase/admin";
import { getLocale } from "@/lib/locale";
import { ReceiptView } from "@/components/ReceiptView";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Receipt · الفاتورة", robots: { index: false, follow: false } };

/** The customer's receipt: no login, found only by its long random token. */
export default async function PublicReceipt({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[A-Za-z0-9_-]{24,64}$/.test(token)) notFound();
  const { data: inv } = await db().from("invoices").select("*").eq("public_token", token).maybeSingle();
  if (!inv) notFound();
  const locale = await getLocale();
  return (
    <main className="min-h-screen bg-white py-6">
      <ReceiptView inv={inv} locale={locale} />
    </main>
  );
}
