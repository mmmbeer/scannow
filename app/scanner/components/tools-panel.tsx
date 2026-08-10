import { ArrowDown, ArrowUp, Check, Crop, FileText, FlipHorizontal2, FlipVertical2, RotateCcw, RotateCw, Sparkles, Trash2 } from "lucide-react";
import type { FilterMode, ScanPage } from "../types";
import { ToolButton } from "./common";

export function ToolsPanel({ page, pageIndex, pageCount, checkedPageIds, busy, updatePage, redetect, openCrop, openOcr, runOcr, movePage, removePage }: {
  page: ScanPage;
  pageIndex: number;
  pageCount: number;
  checkedPageIds: string[];
  busy: boolean;
  updatePage: (changes: Partial<ScanPage>) => void;
  redetect: () => void;
  openCrop: () => void;
  openOcr: () => void;
  runOcr: (ids: string[]) => void;
  movePage: (id: string, direction: -1 | 1) => void;
  removePage: (id: string) => void;
}) {
  return <aside className="tools-panel">
    <div className="panel-heading"><div><p className="eyebrow">Edit page {pageIndex + 1}</p><h2>Scan tools</h2></div><Sparkles size={20} /></div>
    <section className="tool-section">
      <div className="section-title"><span>Framing</span><button onClick={redetect} disabled={busy}>Detect again</button></div>
      <button className="wide-action" onClick={openCrop}><span className="wide-icon"><Crop size={20} /></span><span><strong>Crop &amp; deskew</strong><small>Adjust the four page corners</small></span><span className="status-dot"><Check size={12} /></span></button>
    </section>
    <section className="tool-section">
      <div className="section-title"><span>Orientation</span></div>
      <div className="tool-grid">
        <ToolButton label="Left" onClick={() => updatePage({ rotation: (page.rotation + 270) % 360 })}><RotateCcw size={20} /></ToolButton>
        <ToolButton label="Right" onClick={() => updatePage({ rotation: (page.rotation + 90) % 360 })}><RotateCw size={20} /></ToolButton>
        <ToolButton label="Mirror" onClick={() => updatePage({ flipX: !page.flipX })} active={page.flipX}><FlipHorizontal2 size={20} /></ToolButton>
        <ToolButton label="Flip" onClick={() => updatePage({ flipY: !page.flipY })} active={page.flipY}><FlipVertical2 size={20} /></ToolButton>
      </div>
    </section>
    <section className="tool-section">
      <div className="section-title"><span>Appearance</span><button onClick={() => updatePage({ filter: "enhance", brightness: 0, contrast: 12 })}>Reset</button></div>
      <div className="filter-tabs">{(["color", "enhance", "gray", "bw"] as FilterMode[]).map((filter) => <button key={filter} className={page.filter === filter ? "active" : ""} onClick={() => updatePage({ filter })}>{filter === "bw" ? "B&W" : filter[0].toUpperCase() + filter.slice(1)}</button>)}</div>
      <label className="range-row"><span>Brightness <output>{page.brightness > 0 ? "+" : ""}{page.brightness}</output></span><input type="range" min="-40" max="40" value={page.brightness} onChange={(event) => updatePage({ brightness: Number(event.target.value) })} /></label>
      <label className="range-row"><span>Contrast <output>{page.contrast > 0 ? "+" : ""}{page.contrast}</output></span><input type="range" min="-30" max="55" value={page.contrast} onChange={(event) => updatePage({ contrast: Number(event.target.value) })} /></label>
    </section>
    <section className="tool-section">
      <div className="section-title"><span>Recognize text</span><span className="local-tag">On device</span></div>
      <button className="wide-action" onClick={() => checkedPageIds.length > 1 ? runOcr(checkedPageIds) : page.ocr ? openOcr() : runOcr([page.id])} disabled={page.ocrStatus === "running" || busy}>
        <span className="wide-icon"><FileText size={20} /></span><span><strong>{checkedPageIds.length > 1 ? `Run OCR on ${checkedPageIds.length} selected pages` : page.ocr ? "View recognized text" : "Run OCR on this page"}</strong><small>{checkedPageIds.length > 1 ? "Process the checked rows in page order" : page.ocr ? `${page.ocr.split(/\s+/).filter(Boolean).length} words found` : "Extract selectable text locally"}</small></span>
      </button>
    </section>
    <div className="page-actions">
      <button disabled={pageIndex === 0} onClick={() => movePage(page.id, -1)}><ArrowUp size={16} /> Earlier</button>
      <button disabled={pageIndex === pageCount - 1} onClick={() => movePage(page.id, 1)}><ArrowDown size={16} /> Later</button>
      <button className="danger" onClick={() => removePage(page.id)}><Trash2 size={16} /> Remove</button>
    </div>
  </aside>;
}
