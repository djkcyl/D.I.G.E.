import { registerSW } from "virtual:pwa-register";

const UPDATE_CHECK_INTERVAL = 60 * 60 * 1000; // check every 1 hour

let updateCallback: (() => void) | null = null;

export function onNeedRefresh(cb: () => void) {
  updateCallback = cb;
}

export let applyUpdate: (() => void) | null = null;

export function initPWA() {
  const updateSW = registerSW({
    immediate: true,
    onNeedRefresh() {
      applyUpdate = () => updateSW(true);
      updateCallback?.();
    },
    onOfflineReady() {
      // silently ready
    },
  });

  setInterval(() => {
    updateSW(false);
  }, UPDATE_CHECK_INTERVAL);
}
