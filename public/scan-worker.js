const FALLBACK_CORNERS = [
  { x: 0.012, y: 0.012 },
  { x: 0.988, y: 0.012 },
  { x: 0.988, y: 0.988 },
  { x: 0.012, y: 0.988 },
];

function median(values) {
  if (!values.length) return 0;
  const sorted = values.slice().sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function sampleBorder(data, width, height) {
  const red = [];
  const green = [];
  const blue = [];
  const step = Math.max(2, Math.floor(Math.min(width, height) / 90));
  const collect = (x, y) => {
    const index = (y * width + x) * 4;
    red.push(data[index]);
    green.push(data[index + 1]);
    blue.push(data[index + 2]);
  };
  for (let x = 0; x < width; x += step) {
    collect(x, 0);
    collect(x, height - 1);
  }
  for (let y = step; y < height - step; y += step) {
    collect(0, y);
    collect(width - 1, y);
  }
  return { red: median(red), green: median(green), blue: median(blue) };
}

function detectPaperBounds(imageData) {
  const { data, width, height } = imageData;
  const background = sampleBorder(data, width, height);
  const backgroundLuma = background.red * 0.299 + background.green * 0.587 + background.blue * 0.114;
  const rowCounts = new Uint32Array(height);
  const columnCounts = new Uint32Array(width);
  const rowLeft = new Int32Array(height).fill(width);
  const rowRight = new Int32Array(height).fill(-1);
  const stride = width * 4;

  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const index = y * stride + x * 4;
      const red = data[index];
      const green = data[index + 1];
      const blue = data[index + 2];
      const luma = red * 0.299 + green * 0.587 + blue * 0.114;
      const colorDistance = Math.hypot(red - background.red, green - background.green, blue - background.blue);
      const neutral = Math.max(red, green, blue) - Math.min(red, green, blue) < 58;
      const brighterThanBorder = luma > backgroundLuma + 16;
      const likelyPaper = luma > 145 && neutral && (brighterThanBorder || colorDistance > 34 || backgroundLuma < 125);
      if (!likelyPaper) continue;
      rowCounts[y] += 1;
      columnCounts[x] += 1;
      rowLeft[y] = Math.min(rowLeft[y], x);
      rowRight[y] = Math.max(rowRight[y], x);
    }
  }

  const rowThreshold = Math.max(10, Math.round(width * 0.16));
  const columnThreshold = Math.max(10, Math.round(height * 0.16));
  let top = -1;
  let bottom = -1;
  let left = -1;
  let right = -1;
  for (let y = 0; y < height; y += 1) {
    if (rowCounts[y] < rowThreshold) continue;
    if (top < 0) top = y;
    bottom = y;
  }
  for (let x = 0; x < width; x += 1) {
    if (columnCounts[x] < columnThreshold) continue;
    if (left < 0) left = x;
    right = x;
  }

  if (top < 0 || left < 0 || bottom - top < height * 0.28 || right - left < width * 0.28) return null;

  const region = Math.max(3, Math.round((bottom - top) * 0.12));
  const edgeMedian = (start, end, side) => {
    const values = [];
    for (let y = start; y <= end; y += 1) {
      if (rowCounts[y] >= rowThreshold) values.push(side === "left" ? rowLeft[y] : rowRight[y]);
    }
    return median(values);
  };
  const topLeft = edgeMedian(top, Math.min(bottom, top + region), "left") || left;
  const topRight = edgeMedian(top, Math.min(bottom, top + region), "right") || right;
  const bottomLeft = edgeMedian(Math.max(top, bottom - region), bottom, "left") || left;
  const bottomRight = edgeMedian(Math.max(top, bottom - region), bottom, "right") || right;
  // Expand beyond the detected paper boundary. A conservative crop is better
  // than clipping letterheads, signatures, footnotes, or page numbers.
  const paddingX = Math.max(Math.round(width * 0.018), Math.round((right - left) * 0.03));
  const paddingY = Math.max(Math.round(height * 0.028), Math.round((bottom - top) * 0.045));

  return [
    { x: clamp((topLeft - paddingX) / width, 0.005, 0.995), y: clamp((top - paddingY) / height, 0.005, 0.995) },
    { x: clamp((topRight + paddingX) / width, 0.005, 0.995), y: clamp((top - paddingY) / height, 0.005, 0.995) },
    { x: clamp((bottomRight + paddingX) / width, 0.005, 0.995), y: clamp((bottom + paddingY) / height, 0.005, 0.995) },
    { x: clamp((bottomLeft - paddingX) / width, 0.005, 0.995), y: clamp((bottom + paddingY) / height, 0.005, 0.995) },
  ];
}

self.onmessage = async (event) => {
  const { id, blob } = event.data;
  try {
    const bitmap = await createImageBitmap(blob);
    const scale = Math.min(1, 720 / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("Image processing is unavailable");
    context.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();
    const corners = detectPaperBounds(context.getImageData(0, 0, width, height)) || FALLBACK_CORNERS;
    self.postMessage({ id, corners });
  } catch (error) {
    self.postMessage({ id, error: error instanceof Error ? error.message : "Edge detection failed" });
  }
};
