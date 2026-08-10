import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy",
  description: "How ScanNow! keeps document scanning, OCR, saved projects, and PDF creation on your device.",
  alternates: { canonical: "/privacy" },
};

export default function PrivacyPage() {
  return <main className="policy-page"><article><Link href="/" className="policy-brand">← ScanNow!</Link><p className="eyebrow">Privacy</p><h1>Your documents stay on your device</h1><p>ScanNow! processes page images, crop adjustments, image cleanup, OCR, and PDF creation in your browser. ScanNow! does not send document pages or recognized document text to a ScanNow! server.</p><h2>Camera and images</h2><p>Camera permission is requested only when you choose camera capture. Images you select or photograph are read locally by the browser.</p><h2>Local document library</h2><p>If you choose Save locally, the project is stored in this browser’s device storage. It is not synchronized to another device or account. You can delete saved documents from the local library or clear the site’s storage through your browser.</p><h2>Offline resources</h2><p>The app may cache its interface, OCR language data, and processing code so scanning can work offline. These cached resources do not contain your documents.</p><h2>Network information</h2><p>Like other websites, the hosting service may receive ordinary request information needed to deliver the app, such as an IP address, browser type, and requested files. Document content remains local.</p><h2>Your control</h2><p>You control downloads, local saves, camera permission, and deletion. Removing site data from your browser removes locally saved ScanNow! projects on that device.</p><footer><Link href="/">Open the scanner</Link><span>Last updated August 9, 2026</span></footer></article></main>;
}
