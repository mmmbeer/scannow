import { useMemo, useRef, useState } from "react";
import type { ScanPage } from "../types";

export function useCamera(pages: ScanPage[], addFiles: (files: File[]) => Promise<string[]>) {
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const [cameraSessionIds, setCameraSessionIds] = useState<string[]>([]);
  const [cameraFlash, setCameraFlash] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const cameraProcessing = useMemo(
    () => pages.filter((page) => cameraSessionIds.includes(page.id) && page.processingStatus !== "ready").length,
    [cameraSessionIds, pages],
  );

  const startCamera = async () => {
    setCameraOpen(true);
    setCameraError("");
    setCameraSessionIds([]);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      });
      streamRef.current = stream;
      window.setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          void videoRef.current.play();
        }
      }, 0);
    } catch {
      setCameraError("Camera access is unavailable. Check browser permission or add pages from your device instead.");
    }
  };

  const closeCamera = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setCameraOpen(false);
  };

  const capturePhoto = async () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")?.drawImage(video, 0, 0);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.94));
    if (!blob) return;
    setCameraFlash(true);
    window.setTimeout(() => setCameraFlash(false), 130);
    const ids = await addFiles([new File([blob], `scan-${pages.length + 1}.jpg`, { type: "image/jpeg" })]);
    setCameraSessionIds((current) => [...current, ...ids]);
  };

  return {
    cameraOpen, cameraError, cameraSessionIds, cameraFlash, cameraProcessing,
    videoRef, streamRef, startCamera, closeCamera, capturePhoto,
  };
}
