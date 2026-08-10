import { createLocalId } from "./id";
import type { Point } from "./types";

type EdgeWorkerReply = { id: string; corners?: Point[]; error?: string };
type PendingRequest = {
  resolve: (corners: Point[]) => void;
  reject: (error: Error) => void;
  timer: number;
};

const edgeRequests = new Map<string, PendingRequest>();
let edgeWorker: Worker | null = null;

function stopEdgeWorker(message: string) {
  const worker = edgeWorker;
  edgeWorker = null;
  worker?.terminate();
  edgeRequests.forEach((request) => {
    window.clearTimeout(request.timer);
    request.reject(new Error(message));
  });
  edgeRequests.clear();
}

function getEdgeWorker() {
  if (edgeWorker) return edgeWorker;

  edgeWorker = new Worker("/scan-worker.js");
  edgeWorker.onmessage = (event: MessageEvent<EdgeWorkerReply>) => {
    const request = edgeRequests.get(event.data.id);
    if (!request) return;
    window.clearTimeout(request.timer);
    edgeRequests.delete(event.data.id);
    if (event.data.error || !event.data.corners) {
      request.reject(new Error(event.data.error || "Edge detection failed"));
    } else {
      request.resolve(event.data.corners);
    }
  };
  edgeWorker.onerror = () => stopEdgeWorker("Background edge detection worker stopped");
  edgeWorker.onmessageerror = () => stopEdgeWorker("Background edge detection worker returned an unreadable result");
  return edgeWorker;
}

export function detectDocumentCorners(blob: Blob): Promise<Point[]> {
  const id = createLocalId();
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      if (edgeRequests.has(id)) stopEdgeWorker("Background edge detection timed out");
    }, 12000);
    edgeRequests.set(id, { resolve, reject, timer });
    getEdgeWorker().postMessage({ id, blob });
  });
}
