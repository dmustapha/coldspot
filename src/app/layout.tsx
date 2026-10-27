import type { Metadata } from "next";
import {
  Schibsted_Grotesk,
  Public_Sans,
  Spline_Sans_Mono,
} from "next/font/google";
import "./globals.css";

// The three voices: sharp cold grotesk for display, the regulatory-document
// face for body (this is an insurance record), mono for citations and numerals.
const display = Schibsted_Grotesk({
  subsets: ["latin"],
  weight: ["500", "700", "800"],
  variable: "--font-display",
});
const body = Public_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-body",
});
const mono = Spline_Sans_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-mono",
});

// Absolute base for OG / Twitter images. Defaults to the production host so a shared link resolves
// og:image to the live site, not localhost. Override locally with NEXT_PUBLIC_SITE_URL in .env.local.
const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://coldspot-agent.duckdns.org";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "COLDSPOT · coverage discovery agent",
  description:
    "Discovers which scattered systems govern a disputed claim, federates them through one governed Zetaris query, and reasons coverage with Nemotron. When a required fact is missing, it abstains and names it.",
  icons: { icon: "/icon.svg" },
  openGraph: {
    title: "COLDSPOT · coverage discovery agent",
    description: "Finds the one coverage fact the lamp cannot warm.",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "COLDSPOT" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "COLDSPOT · coverage discovery agent",
    description: "Finds the one coverage fact the lamp cannot warm.",
    images: ["/og.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
