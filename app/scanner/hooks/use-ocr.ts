import { Dispatch, SetStateAction, useState } from "react";
import { recognizePage, setOcrProgressListener, type OcrResult } from "../ocr";
import type { Notify, ScanPage, SetBusy } from "../types";

export function useOcr(
  pages: ScanPage[],
  setPages: Dispatch<SetStateAction<ScanPage[]>>,
  selectedId: string | null,
  setSelectedId: (id: string | null) => void,
  notify: Notify,
  setBusy: SetBusy,
) {
  const [ocrOpen, setOcrOpen] = useState(false);

  const recognizePages = async (targets: ScanPage[]) => {
    const recognized = new Map<string, OcrResult>();
    let activeIndex = 0;
    const targetIds = new Set(targets.map((target) => target.id));
    setPages((current) => current.map((page) => targetIds.has(page.id) ? { ...page, ocrStatus: "running" } : page));
    try {
      setOcrProgressListener((event) => {
        if (event.status === "recognizing text") {
          setBusy(`Reading page ${activeIndex + 1} of ${targets.length}… ${Math.round((event.progress ?? 0) * 100)}%`);
        }
      });
      for (let index = 0; index < targets.length; index += 1) {
        activeIndex = index;
        const target = targets[index];
        setBusy(`Reading page ${index + 1} of ${targets.length}…`);
        const latest = pages.find((page) => page.id === target.id) ?? target;
        const result = await recognizePage(latest);
        recognized.set(target.id, result);
        setPages((current) => current.map((page) => page.id === target.id ? {
          ...page,
          ocr: result.text,
          ocrLines: result.lines,
          ocrLayoutVersion: 1,
          ocrStatus: "done",
        } : page));
      }
      return recognized;
    } catch (error) {
      setPages((current) => current.map((page) => targetIds.has(page.id) && page.ocrStatus === "running" ? { ...page, ocrStatus: "error" } : page));
      throw error;
    } finally {
      setOcrProgressListener(null);
    }
  };

  const runOcr = async (targetIds?: string[]) => {
    const ids = targetIds?.length ? targetIds : selectedId ? [selectedId] : [];
    const targets = pages.filter((page) => ids.includes(page.id));
    if (!targets.length) return;
    if (targets.length === 1) {
      setSelectedId(targets[0].id);
      setOcrOpen(true);
    }
    try {
      await recognizePages(targets);
      notify(`OCR finished on ${targets.length} page${targets.length === 1 ? "" : "s"}.`);
    } catch {
      notify("OCR could not finish. Try a clearer or higher-contrast scan.");
    } finally {
      setBusy(null);
    }
  };

  const copyOcr = async () => {
    const selected = pages.find((page) => page.id === selectedId);
    if (!selected?.ocr) return;
    await navigator.clipboard.writeText(selected.ocr);
    notify("Recognized text copied.");
  };

  return { ocrOpen, setOcrOpen, recognizePages, runOcr, copyOcr };
}
