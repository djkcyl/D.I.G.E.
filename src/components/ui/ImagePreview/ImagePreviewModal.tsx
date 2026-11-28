import { useCallback, useEffect, useState } from "react";
import { useI18n } from "../../../i18n";
import ImagePreviewContentModal from "./ImagePreviewContentModal";
import ImagePreviewZoomModal from "./ImagePreviewZoomModal";
import useImagePreviewZoom from "./useImagePreviewZoom";

export interface ImagePreviewModalProps {
  show: boolean;
  onClose?: () => void;
  blob?: Blob | null;
  fileName?: string;
  title?: string;
}

export default function ImagePreviewModal({
  show,
  onClose,
  blob,
  fileName,
  title,
}: ImagePreviewModalProps) {
  const { t } = useI18n();
  const [previewUrl, setPreviewUrl] = useState("");
  const [message, setMessage] = useState("");

  const {
    zoomOpen,
    openZoom,
    closeZoom,
    zoomScale,
    zoomOffset,
    zoomDragging,
    canPan,
    viewportRef,
    resetZoomTransform,
    handleZoomImageLoad,
    handleZoomWheel,
    handleMouseDown,
    handleMouseMove,
    finishDragging,
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd,
    handleDoubleClick,
    zoomIn,
    zoomOut,
  } = useImagePreviewZoom({ previewUrl });

  useEffect(() => {
    if (!blob) {
      setPreviewUrl("");
      return undefined;
    }
    const nextUrl = URL.createObjectURL(blob);
    setPreviewUrl(nextUrl);
    return () => URL.revokeObjectURL(nextUrl);
  }, [blob]);

  useEffect(() => {
    if (show) return;
    closeZoom();
    setMessage("");
  }, [closeZoom, show]);

  const titleText = title || t("completeImagePreviewTitle");
  const canShare =
    typeof navigator !== "undefined" &&
    "share" in navigator &&
    typeof navigator.share === "function" &&
    Boolean(blob);

  const closePreview = useCallback(() => {
    setMessage("");
    closeZoom();
    onClose?.();
  }, [closeZoom, onClose]);

  const handleDownload = useCallback(() => {
    if (!blob || !fileName) return;
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = fileName;
    anchor.rel = "noopener";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }, [blob, fileName]);

  const handleCopy = useCallback(async () => {
    if (!blob) return;
    try {
      if (
        typeof navigator === "undefined" ||
        !navigator.clipboard?.write ||
        typeof ClipboardItem === "undefined"
      ) {
        setMessage(t("copyImageFailed"));
        return;
      }
      await navigator.clipboard.write([
        new ClipboardItem({
          "image/png": blob,
        }),
      ]);
      setMessage(t("copyImageSuccess"));
    } catch (error) {
      console.error("Copy image failed:", error);
      setMessage(t("copyImageFailed"));
    }
  }, [blob, t]);

  const handleShare = useCallback(async () => {
    if (typeof navigator === "undefined" || !blob || !navigator.share) return;
    try {
      const file = new File([blob], fileName || "dige_export.png", {
        type: "image/png",
      });
      if (
        typeof navigator.canShare === "function" &&
        !navigator.canShare({ files: [file] })
      ) {
        setMessage(t("shareUnavailable"));
        return;
      }
      await navigator.share({
        files: [file],
        title: titleText,
      });
    } catch (error) {
      if ((error as Error)?.name === "AbortError") return;
      console.error("Share image failed:", error);
      setMessage(t("shareUnavailable"));
    }
  }, [blob, fileName, t, titleText]);

  return (
    <>
      <ImagePreviewContentModal
        show={show && !zoomOpen}
        onClose={closePreview}
        previewUrl={previewUrl}
        titleText={titleText}
        t={t}
        onOpenZoom={openZoom}
        onDownload={handleDownload}
        onCopy={() => void handleCopy()}
        onShare={() => void handleShare()}
        canShare={canShare}
        message={message}
      />

      <ImagePreviewZoomModal
        show={show && zoomOpen}
        onClose={closeZoom}
        previewUrl={previewUrl}
        titleText={titleText}
        t={t}
        zoomScale={zoomScale}
        zoomOffset={zoomOffset}
        zoomDragging={zoomDragging}
        canPan={canPan}
        viewportRef={viewportRef}
        onZoomOut={zoomOut}
        onResetZoom={resetZoomTransform}
        onZoomIn={zoomIn}
        onWheel={handleZoomWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={finishDragging}
        onMouseLeave={finishDragging}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
        onDoubleClick={handleDoubleClick}
        onImageLoad={handleZoomImageLoad}
      />
    </>
  );
}
