import { Smartphone, WifiOff } from "lucide-react";
import type { ConfirmDialog } from "../types";
import { Modal } from "./common";

export function InstallHelpDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;
  return <Modal eyebrow="Installable offline app" title="Add ScanNow! to your phone" onClose={onClose} className="install-modal" bodyClassName="install-body" footer={<><span /><button className="button primary" onClick={onClose}>Got it</button></>}>
    <div className="install-icon"><Smartphone size={31} /></div>
    <div><h3>iPhone or iPad</h3><p>Open this page in Safari, tap the Share button, then choose <strong>Add to Home Screen</strong>.</p></div>
    <div><h3>Android or desktop Chrome</h3><p>Open the browser menu and choose <strong>Install app</strong> or <strong>Add to Home screen</strong>.</p></div>
    <div className="offline-note"><WifiOff size={20} /><span><strong>Offline after installation</strong><small>The scanner, computer vision, OCR language data, and saved library are available without a network connection after the initial offline setup finishes.</small></span></div>
  </Modal>;
}

export function ConfirmDialogView({ dialog, onClose }: { dialog: ConfirmDialog | null; onClose: () => void }) {
  if (!dialog) return null;
  return <Modal eyebrow="Please confirm" title={dialog.title} onClose={onClose} className="confirm-modal" bodyClassName="confirm-body" footer={<><button className="button secondary" onClick={onClose}>Cancel</button><button className={`button ${dialog.danger ? "danger" : "primary"}`} onClick={() => { const action = dialog.onConfirm; onClose(); void action(); }}>{dialog.confirmLabel}</button></>}><p>{dialog.message}</p></Modal>;
}
