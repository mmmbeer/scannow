import { createLocalId } from "./id";
import type { Point, ScanPage } from "./types";

export const insetCorners = (): Point[] => [
  { x: 0.012, y: 0.012 },
  { x: 0.988, y: 0.012 },
  { x: 0.988, y: 0.988 },
  { x: 0.012, y: 0.988 },
];

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

function applyPixelFilters(canvas: HTMLCanvasElement, page: ScanPage) {
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return;
  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
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
      red = red > 166 ? 255 : 0;
      green = red;
      blue = red;
    }
    data[index] = Math.max(0, Math.min(255, red));
    data[index + 1] = Math.max(0, Math.min(255, green));
    data[index + 2] = Math.max(0, Math.min(255, blue));
  }
  context.putImageData(imageData, 0, 0);
}

export async function renderPage(page: ScanPage, maxDimension = 2200): Promise<HTMLCanvasElement> {
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
  applyPixelFilters(finalCanvas, page);
  return finalCanvas;
}

export async function fileToPage(file: File): Promise<ScanPage> {
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
    id: createLocalId(), name: file.name || "Camera capture", source, width, height,
    corners: insetCorners(), rotation: 0, flipX: false, flipY: false,
    filter: "enhance", brightness: 0, contrast: 12, ocr: "", ocrLines: [],
    ocrLayoutVersion: 0, ocrStatus: "idle", processingStatus: "queued",
  };
}

export async function createThumbnail(page: ScanPage) {
  return (await renderPage(page, 360)).toDataURL("image/jpeg", 0.72);
}
