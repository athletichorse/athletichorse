import type { Metadata, Viewport } from "next";
import "./globals.css";
import { dirOf } from "@/i18n";
import { getLocale } from "@/lib/locale";

export const metadata: Metadata = {
  title: "بوابة الموظفين | Staff Portal",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { themeColor: "#0f6b4f" };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  return (
    <html lang={locale} dir={dirOf(locale)}>
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
