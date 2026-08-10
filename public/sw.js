const CACHE = "scannow-v8";
const CORE = [
  "/", "/manifest.webmanifest", "/favicon.svg", "/scannow-mark.svg", "/scannow-logo.svg", "/app-icon-192.png", "/app-icon-512.png",
  "/scan-worker.js", "/tesseract/worker.min.js", "/tesseract/lang/eng.traineddata.gz",
  "/tesseract/core/tesseract-core-lstm.wasm.js", "/tesseract/core/tesseract-core-lstm.wasm"
];

async function cacheMissing(cache, urls) {
  for (const url of urls) {
    try {
      if (!(await cache.match(url))) await cache.add(url);
    } catch {
      // A single optional offline asset must not prevent installation.
    }
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cacheMissing(cache, CORE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener("message", (event) => {
  if (event.data?.type !== "CACHE_URLS" || !Array.isArray(event.data.urls)) return;
  const urls = [...new Set(event.data.urls)].filter((url) => {
    try { return new URL(url, self.location.origin).origin === self.location.origin; } catch { return false; }
  });
  event.waitUntil(caches.open(CACHE).then((cache) => cacheMissing(cache, urls)));
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET" || new URL(event.request.url).origin !== self.location.origin) return;
  if (event.request.mode === "navigate") {
    event.respondWith(fetch(event.request).then((response) => {
      const copy = response.clone();
      event.waitUntil(caches.open(CACHE).then((cache) => cache.put("/", copy)).catch(() => undefined));
      return response;
    }).catch(() => caches.match("/")));
    return;
  }
  event.respondWith(caches.match(event.request).then((cached) => cached || fetch(event.request).then((response) => {
    if (response.ok) {
      // Clone before returning the response. Once the browser starts consuming
      // its body, cloning it later from the async cache callback throws.
      const copy = response.clone();
      event.waitUntil(caches.open(CACHE).then((cache) => cache.put(event.request, copy)).catch(() => undefined));
    }
    return response;
  })));
});
