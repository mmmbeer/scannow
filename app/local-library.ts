export type LibraryPage = {
  id: string;
  name: string;
  source: string;
  width: number;
  height: number;
  corners: Array<{ x: number; y: number }>;
  rotation: number;
  flipX: boolean;
  flipY: boolean;
  filter: "color" | "enhance" | "gray" | "bw";
  brightness: number;
  contrast: number;
  ocr: string;
};

export type LibraryDocument = {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  pageCount: number;
  size: number;
  thumbnail: string;
};

type StoredPage = Omit<LibraryPage, "source"> & {
  documentId: string;
  order: number;
  storage: "opfs" | "idb";
  storageKey: string;
  mimeType: string;
  size: number;
};

type BlobRecord = { id: string; blob: Blob };

const DB_NAME = "local-pdf-scanner-library";
const DB_VERSION = 1;
const DOCUMENTS = "documents";
const PAGES = "pages";
const BLOBS = "blobs";

function createLocalId() {
  return typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 11)}`;
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

async function openDatabase(): Promise<IDBDatabase> {
  const request = indexedDB.open(DB_NAME, DB_VERSION);
  request.onupgradeneeded = () => {
    const database = request.result;
    if (!database.objectStoreNames.contains(DOCUMENTS)) database.createObjectStore(DOCUMENTS, { keyPath: "id" });
    if (!database.objectStoreNames.contains(PAGES)) {
      const store = database.createObjectStore(PAGES, { keyPath: "id" });
      store.createIndex("documentId", "documentId", { unique: false });
    }
    if (!database.objectStoreNames.contains(BLOBS)) database.createObjectStore(BLOBS, { keyPath: "id" });
  };
  return requestResult(request);
}

async function getOpfsDocumentDirectory(documentId: string, create: boolean): Promise<FileSystemDirectoryHandle | null> {
  if (!("storage" in navigator) || !("getDirectory" in navigator.storage)) return null;
  try {
    const root = await navigator.storage.getDirectory();
    const documents = await root.getDirectoryHandle("documents", { create });
    return await documents.getDirectoryHandle(documentId, { create });
  } catch {
    return null;
  }
}

async function deleteExistingDocument(documentId: string) {
  const database = await openDatabase();
  const read = database.transaction(PAGES, "readonly");
  const readDone = transactionDone(read);
  const oldPages = await requestResult(read.objectStore(PAGES).index("documentId").getAll(documentId)) as StoredPage[];
  await readDone;

  const write = database.transaction([DOCUMENTS, PAGES, BLOBS], "readwrite");
  write.objectStore(DOCUMENTS).delete(documentId);
  oldPages.forEach((page) => {
    write.objectStore(PAGES).delete(page.id);
    if (page.storage === "idb") write.objectStore(BLOBS).delete(page.storageKey);
  });
  await transactionDone(write);
  database.close();

  try {
    const root = await navigator.storage.getDirectory();
    const documents = await root.getDirectoryHandle("documents", { create: true });
    await documents.removeEntry(documentId, { recursive: true });
  } catch {
    // The OPFS entry may not exist or may be unsupported.
  }
}

export async function saveDocument(input: {
  id?: string;
  name: string;
  pages: LibraryPage[];
  thumbnail: string;
  createdAt?: number;
}): Promise<LibraryDocument> {
  const id = input.id ?? createLocalId();
  const now = Date.now();
  if (input.id) await deleteExistingDocument(id);
  const database = await openDatabase();
  const directory = await getOpfsDocumentDirectory(id, true);
  const storedPages: StoredPage[] = [];
  const fallbackBlobs: BlobRecord[] = [];
  let totalSize = 0;

  for (let index = 0; index < input.pages.length; index += 1) {
    const page = input.pages[index];
    const blob = await fetch(page.source).then((response) => response.blob());
    const storageKey = `${page.id}.bin`;
    let storage: "opfs" | "idb" = "idb";
    if (directory) {
      try {
        const fileHandle = await directory.getFileHandle(storageKey, { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(blob);
        await writable.close();
        storage = "opfs";
      } catch {
        fallbackBlobs.push({ id: `${id}:${storageKey}`, blob });
      }
    } else {
      fallbackBlobs.push({ id: `${id}:${storageKey}`, blob });
    }
    totalSize += blob.size;
    storedPages.push({
      id: page.id,
      documentId: id,
      order: index,
      storage,
      storageKey: storage === "opfs" ? storageKey : `${id}:${storageKey}`,
      mimeType: blob.type || "image/jpeg",
      size: blob.size,
      name: page.name,
      width: page.width,
      height: page.height,
      corners: page.corners,
      rotation: page.rotation,
      flipX: page.flipX,
      flipY: page.flipY,
      filter: page.filter,
      brightness: page.brightness,
      contrast: page.contrast,
      ocr: page.ocr,
    });
  }

  const document: LibraryDocument = {
    id,
    name: input.name.trim() || "Scanned document",
    createdAt: input.createdAt ?? now,
    updatedAt: now,
    pageCount: input.pages.length,
    size: totalSize,
    thumbnail: input.thumbnail,
  };
  const transaction = database.transaction([DOCUMENTS, PAGES, BLOBS], "readwrite");
  transaction.objectStore(DOCUMENTS).put(document);
  storedPages.forEach((page) => transaction.objectStore(PAGES).put(page));
  fallbackBlobs.forEach((record) => transaction.objectStore(BLOBS).put(record));
  await transactionDone(transaction);
  database.close();
  return document;
}

export async function listDocuments(): Promise<LibraryDocument[]> {
  const database = await openDatabase();
  const transaction = database.transaction(DOCUMENTS, "readonly");
  const done = transactionDone(transaction);
  const documents = await requestResult(transaction.objectStore(DOCUMENTS).getAll()) as LibraryDocument[];
  await done;
  database.close();
  return documents.sort((left, right) => right.updatedAt - left.updatedAt);
}

async function readStoredBlob(documentId: string, page: StoredPage, database: IDBDatabase): Promise<Blob> {
  if (page.storage === "opfs") {
    const directory = await getOpfsDocumentDirectory(documentId, false);
    if (!directory) throw new Error("Local document folder is unavailable");
    const handle = await directory.getFileHandle(page.storageKey);
    return handle.getFile();
  }
  const transaction = database.transaction(BLOBS, "readonly");
  const done = transactionDone(transaction);
  const record = await requestResult(transaction.objectStore(BLOBS).get(page.storageKey)) as BlobRecord | undefined;
  await done;
  if (!record) throw new Error("Local page file is unavailable");
  return record.blob;
}

export async function loadDocument(documentId: string): Promise<{ document: LibraryDocument; pages: LibraryPage[] }> {
  const database = await openDatabase();
  const transaction = database.transaction([DOCUMENTS, PAGES], "readonly");
  const done = transactionDone(transaction);
  const documentRequest = requestResult(transaction.objectStore(DOCUMENTS).get(documentId)) as Promise<LibraryDocument | undefined>;
  const pagesRequest = requestResult(transaction.objectStore(PAGES).index("documentId").getAll(documentId)) as Promise<StoredPage[]>;
  const [document, storedPages] = await Promise.all([documentRequest, pagesRequest]);
  await done;
  if (!document) {
    database.close();
    throw new Error("Document not found");
  }
  const pages: LibraryPage[] = [];
  for (const page of storedPages.sort((left, right) => left.order - right.order)) {
    const blob = await readStoredBlob(documentId, page, database);
    pages.push({
      id: page.id,
      name: page.name,
      source: URL.createObjectURL(blob),
      width: page.width,
      height: page.height,
      corners: page.corners,
      rotation: page.rotation,
      flipX: page.flipX,
      flipY: page.flipY,
      filter: page.filter,
      brightness: page.brightness,
      contrast: page.contrast,
      ocr: page.ocr,
    });
  }
  database.close();
  return { document, pages };
}

export async function deleteDocument(documentId: string): Promise<void> {
  await deleteExistingDocument(documentId);
}

export async function requestPersistentStorage(): Promise<{ persisted: boolean; usage: number; quota: number }> {
  if (!("storage" in navigator) || !navigator.storage) return { persisted: false, usage: 0, quota: 0 };
  let persisted = false;
  try {
    persisted = typeof navigator.storage.persist === "function" ? await navigator.storage.persist() : false;
  } catch {
    persisted = false;
  }
  const estimate = typeof navigator.storage.estimate === "function" ? await navigator.storage.estimate() : {};
  return { persisted, usage: estimate.usage ?? 0, quota: estimate.quota ?? 0 };
}
