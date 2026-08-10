import { Archive, FilePlus2, FolderOpen, HardDrive, LockKeyhole, Search, Trash2 } from "lucide-react";
import type { LibraryDocument } from "../../local-library";
import { formatBytes } from "../format";
import type { StorageStatus } from "../types";
import { Modal } from "./common";

export function LibraryDialog({ open, onClose, documents, search, setSearch, storage, newScan, openDocument, deleteDocument }: {
  open: boolean;
  onClose: () => void;
  documents: LibraryDocument[];
  search: string;
  setSearch: (value: string) => void;
  storage: StorageStatus;
  newScan: () => void;
  openDocument: (id: string) => void;
  deleteDocument: (document: LibraryDocument) => void;
}) {
  if (!open) return null;
  return <Modal eyebrow="Stored only on this device" title="Document library" onClose={onClose} className="library-modal" bodyClassName="library-scroll-body" footer={<><span className="library-privacy"><LockKeyhole size={15} /> Nothing in this library is synced or uploaded.</span><button className="button secondary" onClick={onClose}>Close</button></>}>
    <div className="library-toolbar"><label className="library-search"><Search size={17} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search documents" aria-label="Search local documents" /></label><button className="button primary" onClick={newScan}><FilePlus2 size={17} /> New scan</button></div>
    <div className="library-body">
      <div className="storage-card">
        <div className="storage-heading"><span><HardDrive size={18} /><strong>Local storage</strong></span><small>{formatBytes(storage.usage)} of {formatBytes(storage.quota)} used</small></div>
        <div className="storage-track"><span style={{ width: `${storage.quota ? Math.min(100, (storage.usage / storage.quota) * 100) : 0}%` }} /></div>
        <p>{storage.persisted ? "Protected from routine browser cleanup." : "Your browser controls retention. Installing the app and using it regularly improves persistence."}</p>
      </div>
      {documents.length ? <div className="document-grid">{documents.map((document) => <article className="document-card" key={document.id}>
        <button className="document-preview-button" onClick={() => openDocument(document.id)} aria-label={`Open ${document.name}`}><img src={document.thumbnail} alt="" /></button>
        <div className="document-card-body"><h3>{document.name}</h3><p>{document.pageCount} page{document.pageCount === 1 ? "" : "s"} · {formatBytes(document.size)}</p><small>Updated {new Date(document.updatedAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}</small></div>
        <div className="document-card-actions"><button className="button secondary" onClick={() => openDocument(document.id)}><FolderOpen size={16} /> Open</button><button className="icon-button danger-text" onClick={() => deleteDocument(document)} aria-label={`Delete ${document.name}`}><Trash2 size={17} /></button></div>
      </article>)}</div> : <div className="library-empty"><Archive size={43} /><h3>{search ? "No matching documents" : "Your local library is empty"}</h3><p>{search ? "Try a different document name." : "Scan pages, then choose Save locally. Original images, edits, and OCR text remain on this device."}</p></div>}
    </div>
  </Modal>;
}
