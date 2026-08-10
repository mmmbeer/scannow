import { FileText, GripVertical, LoaderCircle, Plus, Trash2 } from "lucide-react";
import { MutableRefObject, PointerEvent } from "react";
import type { ScanPage } from "../types";

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

export function PageRail({ pages, selectedId, mobileRail, checkedPageIds, draggedId, dragOverId, draggedPageIdRef, dragTargetIdRef, setSelectedId, setMobileRail, setDragOverId, openAddPages, toggleAllPages, toggleCheckedPage, beginPageDrag, finishPageDrag, reorderPage, removePage, runOcr, busy }: {
  pages: ScanPage[];
  selectedId: string | null;
  mobileRail: boolean;
  checkedPageIds: string[];
  draggedId: string | null;
  dragOverId: string | null;
  draggedPageIdRef: MutableRefObject<string | null>;
  dragTargetIdRef: MutableRefObject<string | null>;
  setSelectedId: (id: string) => void;
  setMobileRail: (open: boolean) => void;
  setDragOverId: (id: string | null) => void;
  openAddPages: () => void;
  toggleAllPages: () => void;
  toggleCheckedPage: (id: string) => void;
  beginPageDrag: (id: string) => void;
  finishPageDrag: () => void;
  reorderPage: (source: string | null, target: string | null) => void;
  removePage: (id: string) => void;
  runOcr: (ids: string[]) => void;
  busy: boolean;
}) {
  const trackPointerDrag = (event: PointerEvent<HTMLButtonElement>) => {
    if (!draggedPageIdRef.current) return;
    event.preventDefault();
    const row = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLTableRowElement>("tr[data-page-id]");
    const targetId = row?.dataset.pageId ?? null;
    if (!targetId) return;
    dragTargetIdRef.current = targetId;
    setDragOverId(targetId);
  };

  const dropPointerDrag = (event: PointerEvent<HTMLButtonElement>) => {
    if (!draggedPageIdRef.current) return;
    event.preventDefault();
    reorderPage(draggedPageIdRef.current, dragTargetIdRef.current);
    finishPageDrag();
  };

  return <aside className={`page-rail ${mobileRail ? "open" : ""}`}>
    <div className="rail-header"><div><span className="eyebrow">Document</span><strong>{pages.length} page{pages.length === 1 ? "" : "s"}</strong></div><button className="icon-button" onClick={openAddPages} title="Add pages" aria-label="Add pages"><Plus size={18} /></button></div>
    <div className="page-table-scroll">
      <table className="page-table">
        <thead><tr><th aria-label="Reorder" /><th className="select-column"><input type="checkbox" checked={checkedPageIds.length === pages.length} onChange={toggleAllPages} aria-label={checkedPageIds.length === pages.length ? "Clear page selection" : "Select every page"} /></th><th>Page</th><th>Current action</th><th aria-label="Page actions" /></tr></thead>
        <tbody>{pages.map((page, index) => <tr
          className={`${selectedId === page.id ? "selected" : ""} ${draggedId === page.id ? "dragging" : ""} ${dragOverId === page.id && draggedId !== page.id ? "drag-over" : ""}`}
          key={page.id}
          data-page-id={page.id}
          onClick={() => { setSelectedId(page.id); setMobileRail(false); }}
          onDragEnter={() => {
            if (!draggedPageIdRef.current) return;
            dragTargetIdRef.current = page.id;
            setDragOverId(page.id);
          }}
          onDragOver={(event) => { if (draggedPageIdRef.current) event.preventDefault(); }}
          onDrop={(event) => {
            if (!draggedPageIdRef.current) return;
            event.preventDefault();
            event.stopPropagation();
            reorderPage(draggedPageIdRef.current, page.id);
            finishPageDrag();
          }}
        >
          <td><button
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
          ><GripVertical size={18} /></button></td>
          <td className="select-column"><input type="checkbox" checked={checkedPageIds.includes(page.id)} onClick={(event) => event.stopPropagation()} onChange={() => toggleCheckedPage(page.id)} aria-label={`Select page ${index + 1} for a multi-page action`} /></td>
          <td><button className="page-cell" onClick={() => { setSelectedId(page.id); setMobileRail(false); }}>
            <span className="table-thumb"><img src={page.source} alt="" />{pageIsProcessing(page) && <span className="thumb-spinner"><LoaderCircle className="spin" size={18} /></span>}</span>
            <span><strong>Page {index + 1}</strong><small>{Math.round(page.width / 100) / 10} MP</small></span>
          </button></td>
          <td><span className={`page-status ${pageIsProcessing(page) ? "processing" : page.processingStatus}`}>{pageIsProcessing(page) && <LoaderCircle className="spin" size={13} />}{pageActivity(page)}</span></td>
          <td><button className="icon-button danger-text row-delete" onClick={(event) => { event.stopPropagation(); removePage(page.id); }} aria-label={`Remove page ${index + 1}`}><Trash2 size={16} /></button></td>
        </tr>)}</tbody>
      </table>
    </div>
    <div className="rail-actions">
      <button className="rail-add rail-add-pages" onClick={openAddPages}><Plus size={17} /> Add pages</button>
      <button className="rail-add rail-ocr" onClick={() => runOcr(checkedPageIds)} disabled={!checkedPageIds.length || busy}><FileText size={17} /> OCR {checkedPageIds.length ? `${checkedPageIds.length} selected` : "selected pages"}</button>
    </div>
  </aside>;
}
