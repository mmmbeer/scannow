import { LoaderCircle, X } from "lucide-react";
import { ReactNode, useEffect, useId } from "react";

export function ToolButton({ label, onClick, children, active = false, disabled = false }: {
  label: string;
  onClick: () => void;
  children: ReactNode;
  active?: boolean;
  disabled?: boolean;
}) {
  return (
    <button className={`tool-button ${active ? "active" : ""}`} onClick={onClick} title={label} aria-label={label} disabled={disabled}>
      {children}<span>{label}</span>
    </button>
  );
}

export function Modal({ eyebrow, title, onClose, children, footer, className = "", bodyClassName = "", backdropClassName = "", dark = false }: {
  eyebrow: string;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer: ReactNode;
  className?: string;
  bodyClassName?: string;
  backdropClassName?: string;
  dark?: boolean;
}) {
  const titleId = useId();
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  return (
    <div className={`modal-backdrop ${backdropClassName}`} role="dialog" aria-modal="true" aria-labelledby={titleId} onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className={`modal-card ${className}`} onMouseDown={(event) => event.stopPropagation()}>
        <div className={`modal-header ${dark ? "dark" : ""}`}>
          <div><p className="eyebrow">{eyebrow}</p><h2 id={titleId}>{title}</h2></div>
          <button className={`icon-button ${dark ? "dark-button" : ""}`} onClick={onClose} aria-label="Close dialog"><X size={21} /></button>
        </div>
        <div className={`modal-body ${bodyClassName}`}>{children}</div>
        <div className="modal-footer">{footer}</div>
      </div>
    </div>
  );
}

export function AppLoader({ message, progress }: { message: string; progress: number }) {
  return (
    <main className="app-loader" role="status" aria-live="polite" aria-label="Preparing ScanNow">
      <div className="loader-content">
        <img className="loader-wordmark" src="/scannow-logo.svg" alt="ScanNow!" />
        <div className="loader-scanner" aria-hidden="true">
          <div className="loader-paper"><span /><span /><span /><span /></div>
          <div className="loader-device"><img src="/scannow-mark.svg" alt="" /><i /></div>
          <div className="loader-laser" />
        </div>
        <strong>Preparing your private scanner</strong>
        <p>{message}</p>
        <div className="loader-progress" aria-hidden="true"><span style={{ width: `${progress}%` }} /></div>
        <small>Advanced tools load only when you choose them, keeping startup light.</small>
      </div>
    </main>
  );
}

export function BusyIndicators({ busy, pdfBuilding, toasts }: {
  busy: string | null;
  pdfBuilding: boolean;
  toasts: Array<{ id: number; message: string }>;
}) {
  return <>
    {pdfBuilding && <div className="pdf-building-backdrop" role="alert" aria-live="assertive"><div className="pdf-building-card"><img src="/scannow-mark.svg" alt="" /><LoaderCircle className="spin pdf-spinner" size={34} /><strong>Building your PDF</strong><p>{busy || "Preparing the document…"}</p><small>Keep ScanNow! open until the download begins.</small></div></div>}
    {busy && !pdfBuilding && <div className="busy-pill" role="status"><LoaderCircle className="spin" size={17} /> {busy}</div>}
    <div className="toast-stack" aria-live="polite">{toasts.map((toast) => <div className="toast" key={toast.id}>{toast.message}</div>)}</div>
  </>;
}
