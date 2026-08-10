import { Crop, FileText, LockKeyhole } from "lucide-react";
import Link from "next/link";

export function SeoContent() {
  return <section className="seo-content" id="about-scannow" aria-labelledby="about-scannow-title">
    <div className="seo-inner">
      <p className="eyebrow">Free private PDF scanner</p>
      <h2 id="about-scannow-title">Scan documents to searchable PDF in your browser</h2>
      <p className="seo-lede">ScanNow! turns camera photos or existing images into clean, correctly ordered PDFs. Cropping, image cleanup, OCR, local saving, and PDF creation happen on your device. Your document pages are not uploaded to a ScanNow! server.</p>
      <div className="seo-grid">
        <article><Crop size={23} /><h3>Crop and clean scans</h3><p>Detect page edges, correct perspective, rotate pages, and choose color, grayscale, or black-and-white output.</p></article>
        <article><FileText size={23} /><h3>Create searchable PDFs</h3><p>On-device OCR places an invisible text layer over the matching words so exported PDFs can be searched and copied.</p></article>
        <article><LockKeyhole size={23} /><h3>Keep documents private</h3><p>Use the scanner without creating an account. Saved projects stay in this browser and can remain available offline.</p></article>
      </div>
      <div className="seo-columns">
        <div><h3>How to scan a document</h3><ol><li>Add pages with your camera or image library.</li><li>Review the automatic crop and page order.</li><li>Choose PDF options and download the finished file.</li></ol></div>
        <div><h3>Common questions</h3><details><summary>Are scanned pages uploaded?</summary><p>No. Document processing and PDF creation run in the browser on your device.</p></details><details><summary>Can ScanNow! make searchable PDFs?</summary><p>Yes. Local OCR records where each line appears and adds aligned invisible text to the exported PDF.</p></details><details><summary>Does it work offline?</summary><p>After the app and OCR resources have loaded, ScanNow! can scan, edit, recognize text, and export without a network connection.</p></details></div>
      </div>
      <footer><span>ScanNow! is a browser-based document scanner and PDF creator.</span><Link href="/privacy">Privacy</Link></footer>
    </div>
  </section>;
}
