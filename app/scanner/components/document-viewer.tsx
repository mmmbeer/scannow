import { Archive, ChevronLeft, ChevronRight, Crop, FileImage, FilePlus2, FileText, LoaderCircle, RotateCw, ScanLine, Sparkles, WifiOff, ZoomIn, ZoomOut } from "lucide-react";
import { PointerEvent, useEffect, useRef, useState } from "react";
import type { ScanPage } from "../types";
import { ToolButton } from "./common";

export function EmptyScanner({ hasDocuments, openAddPages, showLibrary }: { hasDocuments: boolean; openAddPages: () => void; showLibrary: () => void }) {
  return <div className="empty-state">
    <div className="empty-visual" aria-hidden="true"><span className="paper paper-back" /><span className="paper paper-front"><span className="scan-beam" /><ScanLine size={62} /></span></div>
    <p className="eyebrow">Private document scanner</p>
    <h2>Turn paper into a polished PDF</h2>
    <p className="empty-copy">Photograph pages continuously or choose existing images. Processing runs behind the camera and saved documents remain on this device, even offline.</p>
    <div className="empty-actions">
      <button className="button primary large" onClick={openAddPages}><FilePlus2 size={21} /> Add pages</button>
      {hasDocuments && <button className="button secondary large" onClick={showLibrary}><Archive size={21} /> Open library</button>}
    </div>
    <div className="drop-hint"><FileImage size={17} /> You can also drop images here or paste from the clipboard</div>
    <div className="feature-row"><span><Crop size={16} /> Auto crop</span><span><Sparkles size={16} /> Clean up</span><span><FileText size={16} /> Local OCR</span><span><WifiOff size={16} /> Works offline</span></div>
  </div>;
}

