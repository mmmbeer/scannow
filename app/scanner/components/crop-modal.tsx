import { Check, ScanLine } from "lucide-react";
import { PointerEvent, useRef, useState } from "react";
import { insetCorners } from "../image-processing";
import type { Point, ScanPage } from "../types";
import { Modal } from "./common";

export function CropModal({ page, onChange, onDetect, onClose }: {
  page: ScanPage;
  onChange: (corners: Point[]) => void;
  onDetect: () => Promise<Point[] | null>;
  onClose: () => void;
}) {
  const [corners, setCorners] = useState(page.corners);
  const imageRef = useRef<HTMLImageElement>(null);
  const dragRef = useRef<number | null>(null);

  const moveCorner = (event: PointerEvent<HTMLDivElement>) => {
    if (dragRef.current === null || !imageRef.current) return;
    const rect = imageRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height));
    setCorners((current) => current.map((point, index) => index === dragRef.current ? { x, y } : point));
  };

  return <Modal eyebrow="Perspective correction" title="Crop & deskew" onClose={onClose} className="crop-modal" bodyClassName="crop-body" footer={<><button className="button secondary" onClick={async () => { const detected = await onDetect(); if (detected) setCorners(detected); }}><ScanLine size={17} /> Detect edges</button><div className="footer-right"><button className="button ghost" onClick={() => setCorners(insetCorners())}>Reset</button><button className="button primary" onClick={() => { onChange(corners); onClose(); }}><Check size={17} /> Apply crop</button></div></>}>
    <div className="crop-workspace" onPointerMove={moveCorner} onPointerUp={() => { dragRef.current = null; }} onPointerCancel={() => { dragRef.current = null; }}>
      <div className="crop-image-wrap">
        <img ref={imageRef} src={page.source} alt="Original page with crop handles" draggable={false} />
        <svg className="crop-overlay" viewBox="0 0 1000 1000" preserveAspectRatio="none" aria-hidden="true"><polygon points={corners.map((point) => `${point.x * 1000},${point.y * 1000}`).join(" ")} /></svg>
        {corners.map((point, index) => <button key={index} className="corner-handle" style={{ left: `${point.x * 100}%`, top: `${point.y * 100}%` }} onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); dragRef.current = index; }} aria-label={`Move crop corner ${index + 1}`} />)}
      </div>
    </div>
  </Modal>;
}
