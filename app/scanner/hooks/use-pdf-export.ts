import { Dispatch, SetStateAction, useState } from "react";
import { cleanPdfName, defaultDocumentName } from "../format";
import { downloadPdf } from "../pdf-export";
import type { Notify, ScanPage, SetBusy } from "../types";
import type { OcrResult } from "../ocr";

export function usePdfExport(
  pages: ScanPage[],
  setPages: Dispatch<SetStateAction<ScanPage[]>>,
  recognizePages: (targets: ScanPage[]) => Promise<Map<string, OcrResult>>,
  notify: Notify,
  setBusy: SetBusy,
) {
  const [downloadOpen, setDownloadOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [pdfBuilding, setPdfBuilding] = useState(false);
  const [pdfName, setPdfName] = useState(defaultDocumentName);
  const [pageSize, setPageSize] = useState<"letter" | "a4">("letter");
  const [quality, setQuality] = useState(88);
  const [searchable, setSearchable] = useState(true);

  const exportText = () => {
    const text = pages.map((page, index) => `PAGE ${index + 1}\n${page.ocr || "[No OCR text]"}`).join("\n\n");
    const anchor = document.createElement("a");
    anchor.href = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
    anchor.download = `${pdfName || "scanned-document"}.txt`;
    anchor.click();
    URL.revokeObjectURL(anchor.href);
  };

  const exportPdf = async (confirmedName: string) => {
    if (!pages.length) return;
    setSettingsOpen(false);
    setDownloadOpen(false);
    setPdfBuilding(true);
    try {
      let exportPages = pages;
      if (searchable) {
        const missingOcr = pages.filter((page) => page.ocrLayoutVersion !== 1);
        if (missingOcr.length) {
          try {
            const recognized = await recognizePages(missingOcr);
            exportPages = pages.map((page) => {
              const result = recognized.get(page.id);
              return result ? { ...page, ocr: result.text, ocrLines: result.lines, ocrLayoutVersion: 1, ocrStatus: "done" as const } : page;
            });
            setPages(exportPages);
          } catch {
            notify("Searchable PDF export stopped because OCR did not finish. Retry or turn off searchable text.");
            return;
          }
        }
      }
      await downloadPdf(exportPages, { name: confirmedName, pageSize, quality, searchable, onProgress: setBusy });
      notify("PDF downloaded. No page data was uploaded.");
    } catch {
      notify("The PDF could not be created. Try reducing image quality.");
    } finally {
      setBusy(null);
      setPdfBuilding(false);
    }
  };

  const confirmPdfDownload = () => {
    const cleanName = cleanPdfName(pdfName);
    setPdfName(cleanName);
    void exportPdf(cleanName);
  };

  return {
    downloadOpen, setDownloadOpen, settingsOpen, setSettingsOpen, pdfBuilding,
    pdfName, setPdfName, pageSize, setPageSize, quality, setQuality,
    searchable, setSearchable, exportText, confirmPdfDownload,
  };
}
