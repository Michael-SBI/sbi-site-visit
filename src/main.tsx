import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";

createRoot(document.getElementById("root")!).render(<App />);

// Updates: the offline worker downloads a new version in the background and takes over at once.
// When it does, save the drawing to the device and reload, so one open is enough to be up to date.
// It waits while the pen or a finger is down, or while the app is saving, so nothing is cut off.
if ("serviceWorker" in navigator) {
  const hadController = !!navigator.serviceWorker.controller; // first install: nothing to reload
  let pointersDown = 0;
  window.addEventListener("pointerdown", () => pointersDown++, true);
  const up = () => (pointersDown = Math.max(0, pointersDown - 1));
  window.addEventListener("pointerup", up, true);
  window.addEventListener("pointercancel", up, true);

  let reloading = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (!hadController || reloading) return;
    reloading = true;
    const tryReload = async () => {
      const w = window as any;
      if (pointersDown > 0 || w.__svrBusy?.()) return setTimeout(tryReload, 1000);
      try {
        await w.__svrFlush?.();
      } catch {
        /* the autosave from a second ago still has it */
      }
      location.reload();
    };
    tryReload();
  });

  // Look for a new version each time the app comes back on screen, and every half hour.
  const check = () =>
    navigator.serviceWorker
      .getRegistration()
      .then((r) => r?.update())
      .catch(() => {});
  document.addEventListener("visibilitychange", () => document.visibilityState === "visible" && check());
  setInterval(check, 30 * 60 * 1000);
}
