import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "ScanNow! — Private PDF Scanner",
  description: "Scan, crop, clean, OCR, and export documents to PDF without uploading your pages.",
  other: { "codex-preview": "development" },
  manifest: "/manifest.webmanifest",
  themeColor: "#4C4B63",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "ScanNow!" },
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg", apple: "/app-icon-192.png" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body className={`${geistSans.variable} ${geistMono.variable}`}>{children}</body></html>;
}
