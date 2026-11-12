import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Geist_Mono, Inter, Literata } from "next/font/google";
import "./globals.css";
import { company } from "@/config/company";
import { getThemePreference } from "@/components/shell/theme-cookie";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

// The serif is the product's document voice: it appears on the copilot's
// citations and on the legal pages, never as a marketing display face.
const literata = Literata({
  variable: "--font-literata",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(company.siteUrl),
  title: {
    default: "Kindly — La bandeja de tu despacho, con la norma citada",
    template: "%s",
  },
  description:
    "Bandeja unificada de WhatsApp y Telegram para despachos y gestorías. Cada conversación con su contacto, su caso y su historial.",
  openGraph: {
    type: "website",
    locale: "es_ES",
    siteName: company.productName,
    url: company.siteUrl,
  },
  robots: { index: true, follow: true },
  other: {
    // Meta asks you to prove you own the domain before it can be used for
    // business verification, and the meta-tag method is the one that needs
    // no access to DNS. Set FACEBOOK_DOMAIN_VERIFICATION to the token from
    // Business Manager → Brand safety → Domains.
    ...(process.env.FACEBOOK_DOMAIN_VERIFICATION
      ? { "facebook-domain-verification": process.env.FACEBOOK_DOMAIN_VERIFICATION }
      : {}),
  },
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  // UI-8 (docs/ui/ROADMAP.md "Fase 8"): read on the server so the very
  // first paint — public site or app — already carries the right
  // `data-theme`, no client-side flash. "system" needs no attribute at
  // all: tokens.css falls back to `prefers-color-scheme` on its own.
  const theme = await getThemePreference();

  return (
    <html
      lang="es"
      data-theme={theme === "system" ? undefined : theme}
      className={`${inter.variable} ${literata.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
