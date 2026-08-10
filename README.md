# ScanNow!

ScanNow! is a privacy-first, installable document scanner that turns camera captures or uploaded images into polished, uniformly sized PDFs. Page images, OCR text, and saved documents stay in the browser on the user’s device—there is no application server storage.

## Features

- Continuous camera capture: photograph the next page immediately while earlier pages are processed in a Web Worker.
- Automatic page-edge detection, perspective correction, crop, and deskew with OpenCV.js.
- Page table with thumbnails, live processing status, spinners, and drag-and-drop reordering.
- Rotate, mirror, flip, brightness, contrast, color enhancement, grayscale, and black-and-white filters.
- On-device OCR with Tesseract.js and searchable PDF export with jsPDF.
- Consistently scaled US Letter or A4 PDF pages with configurable image quality.
- Offline-ready Progressive Web App that can be installed on phones and desktops.
- Large local document library using the Origin Private File System, with IndexedDB fallback for browser compatibility.
- Custom accessible dialogs, confirmations, progress indicators, and toast notifications.

## Privacy and storage

All scanning, image processing, OCR, PDF generation, and library operations run locally in the browser. The library uses browser-managed device storage. Clearing site data or using private-browsing mode may remove saved documents, so export important scans as PDF backups.

## Run locally

Requirements: Node.js 22.13 or newer.

```bash
npm install
npm run dev
```

Open the local address shown by the development server. Camera access requires a secure context; `localhost` is treated as secure by modern browsers.

## Validate a production build

```bash
npm run lint
npm run build
```

`npm run lint` also enforces the 500-line source-file limit.

## Architecture

- `app/page.tsx` composes the scanner and owns only cross-feature session coordination.
- `app/scanner/components/` contains focused interface regions and dialogs.
- `app/scanner/hooks/` owns page collections, OCR, PDF export, camera capture, local-library state, and PWA lifecycle independently.
- `app/scanner/image-processing.ts`, `ocr.ts`, `pdf-export.ts`, and `edge-detection.ts` contain browser processing services with no interface state.
- `app/local-library.ts` is the persistence boundary for OPFS and IndexedDB.

## Open-source libraries

- A lightweight Canvas 2D mesh transform for perspective correction without a large computer-vision runtime
- [Tesseract.js](https://github.com/naptha/tesseract.js) for local OCR
- [jsPDF](https://github.com/parallax/jsPDF) for browser-side PDF creation
- [Lucide](https://lucide.dev/) for interface icons

## Browser support

Recent Chrome, Edge, and Safari releases provide the best camera, PWA, and persistent-storage support. Core image import, editing, OCR, and PDF export remain available when camera installation features are unavailable.
