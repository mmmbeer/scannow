"use client";

import type { LibraryDocument } from "./local-library";
import { ChangeEvent, useEffect, useRef, useState } from "react";
import { AddPagesDialog, CameraDialog } from "./scanner/components/capture-dialogs";
import { AppLoader, BusyIndicators } from "./scanner/components/common";
import { CropModal } from "./scanner/components/crop-modal";
import { DocumentViewer, EmptyScanner } from "./scanner/components/document-viewer";
import { DownloadDialog, OcrDialog, PdfOptionsDialog } from "./scanner/components/export-dialogs";
import { ScannerHeader } from "./scanner/components/header";
import { LibraryDialog } from "./scanner/components/library-dialog";
import { PageRail } from "./scanner/components/page-rail";
import { SeoContent } from "./scanner/components/seo-content";
import { ToolsPanel } from "./scanner/components/tools-panel";
import { ConfirmDialogView, InstallHelpDialog } from "./scanner/components/app-dialogs";
import { defaultDocumentName } from "./scanner/format";
import { useCamera } from "./scanner/hooks/use-camera";
import { useLocalLibrary } from "./scanner/hooks/use-local-library";
import { useOcr } from "./scanner/hooks/use-ocr";
import { usePageCollection } from "./scanner/hooks/use-page-collection";
import { usePdfExport } from "./scanner/hooks/use-pdf-export";
import { usePwa } from "./scanner/hooks/use-pwa";
import type { ConfirmDialog, Toast } from "./scanner/types";

