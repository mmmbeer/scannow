import { Archive, Download, Files, LockKeyhole, MoreHorizontal, Save, Smartphone, Wifi, WifiOff } from "lucide-react";

export function ScannerHeader({ pageCount, documentCount, mobileRail, setMobileRail, isOnline, isStandalone, installApp, showLibrary, saveCurrent, openSettings, openDownload, busy, processing, saved }: {
  pageCount: number;
  documentCount: number;
  mobileRail: boolean;
  setMobileRail: (value: boolean | ((current: boolean) => boolean)) => void;
  isOnline: boolean;
  isStandalone: boolean;
  installApp: () => void;
  showLibrary: () => void;
  saveCurrent: () => void;
  openSettings: () => void;
  openDownload: () => void;
  busy: boolean;
  processing: boolean;
  saved: boolean;
}) {
  return <header className="topbar">
    <div className="brand-wrap">
      <button className="icon-button rail-toggle page-rail-toggle" onClick={() => setMobileRail((value) => !value)} aria-label={`${mobileRail ? "Hide" : "Show"} ${pageCount} document page${pageCount === 1 ? "" : "s"}`} disabled={!pageCount}>
        <Files size={19} />{pageCount > 0 && <span className="page-count-badge" aria-hidden="true">{pageCount > 99 ? "99+" : pageCount}</span>}
      </button>
      <img className="brand-mark" src="/scannow-mark.svg" alt="" />
      <div><h1>ScanNow!</h1><p>Camera to clean PDF, entirely in your browser</p></div>
    </div>
    <div className="header-actions">
      <div className={`connectivity-chip ${isOnline ? "online" : "offline"}`}>{isOnline ? <Wifi size={14} /> : <WifiOff size={14} />}<span>{isOnline ? "Online" : "Offline ready"}</span></div>
      <div className="privacy-chip"><LockKeyhole size={14} /><span>Private · device only</span></div>
      {!isStandalone && <button className="button secondary compact install-button" onClick={installApp}><Smartphone size={18} /><span>Install</span></button>}
      <button className="button secondary compact" onClick={showLibrary}><Archive size={18} /><span>Library{documentCount ? ` (${documentCount})` : ""}</span></button>
      {pageCount > 0 && <button className="button secondary compact" onClick={saveCurrent} disabled={busy || processing}><Save size={18} /><span>{saved ? "Save" : "Save locally"}</span></button>}
      <button className="button secondary compact" onClick={openSettings} disabled={!pageCount}><MoreHorizontal size={18} /><span>PDF options</span></button>
      <button className="button primary compact" onClick={openDownload} disabled={!pageCount || busy}><Download size={18} /><span>Download PDF</span></button>
    </div>
  </header>;
}
