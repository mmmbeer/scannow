import type { jsPDF as JsPDF } from "jspdf";
import { renderPage } from "./image-processing";
import type { OcrLine, ScanPage } from "./types";

let pdfModulePromise: Promise<typeof import("jspdf")> | null = null;

function getPdfModule() {
  if (!pdfModulePromise) pdfModulePromise = import("jspdf");
  return pdfModulePromise;
}

function positionedLines(page: ScanPage): OcrLine[] {
  const lines = page.ocrLines ?? [];
  if (!lines.length) return [];
  const normalize = (value: string) => value.replace(/\s+/g, " ").trim();
  if (normalize(lines.map((line) => line.text).join(" ")) === normalize(page.ocr)) return lines;

  const words = page.ocr.trim().split(/\s+/).filter(Boolean);
  let cursor = 0;
  return lines.map((line, index) => {
    if (index === lines.length - 1) return { ...line, text: words.slice(cursor).join(" ") };
    const targetLength = Math.max(1, line.text.trim().length);
    const lineWords: string[] = [];
    let length = 0;
    while (cursor < words.length && (length < targetLength || !lineWords.length)) {
      const word = words[cursor++];
      lineWords.push(word);
      length += word.length + 1;
    }
    return { ...line, text: lineWords.join(" ") };
  }).filter((line) => line.text);
}

function addOcrLayer(pdf: JsPDF, page: ScanPage, x: number, y: number, width: number, height: number) {
  pdf.setFont("helvetica", "normal");
  for (const line of positionedLines(page)) {
    const lineWidth = Math.max(0.1, line.width * width);
    const lineHeight = Math.max(0.1, line.height * height);
    pdf.setFontSize(Math.max(1, lineHeight * 72 / 25.4));
    const naturalWidth = pdf.getTextWidth(line.text);
    pdf.text(line.text, x + line.x * width, y + line.y * height, {
      baseline: "top",
      horizontalScale: naturalWidth > 0 ? Math.max(0.15, Math.min(6, lineWidth / naturalWidth)) : 1,
      renderingMode: "invisible",
    });
  }
}

export type PdfExportOptions = {
  name: string;
  pageSize: "letter" | "a4";
  quality: number;
  searchable: boolean;
  onProgress: (message: string) => void;
};

export async function downloadPdf(pages: ScanPage[], options: PdfExportOptions) {
  const { jsPDF } = await getPdfModule();
  const size = options.pageSize === "a4" ? [210, 297] : [215.9, 279.4];
  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: size, compress: true });
  for (let index = 0; index < pages.length; index += 1) {
    options.onProgress(`Preparing page ${index + 1} of ${pages.length}…`);
    const page = pages[index];
    const maxDimension = options.quality > 90 ? 2800 : options.quality > 75 ? 2200 : 1600;
    const canvas = await renderPage(page, maxDimension);
    if (index > 0) pdf.addPage(size, "portrait");
    const margin = 5;
    const ratio = Math.min((size[0] - margin * 2) / canvas.width, (size[1] - margin * 2) / canvas.height);
    const width = canvas.width * ratio;
    const height = canvas.height * ratio;
    const x = (size[0] - width) / 2;
    const y = (size[1] - height) / 2;
    pdf.addImage(canvas.toDataURL("image/jpeg", options.quality / 100), "JPEG", x, y, width, height, undefined, "FAST");
    if (options.searchable && page.ocr && page.ocrLayoutVersion === 1) addOcrLayer(pdf, page, x, y, width, height);
  }
  pdf.setProperties({ title: options.name, subject: "Created locally in ScanNow!", creator: "ScanNow!" });
  pdf.save(`${options.name}.pdf`);
}
