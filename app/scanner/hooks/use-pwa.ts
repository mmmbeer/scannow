import { MutableRefObject, useEffect, useState } from "react";
import type { InstallPrompt, Notify } from "../types";

export function usePwa(streamRef: MutableRefObject<MediaStream | null>, notify: Notify) {
  const [installPrompt, setInstallPrompt] = useState<InstallPrompt | null>(null);
  const [installHelpOpen, setInstallHelpOpen] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    const beforeInstall = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPrompt);
    };
    const online = () => setIsOnline(true);
    const offline = () => setIsOnline(false);
    window.addEventListener("beforeinstallprompt", beforeInstall);
    window.addEventListener("online", online);
    window.addEventListener("offline", offline);
    if ("serviceWorker" in navigator) {
      void navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" }).then((registration) => {
        void registration.update();
        return navigator.serviceWorker.ready;
      }).then((registration) => {
        const urls = performance.getEntriesByType("resource").map((entry) => entry.name).filter((url) => url.startsWith(window.location.origin));
        registration.active?.postMessage({ type: "CACHE_URLS", urls });
      }).catch(() => undefined);
    }
    const timer = window.setTimeout(() => {
      setIsStandalone(window.matchMedia("(display-mode: standalone)").matches || ("standalone" in navigator && Boolean((navigator as Navigator & { standalone?: boolean }).standalone)));
      setIsOnline(navigator.onLine);
    }, 0);
    return () => {
      window.clearTimeout(timer);
      streamRef.current?.getTracks().forEach((track) => track.stop());
      window.removeEventListener("beforeinstallprompt", beforeInstall);
      window.removeEventListener("online", online);
      window.removeEventListener("offline", offline);
    };
  }, [streamRef]);

  const installApp = async () => {
    if (!installPrompt) {
      setInstallHelpOpen(true);
      return;
    }
    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    if (choice.outcome === "accepted") {
      setIsStandalone(true);
      notify("The scanner was added to this device.");
    }
    setInstallPrompt(null);
  };

  return { installHelpOpen, setInstallHelpOpen, isStandalone, isOnline, installApp };
}
