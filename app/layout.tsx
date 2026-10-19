import type { Metadata, Viewport } from "next";
import { Heebo, Plus_Jakarta_Sans } from "next/font/google";
import { AuthProvider } from "@/components/auth-provider";
import { I18nProvider } from "@/lib/i18n/client";
import { getLocale } from "@/lib/i18n/server";
import { dirOf } from "@/lib/i18n/locale";
import "./globals.css";

const jakarta = Plus_Jakarta_Sans({ subsets: ["latin"], variable: "--font-jakarta", display: "swap" });
const heebo = Heebo({ subsets: ["hebrew", "latin"], variable: "--font-heebo", display: "swap" });

export const metadata: Metadata = {
  title: { default: "Prefly — Create games with AI", template: "%s · Prefly" },
  description: "Describe the game you want, and Prefly's AI agents design, draw, code and test it for you. Play, share and download 2D, 3D and multiplayer games.",
  applicationName: "Prefly",
};

export const viewport: Viewport = {
  themeColor: "#f8f8fc",
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  return (
    <html lang={locale} dir={dirOf(locale)} className={`${jakarta.variable} ${heebo.variable}`}>
      <body className="font-sans">
        <I18nProvider locale={locale}>
          <AuthProvider>{children}</AuthProvider>
        </I18nProvider>
      </body>
    </html>
  );
}
