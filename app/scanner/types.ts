export type Point = { x: number; y: number };

export type OcrLine = {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

export type FilterMode = "color" | "enhance" | "gray" | "bw";

export type ScanPage = {
  id: string;
  name: string;
  source: string;
  width: number;
  height: number;
  corners: Point[];
  rotation: number;
  flipX: boolean;
  flipY: boolean;
  filter: FilterMode;
  brightness: number;
  contrast: number;
  ocr: string;
  ocrLines: OcrLine[];
  ocrLayoutVersion: number;
  ocrStatus: "idle" | "running" | "done" | "error";
  processingStatus: "queued" | "processing" | "ready" | "error";
};

export type Toast = { id: number; message: string };

export type StorageStatus = {
  persisted: boolean;
  usage: number;
  quota: number;
};

export type ConfirmDialog = {
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm: () => void | Promise<void>;
  danger?: boolean;
};

export type InstallPrompt = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export type Notify = (message: string) => void;

export type SetBusy = (message: string | null) => void;
