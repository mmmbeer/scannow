"use client";

import {
  Archive,
  ArrowDown,
  ArrowUp,
  Camera,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  Crop,
  Download,
  FileImage,
  FilePlus2,
  FileText,
  Files,
  FlipHorizontal2,
  FlipVertical2,
  FolderOpen,
  GripVertical,
  HardDrive,
  ImagePlus,
  LoaderCircle,
  LockKeyhole,
  MoreHorizontal,
  Plus,
  RotateCcw,
  RotateCw,
  Save,
  ScanLine,
  Search,
  Smartphone,
  Sparkles,
  Trash2,
  Wifi,
  WifiOff,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { ChangeEvent, DragEvent, PointerEvent, useEffect, useId, useMemo, useRef, useState } from "react";
import {
  deleteDocument as deleteLibraryDocument,
  LibraryDocument,
  listDocuments,
  loadDocument as loadLibraryDocument,
  requestPersistentStorage,
  saveDocument,
} from "./local-library";

type Point = { x: number; y: number };
type FilterMode = "color" | "enhance" | "gray" | "bw";
type ScanPage = {
  id: string;
  name: string;
  source: string;
  width: number;
  height: number;
  corners: Point[];
  rotation: number;
  flipX: boolean;
  flipY: boolean;
  filter: FilterMode;
  brightness: number;
  contrast: number;
  ocr: string;
  ocrStatus: "idle" | "running" | "done" | "error";
  processingStatus: "queued" | "processing" | "ready" | "error";
};

type Toast = { id: number; message: string };
type StorageStatus = { persisted: boolean; usage: number; quota: number };
type ConfirmDialog = {
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm: () => void | Promise<void>;
  danger?: boolean;
};

type InstallPrompt = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

type EdgeWorkerReply = { id: string; corners?: Point[]; error?: string };
const edgeRequests = new Map<string, { resolve: (corners: Point[]) => void; reject: (error: Error) => void; timer: number }>();
let edgeWorker: Worker | null = null;

function createLocalId() {
  return typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 11)}`;
}

function stopEdgeWorker(message: string) {
  const worker = edgeWorker;
  edgeWorker = null;
  worker?.terminate();
  edgeRequests.forEach((request) => {
    window.clearTimeout(request.timer);
    request.reject(new Error(message));
  });
  edgeRequests.clear();
}

function getEdgeWorker() {
  if (!edgeWorker) {
    edgeWorker = new Worker("/scan-worker.js");
    edgeWorker.onmessage = (event: MessageEvent<EdgeWorkerReply>) => {
      const request = edgeRequests.get(event.data.id);
      if (!request) return;
      window.clearTimeout(request.timer);
      edgeRequests.delete(event.data.id);
      if (event.data.error || !event.data.corners) request.reject(new Error(event.data.error || "Edge detection failed"));
      else request.resolve(event.data.corners);
    };
    edgeWorker.onerror = () => stopEdgeWorker("Background edge detection worker stopped");
    edgeWorker.onmessageerror = () => stopEdgeWorker("Background edge detection worker returned an unreadable result");
  }
  return edgeWorker;
}

function detectDocumentCornersInWorker(blob: Blob): Promise<Point[]> {
  const id = createLocalId();
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      if (edgeRequests.has(id)) stopEdgeWorker("Background edge detection timed out");
    }, 12000);
    edgeRequests.set(id, { resolve, reject, timer });
    getEdgeWorker().postMessage({ id, blob });
  });
}

type LocalOcrWorker = { recognize: (image: HTMLCanvasElement) => Promise<{ data: { text: string } }> };
type OcrProgressEvent = { status: string; progress?: number };
let ocrModulePromise: Promise<typeof import("tesseract.js")> | null = null;
let ocrWorkerPromise: Promise<LocalOcrWorker> | null = null;
let ocrProgressListener: ((event: OcrProgressEvent) => void) | null = null;
let pdfModulePromise: Promise<typeof import("jspdf")> | null = null;

const insetCorners = (): Point[] => [
  { x: 0.012, y: 0.012 },
  { x: 0.988, y: 0.012 },
  { x: 0.988, y: 0.988 },
  { x: 0.012, y: 0.988 },
];

function withTimeout<T>(promise: Promise<T>, milliseconds: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error(message)), milliseconds);
    promise.then(
      (value) => { window.clearTimeout(timer); resolve(value); },
      (error) => { window.clearTimeout(timer); reject(error); },
    );
  });
}

function getOcrModule() {
  if (!ocrModulePromise) ocrModulePromise = import("tesseract.js");
  return ocrModulePromise;
}

function getOcrWorker(): Promise<LocalOcrWorker> {
  if (!ocrWorkerPromise) {
    const load = getOcrModule().then(({ createWorker }) => createWorker("eng", 1, {
      workerPath: "/tesseract/worker.min.js",
      corePath: "/tesseract/core/tesseract-core-lstm.wasm.js",
      langPath: "/tesseract/lang",
      logger: (event) => ocrProgressListener?.(event),
    })).then((worker) => worker as LocalOcrWorker);
    ocrWorkerPromise = withTimeout(load, 22000, "OCR startup timed out").catch((error) => {
      ocrWorkerPromise = null;
      throw error;
    });
  }
  return ocrWorkerPromise;
}

function getPdfModule() {
  if (!pdfModulePromise) pdfModulePromise = import("jspdf");
  return pdfModulePromise;
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });
}

function distance(a: Point, b: Point, width: number, height: number) {
  return Math.hypot((a.x - b.x) * width, (a.y - b.y) * height);
}

function quadPoint(corners: Point[], u: number, v: number, width: number, height: number): Point {
  const topX = corners[0].x + (corners[1].x - corners[0].x) * u;
  const topY = corners[0].y + (corners[1].y - corners[0].y) * u;
  const bottomX = corners[3].x + (corners[2].x - corners[3].x) * u;
  const bottomY = corners[3].y + (corners[2].y - corners[3].y) * u;
  return {
    x: (topX + (bottomX - topX) * v) * width,
    y: (topY + (bottomY - topY) * v) * height,
  };
}

function drawMappedTriangle(
  context: CanvasRenderingContext2D,
  source: HTMLCanvasElement,
  sourcePoints: [Point, Point, Point],
  targetPoints: [Point, Point, Point],
) {
  const [s0, s1, s2] = sourcePoints;
  const [d0, d1, d2] = targetPoints;
  const determinant = s0.x * (s1.y - s2.y) + s1.x * (s2.y - s0.y) + s2.x * (s0.y - s1.y);
  if (Math.abs(determinant) < 0.01) return;

  const a = (d0.x * (s1.y - s2.y) + d1.x * (s2.y - s0.y) + d2.x * (s0.y - s1.y)) / determinant;
  const c = (d0.x * (s2.x - s1.x) + d1.x * (s0.x - s2.x) + d2.x * (s1.x - s0.x)) / determinant;
  const e = (d0.x * (s1.x * s2.y - s2.x * s1.y) + d1.x * (s2.x * s0.y - s0.x * s2.y) + d2.x * (s0.x * s1.y - s1.x * s0.y)) / determinant;
  const b = (d0.y * (s1.y - s2.y) + d1.y * (s2.y - s0.y) + d2.y * (s0.y - s1.y)) / determinant;
  const d = (d0.y * (s2.x - s1.x) + d1.y * (s0.x - s2.x) + d2.y * (s1.x - s0.x)) / determinant;
  const f = (d0.y * (s1.x * s2.y - s2.x * s1.y) + d1.y * (s2.x * s0.y - s0.x * s2.y) + d2.y * (s0.x * s1.y - s1.x * s0.y)) / determinant;

  context.save();
  context.beginPath();
  context.moveTo(d0.x, d0.y);
  context.lineTo(d1.x, d1.y);
  context.lineTo(d2.x, d2.y);
  context.closePath();
  context.clip();
  context.transform(a, b, c, d, e, f);
  context.drawImage(source, 0, 0);
  context.restore();
}

function drawPerspectiveWarp(source: HTMLCanvasElement, target: HTMLCanvasElement, corners: Point[]) {
  const context = target.getContext("2d");
  if (!context) return;
  context.fillStyle = "#fff";
  context.fillRect(0, 0, target.width, target.height);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  const steps = Math.max(4, Math.min(7, Math.ceil(Math.max(target.width, target.height) / 450)));

  for (let row = 0; row < steps; row += 1) {
    const v0 = row / steps;
    const v1 = (row + 1) / steps;
    for (let column = 0; column < steps; column += 1) {
      const u0 = column / steps;
      const u1 = (column + 1) / steps;
      const s00 = quadPoint(corners, u0, v0, source.width, source.height);
      const s10 = quadPoint(corners, u1, v0, source.width, source.height);
      const s11 = quadPoint(corners, u1, v1, source.width, source.height);
      const s01 = quadPoint(corners, u0, v1, source.width, source.height);
      const d00 = { x: u0 * target.width, y: v0 * target.height };
      const d10 = { x: u1 * target.width, y: v0 * target.height };
      const d11 = { x: u1 * target.width, y: v1 * target.height };
      const d01 = { x: u0 * target.width, y: v1 * target.height };
      drawMappedTriangle(context, source, [s00, s10, s11], [d00, d10, d11]);
      drawMappedTriangle(context, source, [s00, s11, s01], [d00, d11, d01]);
    }
  }
}

async function renderPage(page: ScanPage, maxDimension = 2200): Promise<HTMLCanvasElement> {
  const image = await loadImage(page.source);
  const sourceScale = Math.min(1, maxDimension / Math.max(image.naturalWidth, image.naturalHeight));
  const sourceCanvas = document.createElement("canvas");
  sourceCanvas.width = Math.max(1, Math.round(image.naturalWidth * sourceScale));
  sourceCanvas.height = Math.max(1, Math.round(image.naturalHeight * sourceScale));
  sourceCanvas.getContext("2d")?.drawImage(image, 0, 0, sourceCanvas.width, sourceCanvas.height);

  const top = distance(page.corners[0], page.corners[1], sourceCanvas.width, sourceCanvas.height);
  const bottom = distance(page.corners[3], page.corners[2], sourceCanvas.width, sourceCanvas.height);
  const left = distance(page.corners[0], page.corners[3], sourceCanvas.width, sourceCanvas.height);
  const right = distance(page.corners[1], page.corners[2], sourceCanvas.width, sourceCanvas.height);
  const outputWidth = Math.max(120, Math.round(Math.max(top, bottom)));
  const outputHeight = Math.max(120, Math.round(Math.max(left, right)));
  const warpedCanvas = document.createElement("canvas");
  warpedCanvas.width = outputWidth;
  warpedCanvas.height = outputHeight;

  drawPerspectiveWarp(sourceCanvas, warpedCanvas, page.corners);

  const radians = (page.rotation * Math.PI) / 180;
  const swap = Math.abs(page.rotation % 180) === 90;
  const finalCanvas = document.createElement("canvas");
  finalCanvas.width = swap ? outputHeight : outputWidth;
  finalCanvas.height = swap ? outputWidth : outputHeight;
  const context = finalCanvas.getContext("2d", { willReadFrequently: true });
  if (!context) return warpedCanvas;
  context.save();
  context.translate(finalCanvas.width / 2, finalCanvas.height / 2);
  context.rotate(radians);
  context.scale(page.flipX ? -1 : 1, page.flipY ? -1 : 1);
  context.drawImage(warpedCanvas, -outputWidth / 2, -outputHeight / 2);
  context.restore();

  const imageData = context.getImageData(0, 0, finalCanvas.width, finalCanvas.height);
  const data = imageData.data;
  const brightness = page.brightness * 2.2;
  const contrast = (259 * (page.contrast + 255)) / (255 * (259 - page.contrast));
  for (let index = 0; index < data.length; index += 4) {
    let red = contrast * (data[index] - 128) + 128 + brightness;
    let green = contrast * (data[index + 1] - 128) + 128 + brightness;
    let blue = contrast * (data[index + 2] - 128) + 128 + brightness;
    if (page.filter === "enhance") {
      red = (red - 118) * 1.22 + 133;
      green = (green - 118) * 1.22 + 133;
      blue = (blue - 118) * 1.22 + 133;
    }
    if (page.filter === "gray" || page.filter === "bw") {
      const gray = red * 0.299 + green * 0.587 + blue * 0.114;
      red = gray;
      green = gray;
      blue = gray;
    }
    if (page.filter === "bw") {
      const value = red > 166 ? 255 : 0;
      red = value;
      green = value;
      blue = value;
    }
    data[index] = Math.max(0, Math.min(255, red));
    data[index + 1] = Math.max(0, Math.min(255, green));
    data[index + 2] = Math.max(0, Math.min(255, blue));
  }
  context.putImageData(imageData, 0, 0);
  return finalCanvas;
}

async function fileToPage(file: File): Promise<ScanPage> {
  const source = URL.createObjectURL(file);
  let width = 0;
  let height = 0;
  try {
    const bitmap = await createImageBitmap(file);
    width = bitmap.width;
    height = bitmap.height;
    bitmap.close();
  } catch {
    const image = await loadImage(source);
    width = image.naturalWidth;
    height = image.naturalHeight;
  }
  return {
    id: createLocalId(),
    name: file.name || "Camera capture",
    source,
    width,
    height,
    corners: insetCorners(),
    rotation: 0,
    flipX: false,
    flipY: false,
    filter: "enhance",
    brightness: 0,
    contrast: 12,
    ocr: "",
    ocrStatus: "idle",
    processingStatus: "queued",
  };
}

function formatBytes(bytes: number) {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const unit = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const value = bytes / Math.pow(1024, unit);
  return `${value >= 10 || unit === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[unit]}`;
}

function defaultDocumentName() {
  return `Scan ${new Date().toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`;
}

async function createThumbnail(page: ScanPage) {
  const canvas = await renderPage(page, 360);
  return canvas.toDataURL("image/jpeg", 0.72);
}

function ToolButton({ label, onClick, children, active = false, disabled = false }: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
  active?: boolean;
  disabled?: boolean;
}) {
  return (
    <button className={`tool-button ${active ? "active" : ""}`} onClick={onClick} title={label} aria-label={label} disabled={disabled}>
      {children}
      <span>{label}</span>
    </button>
  );
}

function Modal({
  eyebrow,
  title,
  onClose,
  children,
  footer,
  className = "",
  bodyClassName = "",
  backdropClassName = "",
  dark = false,
}: {
  eyebrow: string;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer: React.ReactNode;
  className?: string;
  bodyClassName?: string;
  backdropClassName?: string;
  dark?: boolean;
}) {
  const titleId = useId();

  useEffect(() => {
    const closeOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  return (
    <div
      className={`modal-backdrop ${backdropClassName}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}
    >
      <div className={`modal-card ${className}`} onMouseDown={(event) => event.stopPropagation()}>
        <div className={`modal-header ${dark ? "dark" : ""}`}>
          <div><p className="eyebrow">{eyebrow}</p><h2 id={titleId}>{title}</h2></div>
          <button className={`icon-button ${dark ? "dark-button" : ""}`} onClick={onClose} aria-label="Close dialog"><X size={21} /></button>
        </div>
        <div className={`modal-body ${bodyClassName}`}>{children}</div>
        <div className="modal-footer">{footer}</div>
      </div>
    </div>
  );
}