export default function Home() {
  const [appReady, setAppReady] = useState(false);
  const [startupMessage, setStartupMessage] = useState("Opening your local workspace…");
  const [startupProgress, setStartupProgress] = useState(68);
  const [busy, setBusy] = useState<string | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialog | null>(null);
  const [mobileRail, setMobileRail] = useState(false);
  const [cropOpen, setCropOpen] = useState(false);
  const [addPagesOpen, setAddPagesOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const toastCounter = useRef(0);

  const notify = (message: string) => {
    const id = ++toastCounter.current;
    setToasts((current) => [...current, { id, message }]);
    window.setTimeout(() => setToasts((current) => current.filter((toast) => toast.id !== id)), 2800);
  };

  const pages = usePageCollection(notify, setBusy);
  const ocr = useOcr(pages.pages, pages.setPages, pages.selectedId, pages.setSelectedId, notify, setBusy);
  const pdf = usePdfExport(pages.pages, pages.setPages, ocr.recognizePages, notify, setBusy);
  const library = useLocalLibrary(
    pages.pages,
    pages.setPages,
    pages.setSelectedId,
    pages.setCheckedPageIds,
    pdf.pdfName,
    pdf.setPdfName,
    notify,
    setBusy,
  );
  const camera = useCamera(pages.pages, pages.addFiles);
  const pwa = usePwa(camera.streamRef, notify);

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

  useEffect(() => {
    void library.refreshLibrary();
    // The device-local library is loaded once when the app shell mounts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openAddPages = () => {
    setMobileRail(false);
    setAddPagesOpen(true);
  };

  const chooseCamera = () => {
    setAddPagesOpen(false);
    void camera.startCamera();
  };

  const chooseImages = () => {
    setAddPagesOpen(false);
    window.setTimeout(() => inputRef.current?.click(), 0);
  };

  const resetDocument = () => {
    pages.resetPages();
    pdf.setPdfName(defaultDocumentName());
    library.clearCurrentDocument();
    library.setLibraryOpen(false);
  };

  const startNewDocument = () => {
    if (!pages.pages.length) {
      resetDocument();
      setAddPagesOpen(true);
      return;
    }
    library.setLibraryOpen(false);
    setConfirmDialog({
      title: "Start a new scan?",
      message: "The current pages will leave this session. Save the document first if you want to keep it in your local library.",
      confirmLabel: "Start new scan",
      onConfirm: () => { resetDocument(); setAddPagesOpen(true); },
    });
  };

  const confirmClearSession = () => {
    pdf.setSettingsOpen(false);
    setConfirmDialog({
      title: "Clear every page?",
      message: "All pages will be removed from this session. Documents already saved in your local library will not be affected.",
      confirmLabel: "Clear session",
      danger: true,
      onConfirm: resetDocument,
    });
  };

  const confirmDeleteDocument = (document: LibraryDocument) => {
    library.setLibraryOpen(false);
    setConfirmDialog({
      title: "Delete this document?",
      message: `“${document.name}” and all of its pages will be removed from this device. This cannot be undone.`,
      confirmLabel: "Delete document",
      danger: true,
      onConfirm: () => library.removeSaved(document.id),
    });
  };

  const handleFiles = async (event: ChangeEvent<HTMLInputElement>) => {
    const ids = await pages.addFiles(Array.from(event.target.files ?? []));
    event.target.value = "";
    if (ids.length) notify(`${ids.length} page${ids.length === 1 ? "" : "s"} added. Edge detection is running in the background.`);
  };

  const selected = pages.selected;
  const processing = pages.pages.some((page) => page.processingStatus === "processing" || page.processingStatus === "queued");

  return <>
    {!appReady && <AppLoader message={startupMessage} progress={startupProgress} />}
    <main className="app-shell" onDragOver={(event) => event.preventDefault()} onDrop={pages.onDrop} aria-busy={!appReady}>
      <ScannerHeader
        pageCount={pages.pages.length}
        documentCount={library.documents.length}
        mobileRail={mobileRail}
        setMobileRail={setMobileRail}
        isOnline={pwa.isOnline}
        isStandalone={pwa.isStandalone}
        installApp={() => void pwa.installApp()}
        showLibrary={library.showLibrary}
        saveCurrent={() => void library.saveCurrent()}
        openSettings={() => pdf.setSettingsOpen(true)}
        openDownload={() => pdf.setDownloadOpen(true)}
        busy={Boolean(busy)}
        processing={processing}
        saved={Boolean(library.currentDocumentId)}
      />

      <section className={`workspace ${pages.pages.length ? "has-pages" : ""}`}>
        {pages.pages.length > 0 && <PageRail
          pages={pages.pages}
          selectedId={selected?.id ?? null}
          mobileRail={mobileRail}
          checkedPageIds={pages.checkedPageIds}
          draggedId={pages.draggedId}
          dragOverId={pages.dragOverId}
          draggedPageIdRef={pages.draggedPageId}
          dragTargetIdRef={pages.dragTargetId}
          setSelectedId={pages.setSelectedId}
          setMobileRail={setMobileRail}
          setDragOverId={pages.setDragOverId}
          openAddPages={openAddPages}
          toggleAllPages={pages.toggleAllPages}
          toggleCheckedPage={pages.toggleCheckedPage}
          beginPageDrag={pages.beginPageDrag}
          finishPageDrag={pages.finishPageDrag}
          reorderPage={pages.reorderPage}
          removePage={pages.removePage}
          runOcr={(ids) => { setMobileRail(false); void ocr.runOcr(ids); }}
          busy={Boolean(busy)}
        />}

        <section className="canvas-area">
          {!pages.pages.length ? <EmptyScanner hasDocuments={library.documents.length > 0} openAddPages={openAddPages} showLibrary={library.showLibrary} /> : selected ? <DocumentViewer
            page={selected}
            pageCount={pages.pages.length}
            pageIndex={pages.selectedIndex}
            previewUrl={pages.previewUrl}
            checkedPageIds={pages.checkedPageIds}
            selectRelativePage={pages.selectRelativePage}
            updatePage={pages.updateSelected}
            openCrop={() => setCropOpen(true)}
            runOcr={(ids) => void ocr.runOcr(ids)}
          /> : null}
        </section>

        {selected && <ToolsPanel
          page={selected}
          pageIndex={pages.selectedIndex}
          pageCount={pages.pages.length}
          checkedPageIds={pages.checkedPageIds}
          busy={Boolean(busy)}
          updatePage={pages.updateSelected}
          redetect={() => void pages.redetect()}
          openCrop={() => setCropOpen(true)}
          openOcr={() => ocr.setOcrOpen(true)}
          runOcr={(ids) => void ocr.runOcr(ids)}
          movePage={pages.movePage}
          removePage={pages.removePage}
        />}
      </section>

      <input ref={inputRef} className="visually-hidden" type="file" multiple accept="image/*,.heic,.heif" onChange={(event) => void handleFiles(event)} />
      <AddPagesDialog open={addPagesOpen} onClose={() => setAddPagesOpen(false)} useCamera={chooseCamera} chooseImages={chooseImages} />
      <CameraDialog open={camera.cameraOpen} error={camera.cameraError} sessionCount={camera.cameraSessionIds.length} processingCount={camera.cameraProcessing} flash={camera.cameraFlash} videoRef={camera.videoRef} inputRef={inputRef} onClose={camera.closeCamera} capture={() => void camera.capturePhoto()} />
      {cropOpen && selected && <CropModal page={selected} onChange={(corners) => pages.updateSelected({ corners })} onDetect={pages.redetect} onClose={() => setCropOpen(false)} />}
      <OcrDialog open={ocr.ocrOpen} page={selected} pageIndex={pages.selectedIndex} busy={Boolean(busy)} onClose={() => ocr.setOcrOpen(false)} rerun={() => selected && void ocr.runOcr([selected.id])} copy={() => void ocr.copyOcr()} updateText={(text) => pages.updateSelected({ ocr: text })} />
      <DownloadDialog open={pdf.downloadOpen} onClose={() => pdf.setDownloadOpen(false)} name={pdf.pdfName} setName={pdf.setPdfName} pages={pages.pages} pageSize={pdf.pageSize} searchable={pdf.searchable} confirm={pdf.confirmPdfDownload} />
      <PdfOptionsDialog open={pdf.settingsOpen} onClose={() => pdf.setSettingsOpen(false)} pages={pages.pages} name={pdf.pdfName} setName={pdf.setPdfName} pageSize={pdf.pageSize} setPageSize={pdf.setPageSize} quality={pdf.quality} setQuality={pdf.setQuality} searchable={pdf.searchable} setSearchable={pdf.setSearchable} clearSession={confirmClearSession} exportText={pdf.exportText} openDownload={() => { pdf.setSettingsOpen(false); pdf.setDownloadOpen(true); }} runAllOcr={() => void ocr.runOcr(pages.pages.map((page) => page.id))} busy={Boolean(busy)} />
      <LibraryDialog open={library.libraryOpen} onClose={() => library.setLibraryOpen(false)} documents={library.filteredDocuments} search={library.librarySearch} setSearch={library.setLibrarySearch} storage={library.storageStatus} newScan={startNewDocument} openDocument={(id) => void library.openSaved(id)} deleteDocument={confirmDeleteDocument} />
      <InstallHelpDialog open={pwa.installHelpOpen} onClose={() => pwa.setInstallHelpOpen(false)} />
      <ConfirmDialogView dialog={confirmDialog} onClose={() => setConfirmDialog(null)} />
      <BusyIndicators busy={busy} pdfBuilding={pdf.pdfBuilding} toasts={toasts} />
    </main>
    {!pages.pages.length && <SeoContent />}
  </>;
}
