import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useI18n } from "../../../i18n";
import CloseButton from "../../ui/CloseButton";

export interface DecisionMatrixModalProps {
  show: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  children?: React.ReactNode;
}

/** Centered industrial modal for the 3×3 decision board (mobile). */
export default function DecisionMatrixModal({
  show,
  onClose,
  title,
  children,
}: DecisionMatrixModalProps) {
  const { t } = useI18n();
  const panelRef = useRef<HTMLDivElement>(null);
  const lastFocusedRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!show || typeof document === "undefined") return;
    lastFocusedRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    panelRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = prevOverflow;
      const lastFocused = lastFocusedRef.current;
      if (lastFocused && document.contains(lastFocused)) {
        lastFocused.focus();
      }
    };
  }, [show, onClose]);

  if (!show) return null;

  const node = (
    <div
      className="fixed inset-0 z-[60] bg-[var(--ef-scrim)] backdrop-blur-[2px] flex items-center justify-center p-3"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        className="w-full max-w-[22rem] bg-endfield-gray/90 backdrop-blur-md border border-endfield-yellow/45 p-3 shadow-[0_12px_40px_rgba(0,0,0,0.45)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="text-sm font-bold text-endfield-text uppercase tracking-widest">
            {title}
          </div>
          <CloseButton
            onClick={onClose}
            label={t("close")}
            sizeClass="w-7 h-7"
          />
        </div>
        {children}
      </div>
    </div>
  );

  if (typeof document === "undefined") return node;
  return createPortal(node, document.body);
}
