import { Copy, Download, FileText, ScanLine, Sparkles, Trash2 } from "lucide-react";
import type { ScanPage } from "../types";
import { Modal } from "./common";

export function DownloadDialog({ open, onClose, name, setName, pages, pageSize, searchable, confirm }: {
  open: boolean;
  onClose: () => void;
  name: string;
  setName: (name: string) => void;
  pages: ScanPage[];
  pageSize: "letter" | "a4";
  searchable: boolean;
  confirm: () => void;
}) {
  if (!open) return null;
  return <Modal eyebrow="Ready to export" title="Confirm the PDF filename" onClose={onClose} className="download-modal" bodyClassName="form-body" footer={<><button className="button secondary" onClick={onClose}>Cancel</button><button className="button primary" onClick={confirm} disabled={!name.trim()}><Download size={17} /> Build PDF</button></>}>
    <label><span>File name</span><div className="suffix-input"><input autoFocus value={name} onChange={(event) => setName(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && name.trim()) confirm(); }} aria-label="PDF filename" /><span>.pdf</span></div></label>
    <div className="export-summary"><FileText size={22} /><span><strong>{pages.length} page{pages.length === 1 ? "" : "s"} · {pageSize === "a4" ? "A4" : "US Letter"}</strong><small>{searchable ? "Searchable OCR text will be included" : "Image-only PDF"}</small></span></div>
  </Modal>;
}

export function OcrDialog({ open, page, pageIndex, busy, onClose, rerun, copy, updateText }: {
  open: boolean;
  page: ScanPage | null;
  pageIndex: number;
  busy: boolean;
  onClose: () => void;
  rerun: () => void;
  copy: () => void;
  updateText: (text: string) => void;
}) {
  if (!open || !page) return null;
  return <Modal eyebrow="On-device OCR" title={`Recognized text · Page ${pageIndex + 1}`} onClose={onClose} className="ocr-modal" footer={<><button className="button secondary" onClick={rerun} disabled={busy}><ScanLine size={17} /> Run again</button><div className="footer-right"><button className="button secondary" onClick={copy} disabled={!page.ocr}><Copy size={17} /> Copy</button><button className="button primary" onClick={onClose}>Done</button></div></>}>
    {page.ocrStatus === "running" ? <div className="ocr-loading"><p>Reading printed text in your browser…</p></div> : <textarea value={page.ocr} onChange={(event) => updateText(event.target.value)} placeholder="Run OCR to extract text from this page." aria-label="Recognized text" />}
  </Modal>;
}

export function PdfOptionsDialog({ open, onClose, pages, name, setName, pageSize, setPageSize, quality, setQuality, searchable, setSearchable, clearSession, exportText, openDownload, runAllOcr, busy }: {
  open: boolean;
  onClose: () => void;
  pages: ScanPage[];
  name: string;
  setName: (name: string) => void;
  pageSize: "letter" | "a4";
  setPageSize: (size: "letter" | "a4") => void;
  quality: number;
  setQuality: (quality: number) => void;
  searchable: boolean;
  setSearchable: (value: boolean) => void;
  clearSession: () => void;
  exportText: () => void;
  openDownload: () => void;
  runAllOcr: () => void;
  busy: boolean;
}) {
  if (!open) return null;
  return <Modal eyebrow="Export" title="PDF options" onClose={onClose} className="options-modal" bodyClassName="form-body" footer={<><button className="button ghost danger-text" onClick={clearSession}><Trash2 size={17} /> Clear session</button><div className="footer-right"><button className="button secondary" onClick={exportText} disabled={!pages.some((page) => page.ocr)}>Save text</button><button className="button primary" onClick={openDownload}><Download size={17} /> Download PDF</button></div></>}>
    <label><span>File name</span><div className="suffix-input"><input value={name} onChange={(event) => setName(event.target.value)} /><span>.pdf</span></div></label>
    <div className="field-grid">
      <label><span>Page size</span><select value={pageSize} onChange={(event) => setPageSize(event.target.value as "letter" | "a4")}><option value="letter">US Letter</option><option value="a4">A4</option></select></label>
      <label><span>Image quality</span><select value={quality} onChange={(event) => setQuality(Number(event.target.value))}><option value="68">Compact</option><option value="88">Balanced</option><option value="96">High</option></select></label>
    </div>
    <label className="check-row"><input type="checkbox" checked={searchable} onChange={(event) => setSearchable(event.target.checked)} /><span><strong>Include searchable OCR text</strong><small>Missing pages are recognized automatically before the PDF is created.</small></span></label>
    <div className="export-summary"><FileText size={22} /><span><strong>{pages.length} uniformly sized page{pages.length === 1 ? "" : "s"}</strong><small>{pages.filter((page) => page.ocr).length} of {pages.length} pages have OCR text</small></span></div>
    {pages.some((page) => page.ocrLayoutVersion !== 1) && searchable && <button className="text-action" onClick={runAllOcr} disabled={busy}><Sparkles size={17} /> Run OCR on all pages now</button>}
  </Modal>;
}