function pageActivity(page: ScanPage) {
  if (page.ocrStatus === "running") return "Reading text";
  if (page.processingStatus === "queued") return "Waiting to process";
  if (page.processingStatus === "processing") return "Detecting edges";
  if (page.processingStatus === "error") return "Crop needs review";
  if (page.ocrStatus === "done") return "OCR complete";
  return "Ready to edit";
}

function pageIsProcessing(page: ScanPage) {
  return page.processingStatus === "queued" || page.processingStatus === "processing" || page.ocrStatus === "running";
}

function AppLoader({ message, progress }: { message: string; progress: number }) {
  return (
    <main className="app-loader" role="status" aria-live="polite" aria-label="Preparing ScanNow">
      <div className="loader-content">
        <img className="loader-wordmark" src="/scannow-logo.svg" alt="ScanNow!" />
        <div className="loader-scanner" aria-hidden="true">
          <div className="loader-paper"><span /><span /><span /><span /></div>
          <div className="loader-device"><img src="/scannow-mark.svg" alt="" /><i /></div>
          <div className="loader-laser" />
        </div>
        <strong>Preparing your private scanner</strong>
        <p>{message}</p>
        <div className="loader-progress" aria-hidden="true"><span style={{ width: `${progress}%` }} /></div>
        <small>Advanced tools load only when you choose them, keeping startup light.</small>
      </div>
    </main>
  );
}

