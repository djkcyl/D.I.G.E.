import { useCallback, useEffect, useRef } from "react";
import { useI18n } from "../../i18n";
import Button from "../ui/Button";
import Icon from "../ui/Icon";
import Modal from "../ui/Modal";
import ModalHeader from "../ui/ModalHeader";

export interface ShareModalProps {
  show: boolean;
  shareUrl: string;
  /** 方案 B 全粘连电网蓝图码 */
  gridCode?: string;
  onClose: () => void;
  onCopyUrl: () => void;
  onCopyGridCode?: () => void;
  onShare: () => void;
  closeOnBackdrop?: boolean;
}

const FIELD_CLASS =
  "w-full bg-endfield-black/80 border border-endfield-yellow/40 px-3 py-2 text-[11px] sm:text-sm text-endfield-yellow/90 font-mono leading-snug break-all focus:border-endfield-yellow focus:outline-none shadow-[0_0_0_1px_rgba(255,250,0,0.08),0_12px_30px_rgba(0,0,0,0.45)] text-center";

export default function ShareModal({
  show,
  shareUrl,
  gridCode = "",
  onClose,
  onCopyUrl,
  onCopyGridCode,
  onShare,
  closeOnBackdrop = false,
}: ShareModalProps) {
  const { t } = useI18n();
  const gridCodeRef = useRef<HTMLInputElement | null>(null);
  const canShare = typeof navigator !== "undefined" && !!navigator.share;

  const selectLinkText = useCallback((el: HTMLInputElement | null) => {
    if (!el || typeof window === "undefined") return;
    el.select();
  }, []);

  useEffect(() => {
    if (!show) return;
    const handle = window.requestAnimationFrame(() => {
      if (!gridCodeRef.current) return;
      gridCodeRef.current.focus();
      selectLinkText(gridCodeRef.current);
    });
    return () => window.cancelAnimationFrame(handle);
  }, [show, selectLinkText, gridCode]);

  if (!show) return null;

  return (
    <Modal
      show={show}
      onClose={onClose}
      closeOnBackdrop={closeOnBackdrop}
      ariaLabelledby="share-modal-title"
      contentClassName="!p-4 sm:!p-5 max-w-xl gap-3"
    >
      <ModalHeader
        id="share-modal-title"
        icon="share"
        title={t("shareLinkTitle")}
      />

      {/* 卡片 1：电网蓝图码（主推） */}
      <div className="space-y-2 border border-endfield-yellow/30 bg-endfield-yellow/5 p-3">
        <div className="flex items-center gap-2 text-sm text-endfield-yellow font-bold tracking-wide">
          <Icon name="qr_code_2" className="!w-5 !h-5" />
          <span>{t("gridCodeLabel")}</span>
        </div>
        <input
          ref={gridCodeRef}
          type="text"
          readOnly
          aria-label={t("gridCodeLabel")}
          value={gridCode || ""}
          onClick={(e) => selectLinkText(e.currentTarget)}
          onFocus={(e) => selectLinkText(e.currentTarget)}
          className={FIELD_CLASS}
        />
        <Button
          onClick={onCopyGridCode}
          variant="primary"
          fullWidth
          disabled={!gridCode || !onCopyGridCode}
        >
          <Icon name="content_copy" />
          {t("copyGridCode")}
        </Button>
      </div>

      {/* 卡片 2：完整网页链接 */}
      <div className="space-y-2 border border-endfield-gray-light bg-endfield-gray/30 p-3">
        <div className="flex items-center gap-2 text-sm text-endfield-text font-bold tracking-wide">
          <Icon name="link" className="!w-5 !h-5" />
          <span>{t("shareLinkLabel")}</span>
        </div>
        <input
          type="text"
          readOnly
          aria-label={t("shareLinkLabel")}
          value={shareUrl || ""}
          onClick={(e) => selectLinkText(e.currentTarget)}
          onFocus={(e) => selectLinkText(e.currentTarget)}
          className={FIELD_CLASS}
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <Button onClick={onCopyUrl} variant="primary">
            <Icon name="content_copy" />
            {t("copyLink")}
          </Button>
          <Button
            onClick={onShare}
            disabled={!canShare}
            variant="none"
            className={`border border-endfield-gray-light ${
              canShare
                ? "bg-endfield-gray hover:border-endfield-yellow text-endfield-text-light hover:text-endfield-yellow"
                : "bg-endfield-gray/40 text-endfield-text/40 cursor-not-allowed"
            }`}
          >
            <Icon name="ios_share" />
            {t("shareSystem")}
          </Button>
        </div>
        {!canShare && (
          <p className="text-xs text-endfield-text/60">{t("shareUnavailable")}</p>
        )}
      </div>

      <Button onClick={onClose} variant="secondary" fullWidth>
        {t("close")}
      </Button>
    </Modal>
  );
}
