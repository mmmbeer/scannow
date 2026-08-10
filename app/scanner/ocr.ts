import { renderPage } from "./image-processing";
import type { OcrLine, ScanPage } from "./types";

type OcrBlock = {
  paragraphs: Array<{
    lines: Array<{ text: string; bbox: { x0: number; y0: number; x1: number; y1: number } }>;
  }>;
};

type LocalOcrWorker = {
  recognize: (
    image: HTMLCanvasElement,
    options?: Record<string, never>,
    output?: { text: boolean; blocks: boolean },
  ) => Promise<{ data: { text: string; blocks: OcrBlock[] | null } }>;
};

export type OcrProgressEvent = { status: string; progress?: number };
export type OcrResult = { text: string; lines: OcrLine[] };

let ocrModulePromise: Promise<typeof import("tesseract.js")> | null = null;
let ocrWorkerPromise: Promise<LocalOcrWorker> | null = null;
let progressListener: ((event: OcrProgressEvent) => void) | null = null;

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
      logger: (event) => progressListener?.(event),
    })).then((worker) => worker as LocalOcrWorker);
    ocrWorkerPromise = withTimeout(load, 22000, "OCR startup timed out").catch((error) => {
      ocrWorkerPromise = null;
      throw error;
    });
  }
  return ocrWorkerPromise;
}

function normalizeOcrLines(blocks: OcrBlock[] | null, canvas: HTMLCanvasElement): OcrLine[] {
  if (!blocks?.length || !canvas.width || !canvas.height) return [];
  return blocks.flatMap((block) => block.paragraphs.flatMap((paragraph) => paragraph.lines)).map((line) => ({
    text: line.text.trim(),
    x: Math.max(0, Math.min(1, line.bbox.x0 / canvas.width)),
    y: Math.max(0, Math.min(1, line.bbox.y0 / canvas.height)),
    width: Math.max(0, Math.min(1, (line.bbox.x1 - line.bbox.x0) / canvas.width)),
    height: Math.max(0, Math.min(1, (line.bbox.y1 - line.bbox.y0) / canvas.height)),
  })).filter((line) => line.text && line.width > 0 && line.height > 0);
}

export function setOcrProgressListener(listener: ((event: OcrProgressEvent) => void) | null) {
  progressListener = listener;
}

export async function recognizePage(page: ScanPage): Promise<OcrResult> {
  const canvas = await renderPage(page, 1800);
  const result = await (await getOcrWorker()).recognize(canvas, {}, { text: true, blocks: true });
  return {
    text: result.data.text.trim(),
    lines: normalizeOcrLines(result.data.blocks, canvas),
  };
}