export default function Home() {
  const [appReady, setAppReady] = useState(false);
  const [startupMessage, setStartupMessage] = useState("Opening your local workspace…");
  const [startupProgress, setStartupProgress] = useState(68);
  const [pages, setPages] = useState<ScanPage[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const [cropOpen, setCropOpen] = useState(false);
  const [ocrOpen, setOcrOpen] = useState(false);
  const [addPagesOpen, setAddPagesOpen] = useState(false);
  const [downloadOpen, setDownloadOpen] = useState(false);
  const [pdfBuilding, setPdfBuilding] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [installHelpOpen, setInstallHelpOpen] = useState(false);
  const [pdfName, setPdfName] = useState(defaultDocumentName);
  const [pageSize, setPageSize] = useState<"letter" | "a4">("letter");
  const [quality, setQuality] = useState(88);
  const [searchable, setSearchable] = useState(true);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [viewerInteracting, setViewerInteracting] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialog | null>(null);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [checkedPageIds, setCheckedPageIds] = useState<string[]>([]);
  const [mobileRail, setMobileRail] = useState(false);
  const [documents, setDocuments] = useState<LibraryDocument[]>([]);
  const [librarySearch, setLibrarySearch] = useState("");
  const [currentDocumentId, setCurrentDocumentId] = useState<string | null>(null);
  const [currentDocumentCreatedAt, setCurrentDocumentCreatedAt] = useState<number | undefined>();
  const [storageStatus, setStorageStatus] = useState<StorageStatus>({ persisted: false, usage: 0, quota: 0 });
  const [installPrompt, setInstallPrompt] = useState<InstallPrompt | null>(null);
  const [isStandalone, setIsStandalone] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const [cameraSessionIds, setCameraSessionIds] = useState<string[]>([]);
  const [cameraFlash, setCameraFlash] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const documentStageRef = useRef<HTMLDivElement>(null);
  const previewImageRef = useRef<HTMLImageElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const renderSequence = useRef(0);
  const toastCounter = useRef(0);
  const draggedPageId = useRef<string | null>(null);
  const dragTargetId = useRef<string | null>(null);
  const zoomValue = useRef(1);
  const panValue = useRef({ x: 0, y: 0 });
  const viewerPointers = useRef(new Map<number, { x: number; y: number }>());
  const viewerGesture = useRef<{
    mode: "pending" | "pan" | "pinch";
    primaryId: number;
    startPoint: { x: number; y: number };
    startPan: { x: number; y: number };
    startZoom: number;
    startDistance?: number;
    anchor?: { x: number; y: number };
  } | null>(null);
  const lastViewerTap = useRef<{ time: number; x: number; y: number } | null>(null);

  const selected = useMemo(() => pages.find((page) => page.id === selectedId) ?? pages[0] ?? null, [pages, selectedId]);
  const selectedIndex = selected ? pages.findIndex((page) => page.id === selected.id) : -1;
  const filteredDocuments = useMemo(() => documents.filter((document) => document.name.toLowerCase().includes(librarySearch.toLowerCase())), [documents, librarySearch]);
  const cameraProcessing = pages.filter((page) => cameraSessionIds.includes(page.id) && page.processingStatus !== "ready").length;

  useEffect(() => {
    zoomValue.current = 1;
    panValue.current = { x: 0, y: 0 };
    viewerPointers.current.clear();
    viewerGesture.current = null;
    const resetTimer = window.setTimeout(() => {
      setZoom(1);
      setPan({ x: 0, y: 0 });
      setViewerInteracting(false);
    }, 0);
    return () => window.clearTimeout(resetTimer);
  }, [selected?.id]);

  useEffect(() => {
    let active = true;
    let handoffTimer = 0;

    const readyTimer = window.setTimeout(() => {
      if (!active) return;
      setStartupMessage("Scanner ready");
      setStartupProgress(100);
      handoffTimer = window.setTimeout(() => { if (active) setAppReady(true); }, 180);
    }, 720);

    return () => {
      active = false;
      window.clearTimeout(readyTimer);
      window.clearTimeout(handoffTimer);
    };
  }, []);

  const notify = (message: string) => {
    const id = ++toastCounter.current;
    setToasts((current) => [...current, { id, message }]);
    window.setTimeout(() => setToasts((current) => current.filter((toast) => toast.id !== id)), 2800);
  };

  const refreshLibrary = async () => {
    try {
      setDocuments(await listDocuments());
      setStorageStatus(await requestPersistentStorage());
    } catch {
      notify("The local document library is unavailable in this browser.");
    }
  };

  const revokePages = (items: ScanPage[]) => {
    items.forEach((page) => {
      if (page.source.startsWith("blob:")) URL.revokeObjectURL(page.source);
    });
  };

  const updateSelected = (changes: Partial<ScanPage>) => {
    if (!selected) return;
    setPages((current) => current.map((page) => page.id === selected.id ? { ...page, ...changes } : page));
  };

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

  useEffect(() => {
    const beforeInstall = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPrompt);
    };
    const online = () => setIsOnline(true);
    const offline = () => setIsOnline(false);
    window.addEventListener("beforeinstallprompt", beforeInstall);
    window.addEventListener("online", online);
    window.addEventListener("offline", offline);
    if ("serviceWorker" in navigator) {
      void navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" }).then((registration) => {
        void registration.update();
        return navigator.serviceWorker.ready;
      }).then((registration) => {
        const urls = performance.getEntriesByType("resource").map((entry) => entry.name).filter((url) => url.startsWith(window.location.origin));
        registration.active?.postMessage({ type: "CACHE_URLS", urls });
      }).catch(() => undefined);
    }
    const libraryTimer = window.setTimeout(() => {
      setIsStandalone(window.matchMedia("(display-mode: standalone)").matches || ("standalone" in navigator && Boolean((navigator as Navigator & { standalone?: boolean }).standalone)));
      setIsOnline(navigator.onLine);
      void refreshLibrary();
    }, 0);
    return () => {
      window.clearTimeout(libraryTimer);
      streamRef.current?.getTracks().forEach((track) => track.stop());
      window.removeEventListener("beforeinstallprompt", beforeInstall);
      window.removeEventListener("online", online);
      window.removeEventListener("offline", offline);
    };
    // This initialization intentionally runs once for the device-local app shell.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const processPageInBackground = async (pageId: string, file: File) => {
    setPages((current) => current.map((page) => page.id === pageId ? { ...page, processingStatus: "processing" } : page));
    try {
      const corners = await detectDocumentCornersInWorker(file);
      setPages((current) => current.map((page) => page.id === pageId ? { ...page, corners, processingStatus: "ready" } : page));
    } catch {
      setPages((current) => current.map((page) => page.id === pageId ? { ...page, corners: insetCorners(), processingStatus: "error" } : page));
    }
  };

  const addFiles = async (files: File[], options?: { fromCamera?: boolean }) => {
    const imageFiles = files.filter((file) => file.type.startsWith("image/"));
    if (!imageFiles.length) {
      notify("Choose an image file such as JPEG, PNG, HEIC, or WebP.");
      return;
    }
    try {
      const additions = await Promise.all(imageFiles.map((file) => fileToPage(file)));
      setPages((current) => [...current, ...additions]);
      setSelectedId(additions[additions.length - 1]?.id ?? null);
      if (options?.fromCamera) setCameraSessionIds((current) => [...current, ...additions.map((page) => page.id)]);
      additions.forEach((page, index) => void processPageInBackground(page.id, imageFiles[index]));
      if (!options?.fromCamera) notify(`${additions.length} page${additions.length === 1 ? "" : "s"} added. Edge detection is running in the background.`);
      return additions.map((page) => page.id);
    } catch (error) {
      console.error("ScanNow image import failed", error);
      notify("One or more images could not be opened.");
      return [];
    }
  };

  const startCamera = async () => {
    setCameraOpen(true);
    setCameraError("");
    setCameraSessionIds([]);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      });
      streamRef.current = stream;
      window.setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          void videoRef.current.play();
        }
      }, 0);
    } catch {
      setCameraError("Camera access is unavailable. Check browser permission or add pages from your device instead.");
    }
  };

  const closeCamera = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setCameraOpen(false);
  };

  const openAddPages = () => {
    setMobileRail(false);
    setAddPagesOpen(true);
  };

  const chooseCameraForPages = () => {
    setAddPagesOpen(false);
    void startCamera();
  };

  const chooseImagesForPages = () => {
    setAddPagesOpen(false);
    window.setTimeout(() => inputRef.current?.click(), 0);
  };

  const capturePhoto = async () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")?.drawImage(video, 0, 0);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.94));
    if (!blob) return;
    setCameraFlash(true);
    window.setTimeout(() => setCameraFlash(false), 130);
    await addFiles([new File([blob], `scan-${pages.length + 1}.jpg`, { type: "image/jpeg" })], { fromCamera: true });
  };

  const redetect = async (): Promise<Point[] | null> => {
    if (!selected) return null;
    setBusy("Finding page edges…");
    try {
      const response = await fetch(selected.source);
      if (!response.ok) throw new Error("Image could not be read");
      const corners = await detectDocumentCornersInWorker(await response.blob());
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

  const recognizePages = async (targets: ScanPage[]) => {
    const recognized = new Map<string, string>();
    let activeIndex = 0;
    setPages((current) => current.map((page) => targets.some((target) => target.id === page.id) ? { ...page, ocrStatus: "running" } : page));
    try {
      ocrProgressListener = (event) => {
        if (event.status === "recognizing text") {
          setBusy(`Reading page ${activeIndex + 1} of ${targets.length}… ${Math.round((event.progress ?? 0) * 100)}%`);
        }
      };
      const worker = await getOcrWorker();
      for (let index = 0; index < targets.length; index += 1) {
        activeIndex = index;
        const target = targets[index];
        setBusy(`Reading page ${index + 1} of ${targets.length}…`);
        const latest = pages.find((page) => page.id === target.id) ?? target;
        const canvas = await renderPage(latest, 1800);
        const result = await worker.recognize(canvas);
        const text = result.data.text.trim();
        recognized.set(target.id, text);
        setPages((current) => current.map((page) => page.id === target.id ? { ...page, ocr: text, ocrStatus: "done" } : page));
      }
      return recognized;
    } catch (error) {
      setPages((current) => current.map((page) => targets.some((target) => target.id === page.id) && page.ocrStatus === "running" ? { ...page, ocrStatus: "error" } : page));
      throw error;
    } finally {
      ocrProgressListener = null;
    }
  };

  const runOcr = async (targetIds?: string[]) => {
    const ids = targetIds?.length ? targetIds : selected ? [selected.id] : [];
    const targets = pages.filter((page) => ids.includes(page.id));
    if (!targets.length) return;
    if (targets.length === 1) {
      setSelectedId(targets[0].id);
      setMobileRail(false);
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
    if (!selected?.ocr) return;
    await navigator.clipboard.writeText(selected.ocr);
    notify("Recognized text copied.");
  };

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
        const missingOcr = pages.filter((page) => !page.ocr.trim());
        if (missingOcr.length) {
          try {
            const recognized = await recognizePages(missingOcr);
            exportPages = pages.map((page) => recognized.has(page.id) ? { ...page, ocr: recognized.get(page.id) ?? "", ocrStatus: "done" } : page);
          } catch {
            notify("Searchable PDF export stopped because OCR did not finish. Retry or turn off searchable text.");
            return;
          }
        }
      }
      setBusy(`Preparing page 1 of ${exportPages.length}…`);
      const { jsPDF } = await getPdfModule();
      const size = pageSize === "a4" ? [210, 297] : [215.9, 279.4];
      const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: size, compress: true });
      for (let index = 0; index < exportPages.length; index += 1) {
        setBusy(`Preparing page ${index + 1} of ${exportPages.length}…`);
        const page = exportPages[index];
        const canvas = await renderPage(page, quality > 90 ? 2800 : quality > 75 ? 2200 : 1600);
        if (index > 0) pdf.addPage(size, "portrait");
        const margin = 5;
        const availableWidth = size[0] - margin * 2;
        const availableHeight = size[1] - margin * 2;
        const ratio = Math.min(availableWidth / canvas.width, availableHeight / canvas.height);
        const width = canvas.width * ratio;
        const height = canvas.height * ratio;
        const x = (size[0] - width) / 2;
        const y = (size[1] - height) / 2;
        pdf.addImage(canvas.toDataURL("image/jpeg", quality / 100), "JPEG", x, y, width, height, undefined, "FAST");
        if (searchable && page.ocr) {
          pdf.setFontSize(4);
          let lines = pdf.splitTextToSize(page.ocr, availableWidth);
          const initialLineHeight = 4 * 1.05 * 25.4 / 72;
          if (lines.length * initialLineHeight > availableHeight) {
            const fittedSize = Math.max(1, 4 * availableHeight / (lines.length * initialLineHeight));
            pdf.setFontSize(fittedSize);
            lines = pdf.splitTextToSize(page.ocr, availableWidth);
          }
          pdf.text(lines, margin, margin, { baseline: "top", lineHeightFactor: 1.05, renderingMode: "invisible" });
        }
      }
      pdf.setProperties({ title: confirmedName, subject: "Created locally in ScanNow!", creator: "ScanNow!" });
      pdf.save(`${confirmedName}.pdf`);
      notify("PDF downloaded. No page data was uploaded.");
    } catch {
      notify("The PDF could not be created. Try reducing image quality.");
    } finally {
      setBusy(null);
      setPdfBuilding(false);
    }
  };

  const confirmPdfDownload = () => {
    const cleanName = pdfName.trim().replace(/\.pdf$/i, "").replace(/[\\/:*?"<>|]+/g, "-") || defaultDocumentName();
    setPdfName(cleanName);
    void exportPdf(cleanName);
  };

  const saveCurrentToLibrary = async () => {
    if (!pages.length) return;
    if (pages.some((page) => page.processingStatus === "processing" || page.processingStatus === "queued")) {
      notify("Wait for background page processing to finish before saving.");
      return;
    }
    setBusy(currentDocumentId ? "Updating local document…" : "Saving to this device…");
    try {
      const thumbnail = await createThumbnail(pages[0]);
      const saved = await saveDocument({
        id: currentDocumentId ?? undefined,
        name: pdfName,
        pages,
        thumbnail,
        createdAt: currentDocumentCreatedAt,
      });
      setCurrentDocumentId(saved.id);
      setCurrentDocumentCreatedAt(saved.createdAt);
      await refreshLibrary();
      notify(currentDocumentId ? "Local document updated." : "Document saved to your local library.");
    } catch {
      notify("This document could not be saved locally. Check available device storage.");
    } finally {
      setBusy(null);
    }
  };

  const openSavedDocument = async (documentId: string) => {
    setBusy("Opening local document…");
    try {
      const result = await loadLibraryDocument(documentId);
      revokePages(pages);
      const restored: ScanPage[] = result.pages.map((page) => ({ ...page, ocrStatus: "idle", processingStatus: "ready" }));
      setPages(restored);
      setCheckedPageIds([]);
      setSelectedId(restored[0]?.id ?? null);
      setPdfName(result.document.name);
      setCurrentDocumentId(result.document.id);
      setCurrentDocumentCreatedAt(result.document.createdAt);
      setLibraryOpen(false);
      notify("Local document opened.");
    } catch {
      notify("The saved document could not be opened on this device.");
    } finally {
      setBusy(null);
    }
  };

  const removeSavedDocument = (document: LibraryDocument) => {
    setLibraryOpen(false);
    setConfirmDialog({
      title: "Delete this document?",
      message: `“${document.name}” and all of its pages will be removed from this device. This cannot be undone.`,
      confirmLabel: "Delete document",
      danger: true,
      onConfirm: async () => {
        setBusy("Deleting local document…");
        try {
          await deleteLibraryDocument(document.id);
          if (currentDocumentId === document.id) {
            setCurrentDocumentId(null);
            setCurrentDocumentCreatedAt(undefined);
          }
          await refreshLibrary();
          notify("Local document deleted.");
        } catch {
          notify("The document could not be deleted.");
        } finally {
          setBusy(null);
        }
      },
    });
  };

  const resetDocument = () => {
    revokePages(pages);
    setPages([]);
    setCheckedPageIds([]);
    setSelectedId(null);
    setPreviewUrl(null);
    setPdfName(defaultDocumentName());
    setCurrentDocumentId(null);
    setCurrentDocumentCreatedAt(undefined);
    setLibraryOpen(false);
  };

  const startNewDocument = () => {
    if (!pages.length) {
      resetDocument();
      setAddPagesOpen(true);
      return;
    }
    setLibraryOpen(false);
    setConfirmDialog({
      title: "Start a new scan?",
      message: "The current pages will leave this session. Save the document first if you want to keep it in your local library.",
      confirmLabel: "Start new scan",
      onConfirm: () => {
        resetDocument();
        setAddPagesOpen(true);
      },
    });
  };

  const confirmClearSession = () => {
    setSettingsOpen(false);
    setConfirmDialog({
      title: "Clear every page?",
      message: "All pages will be removed from this session. Documents already saved in your local library will not be affected.",
      confirmLabel: "Clear session",
      danger: true,
      onConfirm: () => {
        revokePages(pages);
        setPages([]);
        setCheckedPageIds([]);
        setSelectedId(null);
        setPreviewUrl(null);
        setCurrentDocumentId(null);
        setCurrentDocumentCreatedAt(undefined);
        setSettingsOpen(false);
      },
    });
  };

  const showLibrary = () => {
    setLibraryOpen(true);
    void refreshLibrary();
  };

  const installApp = async () => {
    if (!installPrompt) {
      setInstallHelpOpen(true);
      return;
    }
    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    if (choice.outcome === "accepted") {
      setIsStandalone(true);
      notify("The scanner was added to this device.");
    }
    setInstallPrompt(null);
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

  const toggleCheckedPage = (pageId: string) => {
    setCheckedPageIds((current) => current.includes(pageId) ? current.filter((id) => id !== pageId) : [...current, pageId]);
  };

  const toggleAllPages = () => {
    setCheckedPageIds((current) => current.length === pages.length ? [] : pages.map((page) => page.id));
  };

  const selectRelativePage = (direction: -1 | 1) => {
    const nextIndex = selectedIndex + direction;
    if (nextIndex < 0 || nextIndex >= pages.length) return;
    setSelectedId(pages[nextIndex].id);
  };

  const constrainViewerPan = (candidate: { x: number; y: number }, nextZoom: number) => {
    const stage = documentStageRef.current;
    const image = previewImageRef.current;
    if (!stage || !image || nextZoom <= 1) return { x: 0, y: 0 };
    const usableWidth = Math.max(1, stage.clientWidth - 28);
    const usableHeight = Math.max(1, stage.clientHeight - 92);
    const maxX = Math.max(0, (image.offsetWidth * nextZoom - usableWidth) / 2 + 24);
    const maxY = Math.max(0, (image.offsetHeight * nextZoom - usableHeight) / 2 + 24);
    return {
      x: Math.max(-maxX, Math.min(maxX, candidate.x)),
      y: Math.max(-maxY, Math.min(maxY, candidate.y)),
    };
  };

  const applyViewerTransform = (nextZoom: number, candidatePan: { x: number; y: number }) => {
    const clampedZoom = Math.max(0.5, Math.min(4, nextZoom));
    const nextPan = constrainViewerPan(candidatePan, clampedZoom);
    zoomValue.current = clampedZoom;
    panValue.current = nextPan;
    setZoom(clampedZoom);
    setPan(nextPan);
  };

  const resetViewerTransform = () => applyViewerTransform(1, { x: 0, y: 0 });

  const zoomViewerAt = (nextZoom: number, clientX?: number, clientY?: number) => {
    const stage = documentStageRef.current;
    if (!stage || clientX === undefined || clientY === undefined) {
      applyViewerTransform(nextZoom, nextZoom <= 1 ? { x: 0, y: 0 } : panValue.current);
      return;
    }
    const rect = stage.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const localX = (clientX - centerX - panValue.current.x) / zoomValue.current;
    const localY = (clientY - centerY - panValue.current.y) / zoomValue.current;
    applyViewerTransform(nextZoom, {
      x: clientX - centerX - localX * nextZoom,
      y: clientY - centerY - localY * nextZoom,
    });
  };

  const beginViewerGesture = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    viewerPointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const points = Array.from(viewerPointers.current.entries());
    if (points.length === 1) {
      viewerGesture.current = {
        mode: "pending",
        primaryId: event.pointerId,
        startPoint: { x: event.clientX, y: event.clientY },
        startPan: panValue.current,
        startZoom: zoomValue.current,
      };
      return;
    }
    const [, first] = points[0];
    const [, second] = points[1];
    lastViewerTap.current = null;
    const midpoint = { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 };
    const stageRect = documentStageRef.current?.getBoundingClientRect();
    const centerX = stageRect ? stageRect.left + stageRect.width / 2 : midpoint.x;
    const centerY = stageRect ? stageRect.top + stageRect.height / 2 : midpoint.y;
    viewerGesture.current = {
      mode: "pinch",
      primaryId: points[0][0],
      startPoint: midpoint,
      startPan: panValue.current,
      startZoom: zoomValue.current,
      startDistance: Math.max(1, Math.hypot(second.x - first.x, second.y - first.y)),
      anchor: {
        x: (midpoint.x - centerX - panValue.current.x) / zoomValue.current,
        y: (midpoint.y - centerY - panValue.current.y) / zoomValue.current,
      },
    };
    setViewerInteracting(true);
  };

  const moveViewerGesture = (event: PointerEvent<HTMLDivElement>) => {
    if (!viewerPointers.current.has(event.pointerId)) return;
    event.preventDefault();
    viewerPointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const gesture = viewerGesture.current;
    if (!gesture) return;
    const points = Array.from(viewerPointers.current.values());
    if (points.length >= 2) {
      const first = points[0];
      const second = points[1];
      const midpoint = { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 };
      const distance = Math.max(1, Math.hypot(second.x - first.x, second.y - first.y));
      const stageRect = documentStageRef.current?.getBoundingClientRect();
      const centerX = stageRect ? stageRect.left + stageRect.width / 2 : midpoint.x;
      const centerY = stageRect ? stageRect.top + stageRect.height / 2 : midpoint.y;
      const nextZoom = gesture.startZoom * distance / Math.max(1, gesture.startDistance ?? distance);
      const anchor = gesture.anchor ?? { x: 0, y: 0 };
      applyViewerTransform(nextZoom, {
        x: midpoint.x - centerX - anchor.x * nextZoom,
        y: midpoint.y - centerY - anchor.y * nextZoom,
      });
      return;
    }
    const deltaX = event.clientX - gesture.startPoint.x;
    const deltaY = event.clientY - gesture.startPoint.y;
    if (zoomValue.current > 1.01 && (gesture.mode === "pan" || Math.hypot(deltaX, deltaY) > 5)) {
      gesture.mode = "pan";
      setViewerInteracting(true);
      applyViewerTransform(gesture.startZoom, { x: gesture.startPan.x + deltaX, y: gesture.startPan.y + deltaY });
    }
  };

  const finishViewerGesture = (event: PointerEvent<HTMLDivElement>) => {
    const gesture = viewerGesture.current;
    const point = viewerPointers.current.get(event.pointerId) ?? { x: event.clientX, y: event.clientY };
    viewerPointers.current.delete(event.pointerId);
    if (viewerPointers.current.size) {
      const [remainingId, remaining] = Array.from(viewerPointers.current.entries())[0];
      viewerGesture.current = {
        mode: "pan",
        primaryId: remainingId,
        startPoint: remaining,
        startPan: panValue.current,
        startZoom: zoomValue.current,
      };
      return;
    }
    viewerGesture.current = null;
    setViewerInteracting(false);
    if (!gesture || gesture.primaryId !== event.pointerId || gesture.mode !== "pending") return;
    const deltaX = point.x - gesture.startPoint.x;
    const deltaY = point.y - gesture.startPoint.y;
    if (Math.hypot(deltaX, deltaY) < 10) {
      const now = performance.now();
      const lastTap = lastViewerTap.current;
      if (lastTap && now - lastTap.time < 320 && Math.hypot(point.x - lastTap.x, point.y - lastTap.y) < 28) {
        lastViewerTap.current = null;
        zoomViewerAt(zoomValue.current > 1.01 ? 1 : 2, point.x, point.y);
      } else {
        lastViewerTap.current = { time: now, x: point.x, y: point.y };
      }
      return;
    }
    if (zoomValue.current <= 1.01 && Math.abs(deltaX) >= 55 && Math.abs(deltaX) > Math.abs(deltaY) * 1.35) {
      selectRelativePage(deltaX < 0 ? 1 : -1);
    }
  };

  const cancelViewerGesture = () => {
    viewerPointers.current.clear();
    viewerGesture.current = null;
    setViewerInteracting(false);
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

  const trackPointerDrag = (event: PointerEvent<HTMLButtonElement>) => {
    if (!draggedPageId.current) return;
    event.preventDefault();
    const row = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLTableRowElement>("tr[data-page-id]");
    const targetId = row?.dataset.pageId ?? null;
    if (!targetId) return;
    dragTargetId.current = targetId;
    setDragOverId(targetId);
  };

  const dropPointerDrag = (event: PointerEvent<HTMLButtonElement>) => {
    if (!draggedPageId.current) return;
    event.preventDefault();
    reorderPage(draggedPageId.current, dragTargetId.current);
    finishPageDrag();
  };

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    void addFiles(Array.from(event.dataTransfer.files));
  };

  if (!appReady) return <AppLoader message={startupMessage} progress={startupProgress} />;

  return (
    <main className="app-shell" onDragOver={(event) => event.preventDefault()} onDrop={onDrop}>
      <header className="topbar">
        <div className="brand-wrap">
          <button className="icon-button rail-toggle page-rail-toggle" onClick={() => setMobileRail((value) => !value)} aria-label={`${mobileRail ? "Hide" : "Show"} ${pages.length} document page${pages.length === 1 ? "" : "s"}`} disabled={!pages.length}>
            <Files size={19} />
            {pages.length > 0 && <span className="page-count-badge" aria-hidden="true">{pages.length > 99 ? "99+" : pages.length}</span>}
          </button>
          <img className="brand-mark" src="/scannow-mark.svg" alt="" />
          <div>
            <h1>ScanNow!</h1>
            <p>Camera to clean PDF, entirely in your browser</p>
          </div>
        </div>
        <div className="header-actions">
          <div className={`connectivity-chip ${isOnline ? "online" : "offline"}`}>{isOnline ? <Wifi size={14} /> : <WifiOff size={14} />}<span>{isOnline ? "Online" : "Offline ready"}</span></div>
          <div className="privacy-chip"><LockKeyhole size={14} /><span>Private · device only</span></div>
          {!isStandalone && <button className="button secondary compact install-button" onClick={installApp}><Smartphone size={18} /><span>Install</span></button>}
          <button className="button secondary compact" onClick={showLibrary}><Archive size={18} /><span>Library{documents.length ? ` (${documents.length})` : ""}</span></button>
          {pages.length > 0 && <button className="button secondary compact" onClick={() => void saveCurrentToLibrary()} disabled={Boolean(busy) || pages.some((page) => page.processingStatus === "processing" || page.processingStatus === "queued")}><Save size={18} /><span>{currentDocumentId ? "Save" : "Save locally"}</span></button>}
          <button className="button secondary compact" onClick={() => setSettingsOpen(true)} disabled={!pages.length}><MoreHorizontal size={18} /><span>PDF options</span></button>
          <button className="button primary compact" onClick={() => setDownloadOpen(true)} disabled={!pages.length || Boolean(busy)}><Download size={18} /><span>Download PDF</span></button>
        </div>
      </header>

      <section className={`workspace ${pages.length ? "has-pages" : ""}`}>
        {pages.length > 0 && (
          <aside className={`page-rail ${mobileRail ? "open" : ""}`}>
            <div className="rail-header"><div><span className="eyebrow">Document</span><strong>{pages.length} page{pages.length === 1 ? "" : "s"}</strong></div><button className="icon-button" onClick={openAddPages} title="Add pages" aria-label="Add pages"><Plus size={18} /></button></div>
            <div className="page-table-scroll">
              <table className="page-table">
                <thead><tr><th aria-label="Reorder" /><th className="select-column"><input type="checkbox" checked={checkedPageIds.length === pages.length} onChange={toggleAllPages} aria-label={checkedPageIds.length === pages.length ? "Clear page selection" : "Select every page"} /></th><th>Page</th><th>Current action</th><th aria-label="Page actions" /></tr></thead>
                <tbody>
                  {pages.map((page, index) => (
                    <tr
                      className={`${selected?.id === page.id ? "selected" : ""} ${draggedId === page.id ? "dragging" : ""} ${dragOverId === page.id && draggedId !== page.id ? "drag-over" : ""}`}
                      key={page.id}
                      data-page-id={page.id}
                      onClick={() => { setSelectedId(page.id); setMobileRail(false); }}
                      onDragEnter={() => {
                        if (!draggedPageId.current) return;
                        dragTargetId.current = page.id;
                        setDragOverId(page.id);
                      }}
                      onDragOver={(event) => { if (draggedPageId.current) event.preventDefault(); }}
                      onDrop={(event) => {
                        if (!draggedPageId.current) return;
                        event.preventDefault();
                        event.stopPropagation();
                        reorderPage(draggedPageId.current, page.id);
                        finishPageDrag();
                      }}
                    >
                      <td>
                        <button
                          className="drag-handle"
                          aria-label={`Drag page ${index + 1} to reorder`}
                          title=":: Drag to reorder"
                          draggable
                          onClick={(event) => event.stopPropagation()}
                          onDragStart={(event) => {
                            beginPageDrag(page.id);
                            event.dataTransfer.effectAllowed = "move";
                            event.dataTransfer.setData("text/plain", page.id);
                          }}
                          onDragEnd={finishPageDrag}
                          onPointerDown={(event) => {
                            if (event.pointerType === "mouse") return;
                            event.preventDefault();
                            event.stopPropagation();
                            beginPageDrag(page.id);
                            event.currentTarget.setPointerCapture(event.pointerId);
                          }}
                          onPointerMove={trackPointerDrag}
                          onPointerUp={dropPointerDrag}
                          onPointerCancel={finishPageDrag}
                        >
                          <GripVertical size={18} />
                        </button>
                      </td>
                      <td className="select-column">
                        <input
                          type="checkbox"
                          checked={checkedPageIds.includes(page.id)}
                          onClick={(event) => event.stopPropagation()}
                          onChange={() => toggleCheckedPage(page.id)}
                          aria-label={`Select page ${index + 1} for a multi-page action`}
                        />
                      </td>
                      <td>
                        <button className="page-cell" onClick={() => { setSelectedId(page.id); setMobileRail(false); }}>
                          <span className="table-thumb">
                            <img src={page.source} alt="" />
                            {pageIsProcessing(page) && <span className="thumb-spinner"><LoaderCircle className="spin" size={18} /></span>}
                          </span>
                          <span><strong>Page {index + 1}</strong><small>{Math.round(page.width / 100) / 10} MP</small></span>
                        </button>
                      </td>
                      <td><span className={`page-status ${pageIsProcessing(page) ? "processing" : page.processingStatus}`}>{pageIsProcessing(page) && <LoaderCircle className="spin" size={13} />}{pageActivity(page)}</span></td>
                      <td><button className="icon-button danger-text row-delete" onClick={(event) => { event.stopPropagation(); removePage(page.id); }} aria-label={`Remove page ${index + 1}`}><Trash2 size={16} /></button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="rail-actions">
              <button className="rail-add rail-add-pages" onClick={openAddPages}><Plus size={17} /> Add pages</button>
              <button className="rail-add rail-ocr" onClick={() => void runOcr(checkedPageIds)} disabled={!checkedPageIds.length || Boolean(busy)}><FileText size={17} /> OCR {checkedPageIds.length ? `${checkedPageIds.length} selected` : "selected pages"}</button>
            </div>
          </aside>
        )}

        <section className="canvas-area">
          {!pages.length ? (
            <div className="empty-state">
              <div className="empty-visual" aria-hidden="true">
                <span className="paper paper-back" />
                <span className="paper paper-front"><span className="scan-beam" /><ScanLine size={62} /></span>
              </div>
              <p className="eyebrow">Private document scanner</p>
              <h2>Turn paper into a polished PDF</h2>
              <p className="empty-copy">Photograph pages continuously or choose existing images. Processing runs behind the camera and saved documents remain on this device, even offline.</p>
              <div className="empty-actions">
                <button className="button primary large" onClick={openAddPages}><FilePlus2 size={21} /> Add pages</button>
                {documents.length > 0 && <button className="button secondary large" onClick={showLibrary}><Archive size={21} /> Open library</button>}
              </div>
              <div className="drop-hint"><FileImage size={17} /> You can also drop images here or paste from the clipboard</div>
              <div className="feature-row">
                <span><Crop size={16} /> Auto crop</span>
                <span><Sparkles size={16} /> Clean up</span>
                <span><FileText size={16} /> Local OCR</span>
                <span><WifiOff size={16} /> Works offline</span>
              </div>
            </div>
          ) : selected ? (
            <>
              <div className="canvas-toolbar">
                <div className="page-navigation">
                  <button className="icon-button" onClick={() => selectRelativePage(-1)} disabled={selectedIndex === 0} aria-label="Previous page"><ChevronLeft size={18} /></button>
                  <div><span className="page-label">Page {selectedIndex + 1} of {pages.length}</span><span className="source-label">{selected.name}</span></div>
                  <button className="icon-button" onClick={() => selectRelativePage(1)} disabled={selectedIndex === pages.length - 1} aria-label="Next page"><ChevronRight size={18} /></button>
                </div>
                <div className="zoom-controls">
                  <button className="icon-button" onClick={() => zoomViewerAt(zoomValue.current - 0.25)} aria-label="Zoom out"><ZoomOut size={18} /></button>
                  <button className="zoom-value" onClick={resetViewerTransform} aria-label="Reset zoom and pan" title="Reset zoom and pan">{Math.round(zoom * 100)}%</button>
                  <button className="icon-button" onClick={() => zoomViewerAt(zoomValue.current + 0.25)} aria-label="Zoom in"><ZoomIn size={18} /></button>
                </div>
              </div>
              <div ref={documentStageRef} className="document-stage" onPointerDown={beginViewerGesture} onPointerMove={moveViewerGesture} onPointerUp={finishViewerGesture} onPointerCancel={cancelViewerGesture}>
                {previewUrl ? <img ref={previewImageRef} className={`document-preview ${viewerInteracting ? "interacting" : ""}`} style={{ transform: `translate3d(${pan.x}px, ${pan.y}px, 0) scale(${zoom})` }} src={previewUrl} alt={`Processed page ${selectedIndex + 1}`} draggable={false} /> : <LoaderCircle className="spin" size={34} />}
                <span className="swipe-hint" aria-hidden="true">{zoom > 1.01 ? "Drag to pan · pinch to zoom" : pages.length > 1 ? "Swipe pages · pinch to zoom" : "Pinch or double-tap to zoom"}</span>
              </div>
              <div className="mobile-tool-strip">
                <ToolButton label="Crop" onClick={() => setCropOpen(true)}><Crop size={19} /></ToolButton>
                <ToolButton label="Rotate" onClick={() => updateSelected({ rotation: (selected.rotation + 90) % 360 })}><RotateCw size={19} /></ToolButton>
                <ToolButton label="Enhance" onClick={() => updateSelected({ filter: selected.filter === "enhance" ? "color" : "enhance" })} active={selected.filter === "enhance"}><Sparkles size={19} /></ToolButton>
                <ToolButton label={checkedPageIds.length > 1 ? `OCR ${checkedPageIds.length}` : "OCR"} onClick={() => void runOcr(checkedPageIds.length ? checkedPageIds : [selected.id])}><FileText size={19} /></ToolButton>
              </div>
            </>
          ) : null}
        </section>

        {selected && (
          <aside className="tools-panel">
            <div className="panel-heading"><div><p className="eyebrow">Edit page {selectedIndex + 1}</p><h2>Scan tools</h2></div><Sparkles size={20} /></div>
            <section className="tool-section">
              <div className="section-title"><span>Framing</span><button onClick={redetect} disabled={Boolean(busy)}>Detect again</button></div>
              <button className="wide-action" onClick={() => setCropOpen(true)}><span className="wide-icon"><Crop size={20} /></span><span><strong>Crop &amp; deskew</strong><small>Adjust the four page corners</small></span><span className="status-dot"><Check size={12} /></span></button>
            </section>
            <section className="tool-section">
              <div className="section-title"><span>Orientation</span></div>
              <div className="tool-grid">
                <ToolButton label="Left" onClick={() => updateSelected({ rotation: (selected.rotation + 270) % 360 })}><RotateCcw size={20} /></ToolButton>
                <ToolButton label="Right" onClick={() => updateSelected({ rotation: (selected.rotation + 90) % 360 })}><RotateCw size={20} /></ToolButton>
                <ToolButton label="Mirror" onClick={() => updateSelected({ flipX: !selected.flipX })} active={selected.flipX}><FlipHorizontal2 size={20} /></ToolButton>
                <ToolButton label="Flip" onClick={() => updateSelected({ flipY: !selected.flipY })} active={selected.flipY}><FlipVertical2 size={20} /></ToolButton>
              </div>
            </section>
            <section className="tool-section">
              <div className="section-title"><span>Appearance</span><button onClick={() => updateSelected({ filter: "enhance", brightness: 0, contrast: 12 })}>Reset</button></div>
              <div className="filter-tabs">
                {(["color", "enhance", "gray", "bw"] as FilterMode[]).map((filter) => (
                  <button key={filter} className={selected.filter === filter ? "active" : ""} onClick={() => updateSelected({ filter })}>{filter === "bw" ? "B&W" : filter[0].toUpperCase() + filter.slice(1)}</button>
                ))}
              </div>
              <label className="range-row"><span>Brightness <output>{selected.brightness > 0 ? "+" : ""}{selected.brightness}</output></span><input type="range" min="-40" max="40" value={selected.brightness} onChange={(event) => updateSelected({ brightness: Number(event.target.value) })} /></label>
              <label className="range-row"><span>Contrast <output>{selected.contrast > 0 ? "+" : ""}{selected.contrast}</output></span><input type="range" min="-30" max="55" value={selected.contrast} onChange={(event) => updateSelected({ contrast: Number(event.target.value) })} /></label>
            </section>
            <section className="tool-section">
              <div className="section-title"><span>Recognize text</span><span className="local-tag">On device</span></div>
              <button className="wide-action" onClick={() => checkedPageIds.length > 1 ? void runOcr(checkedPageIds) : selected.ocr ? setOcrOpen(true) : void runOcr([selected.id])} disabled={selected.ocrStatus === "running" || Boolean(busy)}>
                <span className="wide-icon"><FileText size={20} /></span><span><strong>{checkedPageIds.length > 1 ? `Run OCR on ${checkedPageIds.length} selected pages` : selected.ocr ? "View recognized text" : "Run OCR on this page"}</strong><small>{checkedPageIds.length > 1 ? "Process the checked rows in page order" : selected.ocr ? `${selected.ocr.split(/\s+/).filter(Boolean).length} words found` : "Extract selectable text locally"}</small></span>
              </button>
            </section>
            <div className="page-actions">
              <button disabled={selectedIndex === 0} onClick={() => movePage(selected.id, -1)}><ArrowUp size={16} /> Earlier</button>
              <button disabled={selectedIndex === pages.length - 1} onClick={() => movePage(selected.id, 1)}><ArrowDown size={16} /> Later</button>
              <button className="danger" onClick={() => removePage(selected.id)}><Trash2 size={16} /> Remove</button>
            </div>
          </aside>
        )}
      </section>

      <input ref={inputRef} className="visually-hidden" type="file" multiple accept="image/*,.heic,.heif" onChange={(event: ChangeEvent<HTMLInputElement>) => { void addFiles(Array.from(event.target.files ?? [])); event.target.value = ""; }} />

      {addPagesOpen && (
        <Modal eyebrow="Add to this document" title="How would you like to add pages?" onClose={() => setAddPagesOpen(false)} className="add-pages-modal" bodyClassName="add-pages-body" footer={<><span /><button className="button secondary" onClick={() => setAddPagesOpen(false)}>Cancel</button></>}>
          <button className="source-choice" onClick={chooseCameraForPages}>
            <span className="source-choice-icon"><Camera size={30} /></span>
            <span><strong>Use the camera</strong><small>Capture pages in rapid succession while earlier pages process.</small></span>
          </button>
          <button className="source-choice" onClick={chooseImagesForPages}>
            <span className="source-choice-icon"><ImagePlus size={30} /></span>
            <span><strong>Choose images</strong><small>Select one or more existing photos from this device.</small></span>
          </button>
        </Modal>
      )}

      {downloadOpen && (
        <Modal eyebrow="Ready to export" title="Confirm the PDF filename" onClose={() => setDownloadOpen(false)} className="download-modal" bodyClassName="form-body" footer={<><button className="button secondary" onClick={() => setDownloadOpen(false)}>Cancel</button><button className="button primary" onClick={confirmPdfDownload} disabled={!pdfName.trim()}><Download size={17} /> Build PDF</button></>}>
          <label><span>File name</span><div className="suffix-input"><input autoFocus value={pdfName} onChange={(event) => setPdfName(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && pdfName.trim()) confirmPdfDownload(); }} aria-label="PDF filename" /><span>.pdf</span></div></label>
          <div className="export-summary"><FileText size={22} /><span><strong>{pages.length} page{pages.length === 1 ? "" : "s"} · {pageSize === "a4" ? "A4" : "US Letter"}</strong><small>{searchable ? "Searchable OCR text will be included" : "Image-only PDF"}</small></span></div>
        </Modal>
      )}

      {cameraOpen && (
        <Modal
          eyebrow="Continuous scan"
          title="Fit each page inside the frame"
          onClose={closeCamera}
          className="camera-modal"
          bodyClassName="camera-view"
          backdropClassName="camera-backdrop"
          dark
          footer={!cameraError ? <div className="camera-controls continuous-controls">
            <div className="capture-status"><strong>{cameraSessionIds.length}</strong><span>{cameraSessionIds.length === 1 ? "page captured" : "pages captured"}{cameraProcessing ? ` · ${cameraProcessing} processing` : cameraSessionIds.length ? " · ready" : ""}</span></div>
            <button className="capture-button" onClick={capturePhoto} aria-label="Capture next page"><span /></button>
            <button className="done-scanning" onClick={closeCamera} disabled={!cameraSessionIds.length}><Check size={18} /><span>Done scanning</span></button>
          </div> : <><span /><button className="button secondary" onClick={() => inputRef.current?.click()}>Choose images instead</button></>}
        >
              {cameraError ? <div className="camera-error"><Camera size={42} /><p>{cameraError}</p><button className="button secondary" onClick={() => inputRef.current?.click()}>Choose images instead</button></div> : <video ref={videoRef} muted playsInline />}
              {cameraFlash && <div className="camera-flash" />}
              {!cameraError && <div className="camera-frame"><i /><i /><i /><i /><span>Tap once per page · processing continues behind the camera</span></div>}
        </Modal>
      )}

      {cropOpen && selected && (
        <CropModal page={selected} onChange={(corners) => updateSelected({ corners })} onDetect={redetect} onClose={() => setCropOpen(false)} />
      )}

      {ocrOpen && selected && (
        <Modal eyebrow="On-device OCR" title={`Recognized text · Page ${selectedIndex + 1}`} onClose={() => setOcrOpen(false)} className="ocr-modal" footer={<><button className="button secondary" onClick={() => void runOcr([selected.id])} disabled={Boolean(busy)}><ScanLine size={17} /> Run again</button><div className="footer-right"><button className="button secondary" onClick={copyOcr} disabled={!selected.ocr}><Copy size={17} /> Copy</button><button className="button primary" onClick={() => setOcrOpen(false)}>Done</button></div></>}>
          {selected.ocrStatus === "running" ? <div className="ocr-loading"><LoaderCircle className="spin" size={30} /><p>Reading printed text in your browser…</p></div> : (
            <textarea value={selected.ocr} onChange={(event) => updateSelected({ ocr: event.target.value })} placeholder="Run OCR to extract text from this page." aria-label="Recognized text" />
          )}
        </Modal>
      )}

      {settingsOpen && (
        <Modal eyebrow="Export" title="PDF options" onClose={() => setSettingsOpen(false)} className="options-modal" bodyClassName="form-body" footer={<><button className="button ghost danger-text" onClick={confirmClearSession}><Trash2 size={17} /> Clear session</button><div className="footer-right"><button className="button secondary" onClick={exportText} disabled={!pages.some((page) => page.ocr)}>Save text</button><button className="button primary" onClick={() => { setSettingsOpen(false); setDownloadOpen(true); }}><Download size={17} /> Download PDF</button></div></>}>
              <label><span>File name</span><div className="suffix-input"><input value={pdfName} onChange={(event) => setPdfName(event.target.value)} /><span>.pdf</span></div></label>
              <div className="field-grid">
                <label><span>Page size</span><select value={pageSize} onChange={(event) => setPageSize(event.target.value as "letter" | "a4")}><option value="letter">US Letter</option><option value="a4">A4</option></select></label>
                <label><span>Image quality</span><select value={quality} onChange={(event) => setQuality(Number(event.target.value))}><option value="68">Compact</option><option value="88">Balanced</option><option value="96">High</option></select></label>
              </div>
              <label className="check-row"><input type="checkbox" checked={searchable} onChange={(event) => setSearchable(event.target.checked)} /><span><strong>Include searchable OCR text</strong><small>Missing pages are recognized automatically before the PDF is created.</small></span></label>
              <div className="export-summary"><FileText size={22} /><span><strong>{pages.length} uniformly sized page{pages.length === 1 ? "" : "s"}</strong><small>{pages.filter((page) => page.ocr).length} of {pages.length} pages have OCR text</small></span></div>
              {pages.some((page) => !page.ocr) && searchable && <button className="text-action" onClick={() => void runOcr(pages.map((page) => page.id))} disabled={Boolean(busy)}><Sparkles size={17} /> Run OCR on all pages now</button>}
        </Modal>
      )}

      {libraryOpen && (
        <Modal eyebrow="Stored only on this device" title="Document library" onClose={() => setLibraryOpen(false)} className="library-modal" bodyClassName="library-scroll-body" footer={<><span className="library-privacy"><LockKeyhole size={15} /> Nothing in this library is synced or uploaded.</span><button className="button secondary" onClick={() => setLibraryOpen(false)}>Close</button></>}>
            <div className="library-toolbar">
              <label className="library-search"><Search size={17} /><input value={librarySearch} onChange={(event) => setLibrarySearch(event.target.value)} placeholder="Search documents" aria-label="Search local documents" /></label>
              <button className="button primary" onClick={startNewDocument}><FilePlus2 size={17} /> New scan</button>
            </div>
            <div className="library-body">
              <div className="storage-card">
                <div className="storage-heading"><span><HardDrive size={18} /><strong>Local storage</strong></span><small>{formatBytes(storageStatus.usage)} of {formatBytes(storageStatus.quota)} used</small></div>
                <div className="storage-track"><span style={{ width: `${storageStatus.quota ? Math.min(100, (storageStatus.usage / storageStatus.quota) * 100) : 0}%` }} /></div>
                <p>{storageStatus.persisted ? "Protected from routine browser cleanup." : "Your browser controls retention. Installing the app and using it regularly improves persistence."}</p>
              </div>
              {filteredDocuments.length ? <div className="document-grid">
                {filteredDocuments.map((document) => <article className="document-card" key={document.id}>
                  <button className="document-preview-button" onClick={() => void openSavedDocument(document.id)} aria-label={`Open ${document.name}`}><img src={document.thumbnail} alt="" /></button>
                  <div className="document-card-body"><h3>{document.name}</h3><p>{document.pageCount} page{document.pageCount === 1 ? "" : "s"} · {formatBytes(document.size)}</p><small>Updated {new Date(document.updatedAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}</small></div>
                  <div className="document-card-actions"><button className="button secondary" onClick={() => void openSavedDocument(document.id)}><FolderOpen size={16} /> Open</button><button className="icon-button danger-text" onClick={() => removeSavedDocument(document)} aria-label={`Delete ${document.name}`}><Trash2 size={17} /></button></div>
                </article>)}
              </div> : <div className="library-empty"><Archive size={43} /><h3>{librarySearch ? "No matching documents" : "Your local library is empty"}</h3><p>{librarySearch ? "Try a different document name." : "Scan pages, then choose Save locally. Original images, edits, and OCR text remain on this device."}</p></div>}
            </div>
        </Modal>
      )}

      {installHelpOpen && (
        <Modal eyebrow="Installable offline app" title="Add ScanNow! to your phone" onClose={() => setInstallHelpOpen(false)} className="install-modal" bodyClassName="install-body" footer={<><span /><button className="button primary" onClick={() => setInstallHelpOpen(false)}>Got it</button></>}>
              <div className="install-icon"><Smartphone size={31} /></div>
              <div><h3>iPhone or iPad</h3><p>Open this page in Safari, tap the Share button, then choose <strong>Add to Home Screen</strong>.</p></div>
              <div><h3>Android or desktop Chrome</h3><p>Open the browser menu and choose <strong>Install app</strong> or <strong>Add to Home screen</strong>.</p></div>
              <div className="offline-note"><WifiOff size={20} /><span><strong>Offline after installation</strong><small>The scanner, computer vision, OCR language data, and saved library are available without a network connection after the initial offline setup finishes.</small></span></div>
        </Modal>
      )}

      {confirmDialog && (
        <Modal eyebrow="Please confirm" title={confirmDialog.title} onClose={() => setConfirmDialog(null)} className="confirm-modal" bodyClassName="confirm-body" footer={<><button className="button secondary" onClick={() => setConfirmDialog(null)}>Cancel</button><button className={`button ${confirmDialog.danger ? "danger" : "primary"}`} onClick={() => { const action = confirmDialog.onConfirm; setConfirmDialog(null); void action(); }}>{confirmDialog.confirmLabel}</button></>}>
          <p>{confirmDialog.message}</p>
        </Modal>
      )}

      {pdfBuilding && <div className="pdf-building-backdrop" role="alert" aria-live="assertive"><div className="pdf-building-card"><img src="/scannow-mark.svg" alt="" /><LoaderCircle className="spin pdf-spinner" size={34} /><strong>Building your PDF</strong><p>{busy || "Preparing the document…"}</p><small>Keep ScanNow! open until the download begins.</small></div></div>}
      {busy && !pdfBuilding && <div className="busy-pill" role="status"><LoaderCircle className="spin" size={17} /> {busy}</div>}
      <div className="toast-stack" aria-live="polite">{toasts.map((toast) => <div className="toast" key={toast.id}><Check size={16} />{toast.message}</div>)}</div>
    </main>
  );
}

function CropModal({ page, onChange, onDetect, onClose }: { page: ScanPage; onChange: (corners: Point[]) => void; onDetect: () => Promise<Point[] | null>; onClose: () => void }) {
  const [corners, setCorners] = useState(page.corners);
  const imageRef = useRef<HTMLImageElement>(null);
  const dragRef = useRef<number | null>(null);

  const moveCorner = (event: PointerEvent<HTMLDivElement>) => {
    if (dragRef.current === null || !imageRef.current) return;
    const rect = imageRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height));
    setCorners((current) => current.map((point, index) => index === dragRef.current ? { x, y } : point));
  };

  return (
    <Modal eyebrow="Perspective correction" title="Crop & deskew" onClose={onClose} className="crop-modal" bodyClassName="crop-body" footer={<><button className="button secondary" onClick={async () => { const detected = await onDetect(); if (detected) setCorners(detected); }}><ScanLine size={17} /> Detect edges</button><div className="footer-right"><button className="button ghost" onClick={() => setCorners(insetCorners())}>Reset</button><button className="button primary" onClick={() => { onChange(corners); onClose(); }}><Check size={17} /> Apply crop</button></div></>}>
        <div className="crop-workspace" onPointerMove={moveCorner} onPointerUp={() => { dragRef.current = null; }} onPointerCancel={() => { dragRef.current = null; }}>
          <div className="crop-image-wrap">
            <img ref={imageRef} src={page.source} alt="Original page with crop handles" draggable={false} />
            <svg className="crop-overlay" viewBox="0 0 1000 1000" preserveAspectRatio="none" aria-hidden="true"><polygon points={corners.map((point) => `${point.x * 1000},${point.y * 1000}`).join(" ")} /></svg>
            {corners.map((point, index) => <button key={index} className="corner-handle" style={{ left: `${point.x * 100}%`, top: `${point.y * 100}%` }} onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); dragRef.current = index; }} aria-label={`Move crop corner ${index + 1}`} />)}
          </div>
        </div>
    </Modal>
  );
}
