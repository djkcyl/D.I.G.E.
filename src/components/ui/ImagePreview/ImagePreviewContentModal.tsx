import Button from "../Button";
import Icon from "../Icon";
import Modal from "../Modal";
import ModalHeader from "../ModalHeader";

export interface ImagePreviewContentModalProps {
  show: boolean;
  onClose: () => void;
  previewUrl: string;
  titleText: string;
  t: (key: string) => string;
  onOpenZoom: () => void;
  onDownload: () => void;
  onCopy: () => void;
  onShare: () => void;
  canShare: boolean;
  message: string;
}

export default function ImagePreviewContentModal({
  show,
  onClose,
  previewUrl,
  titleText,
  t,
  onOpenZoom,
  onDownload,
  onCopy,
  onShare,
  canShare,
  message,
}: ImagePreviewContentModalProps) {
  return (
    <Modal
      show={show}
      onClose={onClose}
      ariaLabelledby="complete-image-preview-title"
      contentClassName="!p-4 sm:!p-5 max-w-5xl w-full max-h-[calc(100dvh-2rem)] gap-2.5 overflow-hidden"
    >
      <ModalHeader
        id="complete-image-preview-title"
        icon="image"
        title={titleText}
      />

      <div className="w-full bg-endfield-black/80 border border-endfield-gray-light/60 p-2 min-h-[180px] max-h-[min(70dvh,720px)] overflow-auto flex items-start justify-center">
        {previewUrl ? (
          <button
            type="button"
            onClick={onOpenZoom}
            className="max-w-full mx-auto cursor-zoom-in bg-transparent border-none p-0 block"
          >
            <img
              src={previewUrl}
              alt={titleText}
              className="max-w-full h-auto select-none"
              draggable={false}
            />
          </button>
        ) : (
          <div className="text-sm text-endfield-text/70">
            {t("noSolutionData")}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <Button type="button" onClick={onDownload} variant="primary">
          <Icon name="download" className="w-4 h-4" />
          {t("downloadImage")}
        </Button>
        <Button type="button" onClick={onCopy} variant="secondary">
          <Icon name="content_copy" className="w-4 h-4" />
          {t("copyImage")}
        </Button>
        <Button
          type="button"
          onClick={onShare}
          disabled={!canShare}
          variant="none"
          className={`border border-endfield-gray-light ${
            canShare
              ? "bg-endfield-gray hover:border-endfield-yellow text-endfield-text-light hover:text-endfield-yellow"
              : "bg-endfield-gray/40 text-endfield-text/40 cursor-not-allowed"
          }`}
        >
          <Icon name="ios_share" className="w-4 h-4" />
          {t("shareImage")}
        </Button>
      </div>

      {message && <p className="text-xs text-endfield-text/70">{message}</p>}
      {!canShare && (
        <p className="text-xs text-endfield-text/60">{t("shareUnavailable")}</p>
      )}

      <Button type="button" onClick={onClose} variant="secondary" fullWidth>
        {t("close")}
      </Button>
    </Modal>
  );
}
