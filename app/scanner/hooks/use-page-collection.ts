import { DragEvent, useEffect, useMemo, useRef, useState } from "react";
import { detectDocumentCorners } from "../edge-detection";
import { fileToPage, insetCorners, renderPage } from "../image-processing";
import type { Notify, ScanPage, SetBusy } from "../types";

export function revokePages(items: ScanPage[]) {
  items.forEach((page) => {
    if (page.source.startsWith("blob:")) URL.revokeObjectURL(page.source);
  });
}

export function usePageCollection(notify: Notify, setBusy: SetBusy) {
  const [pages, setPages] = useState<ScanPage[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [checkedPageIds, setCheckedPageIds] = useState<string[]>([]);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const renderSequence = useRef(0);
  const draggedPageId = useRef<string | null>(null);
  const dragTargetId = useRef<string | null>(null);

  const selected = useMemo(
    () => pages.find((page) => page.id === selectedId) ?? pages[0] ?? null,
    [pages, selectedId],
  );
  const selectedIndex = selected ? pages.findIndex((page) => page.id === selected.id) : -1;

  useEffect(() => {
    if (!selected) return;
    const sequence = ++renderSequence.current;
    const timer = window.setTimeout(async () => {
      try {
        const canvas = await renderPage(selected, 1500);
        if (sequence === renderSequence.current) setPreviewUrl(canvas.toDataURL("image/jpeg", 0.9));
      } catch {
        if (sequence === renderSequence.current) setPreviewUrl(selected.source);
      }
    }, 80);
    return () => window.clearTimeout(timer);
  }, [selected]);

  const updateSelected = (changes: Partial<ScanPage>) => {
    if (!selected) return;
    const geometryChanged = "corners" in changes || "rotation" in changes || "flipX" in changes || "flipY" in changes;
    setPages((current) => current.map((page) => page.id === selected.id ? {
      ...page,
      ...(geometryChanged ? { ocrLines: [], ocrLayoutVersion: 0, ocrStatus: page.ocr ? "idle" as const : page.ocrStatus } : {}),
      ...changes,
    } : page));
  };

  const processPage = async (pageId: string, file: File) => {
    setPages((current) => current.map((page) => page.id === pageId ? { ...page, processingStatus: "processing" } : page));
    try {
      const corners = await detectDocumentCorners(file);
      setPages((current) => current.map((page) => page.id === pageId ? { ...page, corners, processingStatus: "ready" } : page));
    } catch {
      setPages((current) => current.map((page) => page.id === pageId ? { ...page, corners: insetCorners(), processingStatus: "error" } : page));
    }
  };

  const addFiles = async (files: File[]) => {
    const imageFiles = files.filter((file) => file.type.startsWith("image/"));
    if (!imageFiles.length) {
      notify("Choose an image file such as JPEG, PNG, HEIC, or WebP.");
      return [];
    }
    try {
      const additions = await Promise.all(imageFiles.map((file) => fileToPage(file)));
      setPages((current) => [...current, ...additions]);
      setSelectedId(additions[additions.length - 1]?.id ?? null);
      additions.forEach((page, index) => void processPage(page.id, imageFiles[index]));
      return additions.map((page) => page.id);
    } catch (error) {
      console.error("ScanNow image import failed", error);
      notify("One or more images could not be opened.");
      return [];
    }
  };

  const redetect = async () => {
    if (!selected) return null;
    setBusy("Finding page edges…");
    try {
      const response = await fetch(selected.source);
      if (!response.ok) throw new Error("Image could not be read");
      const corners = await detectDocumentCorners(await response.blob());
      updateSelected({ corners });
      notify("Page edges updated. Drag any corner to refine the crop.");
      return corners;
    } catch {
      notify("Edges were unclear. Adjust the four crop handles manually.");
      return null;
    } finally {
      setBusy(null);
    }
  };

  const removePage = (id: string) => {
    const index = pages.findIndex((page) => page.id === id);
    const removed = pages[index];
    if (removed?.source.startsWith("blob:")) URL.revokeObjectURL(removed.source);
    const remaining = pages.filter((page) => page.id !== id);
    setPages(remaining);
    setCheckedPageIds((current) => current.filter((pageId) => pageId !== id));
    if (selectedId === id) setSelectedId(remaining[Math.min(index, remaining.length - 1)]?.id ?? null);
  };

  const movePage = (id: string, direction: -1 | 1) => {
    setPages((current) => {
      const from = current.findIndex((page) => page.id === id);
      const to = from + direction;
      if (from < 0 || to < 0 || to >= current.length) return current;
      const next = [...current];
      [next[from], next[to]] = [next[to], next[from]];
      return next;
    });
  };

  const reorderPage = (sourceId: string | null, targetId: string | null) => {
    if (!sourceId || !targetId || sourceId === targetId) return;
    setPages((current) => {
      const next = [...current];
      const from = next.findIndex((page) => page.id === sourceId);
      const to = next.findIndex((page) => page.id === targetId);
      if (from < 0 || to < 0) return current;
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      return next;
    });
  };

  const beginPageDrag = (pageId: string) => {
    draggedPageId.current = pageId;
    dragTargetId.current = pageId;
    setDraggedId(pageId);
    setDragOverId(pageId);
  };

  const finishPageDrag = () => {
    draggedPageId.current = null;
    dragTargetId.current = null;
    setDraggedId(null);
    setDragOverId(null);
  };

  const resetPages = () => {
    revokePages(pages);
    setPages([]);
    setCheckedPageIds([]);
    setSelectedId(null);
    setPreviewUrl(null);
  };

  return {
    pages, setPages, selected, selectedId, selectedIndex, setSelectedId,
    previewUrl, setPreviewUrl, checkedPageIds, setCheckedPageIds,
    draggedId, dragOverId, setDragOverId, draggedPageId, dragTargetId,
    addFiles, updateSelected, redetect, removePage, movePage, reorderPage,
    beginPageDrag, finishPageDrag, resetPages,
    toggleCheckedPage: (id: string) => setCheckedPageIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]),
    toggleAllPages: () => setCheckedPageIds((current) => current.length === pages.length ? [] : pages.map((page) => page.id)),
    selectRelativePage: (direction: -1 | 1) => {
      const nextIndex = selectedIndex + direction;
      if (nextIndex >= 0 && nextIndex < pages.length) setSelectedId(pages[nextIndex].id);
    },
    onDrop: (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      void addFiles(Array.from(event.dataTransfer.files));
    },
  };
}
