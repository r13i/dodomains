import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { PostHogProvider } from "../components/PostHogProvider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "dodomains | Free LLM-Powered Domain Name Generator",
  description:
    "The first 100% free domain generator to use ChatGPT and other large language models to create highly creative and available domain names for your project. Bring your own API key.",
  keywords: [
    "free domain generator",
    "LLM domain generator",
    "ChatGPT domain names",
    "AI domain generator",
    "domain availability checker",
    "creative domain names",
  ],
  authors: [{ name: "dodomains team" }],
  openGraph: {
    title: "dodomains | Free LLM-Powered Domain Name Generator",
    description:
      "The first 100% free domain generator to use ChatGPT and other large language models to create highly creative and available domain names for your project. Bring your own API key.",
    url: "https://dodomains.dev",
    siteName: "dodomains",
    images: [
      {
        url: "/logo.jpeg",
        width: 800,
        height: 800,
        alt: "dodomains logo - a cartoon dodo with yellow rays on an orange background",
      },
    ],
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "dodomains | Free LLM-Powered Domain Name Generator",
    description:
      "The first 100% free domain generator to use ChatGPT and other LLMs for truly creative domain suggestions with real-time availability.",
    images: ["/logo.jpeg"],
    creator: "@redouane_cc",
  },
  robots: {
    index: true,
    follow: true,
  },
  metadataBase: new URL("https://dodomains.dev"),
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <PostHogProvider>{children}</PostHogProvider>
      </body>
    </html>
  );
}
