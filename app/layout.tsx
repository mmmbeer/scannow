import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
const siteUrl = "https://scanner.fairway3games.com";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  applicationName: "ScanNow!",
  title: { default: "ScanNow! — Free Private PDF Scanner", template: "%s | ScanNow!" },
  description: "Scan documents with your camera, crop and clean pages, run private on-device OCR, and export searchable PDFs without uploading your files.",
  keywords: ["PDF scanner", "document scanner", "scan to PDF", "searchable PDF", "OCR scanner", "private document scanner", "online PDF scanner", "camera scanner"],
  alternates: { canonical: "/" },
  category: "productivity",
  creator: "ScanNow!",
  publisher: "ScanNow!",
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1, "max-video-preview": -1 },
  },
  openGraph: {
    type: "website",
    url: siteUrl,
    siteName: "ScanNow!",
    title: "ScanNow! — Free Private PDF Scanner",
    description: "Create clean, searchable PDFs in your browser. Your document pages stay on your device.",
    images: [{ url: "/app-icon-512.png", width: 512, height: 512, alt: "ScanNow! private PDF scanner" }],
  },
  twitter: {
    card: "summary",
    title: "ScanNow! — Free Private PDF Scanner",
    description: "Scan, clean, OCR, and export searchable PDFs without uploading your pages.",
    images: ["/app-icon-512.png"],
  },
  other: { "codex-preview": "development" },
  manifest: "/manifest.webmanifest",
  themeColor: "#4C4B63",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "ScanNow!" },
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg", apple: "/app-icon-192.png" },
};

const structuredData = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebSite",
      "@id": `${siteUrl}/#website`,
      url: siteUrl,
      name: "ScanNow!",
      description: "A private browser-based document scanner and searchable PDF creator.",
      inLanguage: "en-US",
    },
    {
      "@type": "WebApplication",
      "@id": `${siteUrl}/#application`,
      name: "ScanNow!",
      url: siteUrl,
      applicationCategory: "UtilitiesApplication",
      operatingSystem: "Any operating system with a modern web browser",
      browserRequirements: "Requires JavaScript. Camera permission is used only for camera capture. Local storage is used only when saving projects.",
      isAccessibleForFree: true,
      offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
      featureList: ["Multi-page camera scanning", "Perspective crop correction", "On-device OCR", "Searchable PDF export", "Offline use", "Device-local document library"],
      description: "Scan, crop, clean, recognize, and export document pages locally without uploading document content.",
    },
  ],
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en-US"><body className={`${geistSans.variable} ${geistMono.variable}`}><script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }} />{children}</body></html>;
}
