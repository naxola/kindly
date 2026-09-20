import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Geist_Mono, Inter, Literata } from "next/font/google";
import "./globals.css";
import { company } from "@/config/company";

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

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="es"
      className={`${inter.variable} ${literata.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
