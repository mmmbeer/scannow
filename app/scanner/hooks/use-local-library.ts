import { Dispatch, SetStateAction, useMemo, useState } from "react";
import {
  deleteDocument,
  LibraryDocument,
  listDocuments,
  loadDocument,
  requestPersistentStorage,
  saveDocument,
} from "../../local-library";
import { createThumbnail } from "../image-processing";
import type { Notify, ScanPage, SetBusy, StorageStatus } from "../types";
import { revokePages } from "./use-page-collection";

export function useLocalLibrary(
  pages: ScanPage[],
  setPages: Dispatch<SetStateAction<ScanPage[]>>,
  setSelectedId: (id: string | null) => void,
  setCheckedPageIds: Dispatch<SetStateAction<string[]>>,
  pdfName: string,
  setPdfName: Dispatch<SetStateAction<string>>,
  notify: Notify,
  setBusy: SetBusy,
) {
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [documents, setDocuments] = useState<LibraryDocument[]>([]);
  const [librarySearch, setLibrarySearch] = useState("");
  const [currentDocumentId, setCurrentDocumentId] = useState<string | null>(null);
  const [currentDocumentCreatedAt, setCurrentDocumentCreatedAt] = useState<number | undefined>();
  const [storageStatus, setStorageStatus] = useState<StorageStatus>({ persisted: false, usage: 0, quota: 0 });
  const filteredDocuments = useMemo(
    () => documents.filter((document) => document.name.toLowerCase().includes(librarySearch.toLowerCase())),
    [documents, librarySearch],
  );

  const refreshLibrary = async () => {
    try {
      setDocuments(await listDocuments());
      setStorageStatus(await requestPersistentStorage());
    } catch {
      notify("The local document library is unavailable in this browser.");
    }
  };

  const showLibrary = () => {
    setLibraryOpen(true);
    void refreshLibrary();
  };

  const saveCurrent = async () => {
    if (!pages.length) return;
    if (pages.some((page) => page.processingStatus === "processing" || page.processingStatus === "queued")) {
      notify("Wait for background page processing to finish before saving.");
      return;
    }
    setBusy(currentDocumentId ? "Updating local document…" : "Saving to this device…");
    try {
      const saved = await saveDocument({
        id: currentDocumentId ?? undefined,
        name: pdfName,
        pages,
        thumbnail: await createThumbnail(pages[0]),
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

  const openSaved = async (documentId: string) => {
    setBusy("Opening local document…");
    try {
      const result = await loadDocument(documentId);
      revokePages(pages);
      const restored: ScanPage[] = result.pages.map((page) => ({
        ...page,
        ocrLines: page.ocrLines ?? [],
        ocrLayoutVersion: page.ocrLayoutVersion ?? 0,
        ocrStatus: "idle",
        processingStatus: "ready",
      }));
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

  const removeSaved = async (documentId: string) => {
    setBusy("Deleting local document…");
    try {
      await deleteDocument(documentId);
      if (currentDocumentId === documentId) clearCurrentDocument();
      await refreshLibrary();
      notify("Local document deleted.");
    } catch {
      notify("The document could not be deleted.");
    } finally {
      setBusy(null);
    }
  };

  const clearCurrentDocument = () => {
    setCurrentDocumentId(null);
    setCurrentDocumentCreatedAt(undefined);
  };

  return {
    libraryOpen, setLibraryOpen, documents, librarySearch, setLibrarySearch,
    filteredDocuments, storageStatus, currentDocumentId,
    refreshLibrary, showLibrary, saveCurrent, openSaved, removeSaved, clearCurrentDocument,
  };
}