export function DocumentViewer({ page, pageCount, pageIndex, previewUrl, checkedPageIds, selectRelativePage, updatePage, openCrop, runOcr }: {
  page: ScanPage;
  pageCount: number;
  pageIndex: number;
  previewUrl: string | null;
  checkedPageIds: string[];
  selectRelativePage: (direction: -1 | 1) => void;
  updatePage: (changes: Partial<ScanPage>) => void;
  openCrop: () => void;
  runOcr: (ids: string[]) => void;
}) {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [interacting, setInteracting] = useState(false);
  const stageRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const zoomValue = useRef(1);
  const panValue = useRef({ x: 0, y: 0 });
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{
    mode: "pending" | "pan" | "pinch";
    primaryId: number;
    startPoint: { x: number; y: number };
    startPan: { x: number; y: number };
    startZoom: number;
    startDistance?: number;
    anchor?: { x: number; y: number };
  } | null>(null);
  const lastTap = useRef<{ time: number; x: number; y: number } | null>(null);

  useEffect(() => {
    zoomValue.current = 1;
    panValue.current = { x: 0, y: 0 };
    pointers.current.clear();
    gesture.current = null;
    const timer = window.setTimeout(() => {
      setZoom(1);
      setPan({ x: 0, y: 0 });
      setInteracting(false);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [page.id]);

  const constrainPan = (candidate: { x: number; y: number }, nextZoom: number) => {
    const stage = stageRef.current;
    const image = imageRef.current;
    if (!stage || !image || nextZoom <= 1) return { x: 0, y: 0 };
    const maxX = Math.max(0, (image.offsetWidth * nextZoom - Math.max(1, stage.clientWidth - 28)) / 2 + 24);
    const maxY = Math.max(0, (image.offsetHeight * nextZoom - Math.max(1, stage.clientHeight - 92)) / 2 + 24);
    return { x: Math.max(-maxX, Math.min(maxX, candidate.x)), y: Math.max(-maxY, Math.min(maxY, candidate.y)) };
  };

  const applyTransform = (nextZoom: number, candidatePan: { x: number; y: number }) => {
    const clampedZoom = Math.max(0.5, Math.min(4, nextZoom));
    const nextPan = constrainPan(candidatePan, clampedZoom);
    zoomValue.current = clampedZoom;
    panValue.current = nextPan;
    setZoom(clampedZoom);
    setPan(nextPan);
  };

  const zoomAt = (nextZoom: number, clientX?: number, clientY?: number) => {
    const stage = stageRef.current;
    if (!stage || clientX === undefined || clientY === undefined) {
      applyTransform(nextZoom, nextZoom <= 1 ? { x: 0, y: 0 } : panValue.current);
      return;
    }
    const rect = stage.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const localX = (clientX - centerX - panValue.current.x) / zoomValue.current;
    const localY = (clientY - centerY - panValue.current.y) / zoomValue.current;
    applyTransform(nextZoom, { x: clientX - centerX - localX * nextZoom, y: clientY - centerY - localY * nextZoom });
  };

  const beginGesture = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const points = Array.from(pointers.current.entries());
    if (points.length === 1) {
      gesture.current = { mode: "pending", primaryId: event.pointerId, startPoint: { x: event.clientX, y: event.clientY }, startPan: panValue.current, startZoom: zoomValue.current };
      return;
    }
    const [, first] = points[0];
    const [, second] = points[1];
    const midpoint = { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 };
    const rect = stageRef.current?.getBoundingClientRect();
    const centerX = rect ? rect.left + rect.width / 2 : midpoint.x;
    const centerY = rect ? rect.top + rect.height / 2 : midpoint.y;
    lastTap.current = null;
    gesture.current = {
      mode: "pinch", primaryId: points[0][0], startPoint: midpoint, startPan: panValue.current, startZoom: zoomValue.current,
      startDistance: Math.max(1, Math.hypot(second.x - first.x, second.y - first.y)),
      anchor: { x: (midpoint.x - centerX - panValue.current.x) / zoomValue.current, y: (midpoint.y - centerY - panValue.current.y) / zoomValue.current },
    };
    setInteracting(true);
  };

  const moveGesture = (event: PointerEvent<HTMLDivElement>) => {
    if (!pointers.current.has(event.pointerId) || !gesture.current) return;
    event.preventDefault();
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const points = Array.from(pointers.current.values());
    if (points.length >= 2) {
      const [first, second] = points;
      const midpoint = { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 };
      const distance = Math.max(1, Math.hypot(second.x - first.x, second.y - first.y));
      const rect = stageRef.current?.getBoundingClientRect();
      const centerX = rect ? rect.left + rect.width / 2 : midpoint.x;
      const centerY = rect ? rect.top + rect.height / 2 : midpoint.y;
      const nextZoom = gesture.current.startZoom * distance / Math.max(1, gesture.current.startDistance ?? distance);
      const anchor = gesture.current.anchor ?? { x: 0, y: 0 };
      applyTransform(nextZoom, { x: midpoint.x - centerX - anchor.x * nextZoom, y: midpoint.y - centerY - anchor.y * nextZoom });
      return;
    }
    const deltaX = event.clientX - gesture.current.startPoint.x;
    const deltaY = event.clientY - gesture.current.startPoint.y;
    if (zoomValue.current > 1.01 && (gesture.current.mode === "pan" || Math.hypot(deltaX, deltaY) > 5)) {
      gesture.current.mode = "pan";
      setInteracting(true);
      applyTransform(gesture.current.startZoom, { x: gesture.current.startPan.x + deltaX, y: gesture.current.startPan.y + deltaY });
    }
  };

  const finishGesture = (event: PointerEvent<HTMLDivElement>) => {
    const currentGesture = gesture.current;
    const point = pointers.current.get(event.pointerId) ?? { x: event.clientX, y: event.clientY };
    pointers.current.delete(event.pointerId);
    if (pointers.current.size) {
      const [remainingId, remaining] = Array.from(pointers.current.entries())[0];
      gesture.current = { mode: "pan", primaryId: remainingId, startPoint: remaining, startPan: panValue.current, startZoom: zoomValue.current };
      return;
    }
    gesture.current = null;
    setInteracting(false);
    if (!currentGesture || currentGesture.primaryId !== event.pointerId || currentGesture.mode !== "pending") return;
    const deltaX = point.x - currentGesture.startPoint.x;
    const deltaY = point.y - currentGesture.startPoint.y;
    if (Math.hypot(deltaX, deltaY) < 10) {
      const now = performance.now();
      if (lastTap.current && now - lastTap.current.time < 320 && Math.hypot(point.x - lastTap.current.x, point.y - lastTap.current.y) < 28) {
        lastTap.current = null;
        zoomAt(zoomValue.current > 1.01 ? 1 : 2, point.x, point.y);
      } else lastTap.current = { time: now, x: point.x, y: point.y };
    } else if (zoomValue.current <= 1.01 && Math.abs(deltaX) >= 55 && Math.abs(deltaX) > Math.abs(deltaY) * 1.35) {
      selectRelativePage(deltaX < 0 ? 1 : -1);
    }
  };

  return <>
    <div className="canvas-toolbar">
      <div className="page-navigation">
        <button className="icon-button" onClick={() => selectRelativePage(-1)} disabled={pageIndex === 0} aria-label="Previous page"><ChevronLeft size={18} /></button>
        <div><span className="page-label">Page {pageIndex + 1} of {pageCount}</span><span className="source-label">{page.name}</span></div>
        <button className="icon-button" onClick={() => selectRelativePage(1)} disabled={pageIndex === pageCount - 1} aria-label="Next page"><ChevronRight size={18} /></button>
      </div>
      <div className="zoom-controls"><button className="icon-button" onClick={() => zoomAt(zoomValue.current - 0.25)} aria-label="Zoom out"><ZoomOut size={18} /></button><button className="zoom-value" onClick={() => applyTransform(1, { x: 0, y: 0 })} aria-label="Reset zoom and pan">{Math.round(zoom * 100)}%</button><button className="icon-button" onClick={() => zoomAt(zoomValue.current + 0.25)} aria-label="Zoom in"><ZoomIn size={18} /></button></div>
    </div>
    <div ref={stageRef} className="document-stage" onPointerDown={beginGesture} onPointerMove={moveGesture} onPointerUp={finishGesture} onPointerCancel={() => { pointers.current.clear(); gesture.current = null; setInteracting(false); }}>
      {previewUrl ? <img ref={imageRef} className={`document-preview ${interacting ? "interacting" : ""}`} style={{ transform: `translate3d(${pan.x}px, ${pan.y}px, 0) scale(${zoom})` }} src={previewUrl} alt={`Processed page ${pageIndex + 1}`} draggable={false} /> : <LoaderCircle className="spin" size={34} />}
      <span className="swipe-hint" aria-hidden="true">{zoom > 1.01 ? "Drag to pan · pinch to zoom" : pageCount > 1 ? "Swipe pages · pinch to zoom" : "Pinch or double-tap to zoom"}</span>
    </div>
    <div className="mobile-tool-strip">
      <ToolButton label="Crop" onClick={openCrop}><Crop size={19} /></ToolButton>
      <ToolButton label="Rotate" onClick={() => updatePage({ rotation: (page.rotation + 90) % 360 })}><RotateCw size={19} /></ToolButton>
      <ToolButton label="Enhance" onClick={() => updatePage({ filter: page.filter === "enhance" ? "color" : "enhance" })} active={page.filter === "enhance"}><Sparkles size={19} /></ToolButton>
      <ToolButton label={checkedPageIds.length > 1 ? `OCR ${checkedPageIds.length}` : "OCR"} onClick={() => runOcr(checkedPageIds.length ? checkedPageIds : [page.id])}><FileText size={19} /></ToolButton>
    </div>
  </>;
}
