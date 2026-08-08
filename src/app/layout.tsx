import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import { PostHogProvider } from "../components/PostHogProvider";
import {
  DESCRIPTION,
  SEO_KEYWORDS,
  SITE_NAME,
  SITE_URL,
  TAGLINE,
} from "@/src/lib/site";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const TITLE = `${SITE_NAME} | ${TAGLINE}`;

// No `images` key on openGraph or twitter: the cards are generated at
// src/app/opengraph-image.tsx and src/app/twitter-image.tsx, and Next wires
// them up by file convention. Setting `images` here would override them with
// a static file and reintroduce the drift this replaced.
export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  keywords: SEO_KEYWORDS,
  applicationName: SITE_NAME,
  authors: [{ name: "redouane", url: "https://x.com/redouane_cc" }],
  creator: "redouane",
  publisher: SITE_NAME,
  alternates: { canonical: "/" },
  category: "technology",
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: SITE_URL,
    siteName: SITE_NAME,
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
    creator: "@redouane_cc",
    site: "@redouane_cc",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  metadataBase: new URL(SITE_URL),
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {/*
          JSON-LD for search results. Next's documented pattern. Every value is
          a compile-time constant from src/lib/site.ts — no user input reaches
          this string, so there is no injection surface. Keep it that way: if
          this ever needs a dynamic value, escape "<" before it goes in.
        */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "WebApplication",
              name: SITE_NAME,
              url: SITE_URL,
              description: DESCRIPTION,
              applicationCategory: "DeveloperApplication",
              operatingSystem: "Any",
              featureList: [
                "LLM-powered domain name generation",
                "Bring your own API key",
                "Domain availability checking",
                "MCP server for AI agents",
              ],
              offers: {
                "@type": "Offer",
                price: "0",
                priceCurrency: "USD",
              },
              author: {
                "@type": "Person",
                name: "redouane",
                url: "https://x.com/redouane_cc",
              },
            }),
          }}
        />
        <PostHogProvider>{children}</PostHogProvider>
        {/* Ahrefs web analytics. Loads async after hydration. */}
        <Script
          src="https://analytics.ahrefs.com/analytics.js"
          data-key="VNYPFL1piMTVz98aGmZo+Q"
          strategy="afterInteractive"
        />
      </body>
    </html>
  );
}
