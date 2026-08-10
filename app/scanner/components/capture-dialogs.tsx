import { Camera, Check, ImagePlus } from "lucide-react";
import { RefObject } from "react";
import { Modal } from "./common";

export function AddPagesDialog({ open, onClose, useCamera, chooseImages }: { open: boolean; onClose: () => void; useCamera: () => void; chooseImages: () => void }) {
  if (!open) return null;
  return <Modal eyebrow="Add to this document" title="How would you like to add pages?" onClose={onClose} className="add-pages-modal" bodyClassName="add-pages-body" footer={<><span /><button className="button secondary" onClick={onClose}>Cancel</button></>}>
    <button className="source-choice" onClick={useCamera}><span className="source-choice-icon"><Camera size={30} /></span><span><strong>Use the camera</strong><small>Capture pages in rapid succession while earlier pages process.</small></span></button>
    <button className="source-choice" onClick={chooseImages}><span className="source-choice-icon"><ImagePlus size={30} /></span><span><strong>Choose images</strong><small>Select one or more existing photos from this device.</small></span></button>
  </Modal>;
}

export function CameraDialog({ open, error, sessionCount, processingCount, flash, videoRef, inputRef, onClose, capture }: {
  open: boolean;
  error: string;
  sessionCount: number;
  processingCount: number;
  flash: boolean;
  videoRef: RefObject<HTMLVideoElement | null>;
  inputRef: RefObject<HTMLInputElement | null>;
  onClose: () => void;
  capture: () => void;
}) {
  if (!open) return null;
  const chooseImages = () => inputRef.current?.click();
  const footer = !error ? <div className="camera-controls continuous-controls">
    <div className="capture-status"><strong>{sessionCount}</strong><span>{sessionCount === 1 ? "page captured" : "pages captured"}{processingCount ? ` · ${processingCount} processing` : sessionCount ? " · ready" : ""}</span></div>
    <button className="capture-button" onClick={capture} aria-label="Capture next page"><span /></button>
    <button className="done-scanning" onClick={onClose} disabled={!sessionCount}><Check size={18} /><span>Done scanning</span></button>
  </div> : <><span /><button className="button secondary" onClick={chooseImages}>Choose images instead</button></>;
  return <Modal eyebrow="Continuous scan" title="Fit each page inside the frame" onClose={onClose} className="camera-modal" bodyClassName="camera-view" backdropClassName="camera-backdrop" dark footer={footer}>
    {error ? <div className="camera-error"><Camera size={42} /><p>{error}</p><button className="button secondary" onClick={chooseImages}>Choose images instead</button></div> : <video ref={videoRef} muted playsInline />}
    {flash && <div className="camera-flash" />}
    {!error && <div className="camera-frame"><i /><i /><i /><i /><span>Tap once per page · processing continues behind the camera</span></div>}
  </Modal>;
}
