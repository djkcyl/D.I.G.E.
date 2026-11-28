import { useEffect, useState } from "react";
import { useI18n } from "../../i18n";
import { applyUpdate, onNeedRefresh } from "../../pwa";

export default function UpdateToast() {
  const { t } = useI18n();
  const [show, setShow] = useState(false);

  useEffect(() => {
    onNeedRefresh(() => setShow(true));
  }, []);

  if (!show) return null;

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[9999] flex items-center gap-3 bg-endfield-black/95 border border-endfield-yellow/40 rounded-lg px-4 py-3 shadow-lg backdrop-blur-sm">
      <span className="text-endfield-text-light text-sm">
        {t("updateAvailable")}
      </span>
      <button
        type="button"
        onClick={() => applyUpdate?.()}
        className="px-3 py-1 text-sm bg-endfield-yellow-bg/90 text-endfield-ink font-medium rounded hover:bg-endfield-yellow-bg transition-colors cursor-pointer"
      >
        {t("updateNow")}
      </button>
      <button
        type="button"
        onClick={() => setShow(false)}
        className="text-endfield-text-muted hover:text-endfield-text-light text-lg leading-none cursor-pointer"
        aria-label={t("close")}
      >
        &times;
      </button>
    </div>
  );
}
