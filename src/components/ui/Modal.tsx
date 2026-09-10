import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

export interface ModalProps {
  show: boolean;
  onClose: () => void;
  closeOnBackdrop?: boolean;
  fullscreen?: boolean;
  title?: React.ReactNode;
  ariaLabelledby?: string;
  children?: React.ReactNode;
  contentClassName?: string;
}

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  'input:not([disabled]):not([type="hidden"])',
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(", ");

function getFocusableElements(container: HTMLElement): HTMLElement[] {
  const candidates = Array.from(
    container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
  );
  return candidates.filter(
    (el) =>
      !el.hasAttribute("disabled") &&
      !el.getAttribute("aria-hidden") &&
      (el.offsetWidth > 0 ||
        el.offsetHeight > 0 ||
        el.getClientRects().length > 0)
  );
}

/**
 * Reusable modal shell.
 * `closeOnBackdrop` controls whether clicking outside content closes the modal.
 */
export default function Modal({
  show,
  onClose,
  closeOnBackdrop = true,
  fullscreen = false,
  title,
  ariaLabelledby,
  children,
  contentClassName = "",
}: ModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const lastFocusedRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!show || typeof document === "undefined") return;

    lastFocusedRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;

    const dialog = dialogRef.current;
    if (!dialog) return;

    const focusable = getFocusableElements(dialog);
    (focusable[0] || dialog).focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (!dialog.contains(event.target as Node)) return;

      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key !== "Tab") return;

      const currentFocusable = getFocusableElements(dialog);
      if (currentFocusable.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }

      const first = currentFocusable[0];
      const last = currentFocusable[currentFocusable.length - 1];
      const active = document.activeElement as HTMLElement | null;

      if (event.shiftKey) {
        if (!active || active === first || !dialog.contains(active)) {
          event.preventDefault();
          last.focus();
        }
        return;
      }

      if (!active || active === last || !dialog.contains(active)) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      const lastFocused = lastFocusedRef.current;
      if (lastFocused && document.contains(lastFocused)) {
        lastFocused.focus();
      }
    };
  }, [show, onClose]);

  if (!show) return null;

  const overlayClass = fullscreen
    ? "fixed inset-0 z-[60] bg-[var(--ef-scrim)] backdrop-blur overflow-hidden"
    : "fixed inset-0 z-50 bg-[var(--ef-scrim)] backdrop-blur overflow-y-auto";

  const handleOverlayClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!closeOnBackdrop) return;
    const content = contentRef.current;
    if (!content || !content.contains(event.target as Node)) {
      onClose();
    }
  };

  const node = (
    <div
      ref={dialogRef}
      tabIndex={-1}
      className={overlayClass}
      role="dialog"
      aria-modal="true"
      aria-labelledby={ariaLabelledby}
      onClick={handleOverlayClick}
      onKeyDown={
        closeOnBackdrop
          ? (e) => {
              if (e.target !== e.currentTarget) return;
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClose();
              }
            }
          : undefined
      }
    >
      <div
        className={
          fullscreen
            ? "h-full w-full flex items-stretch justify-stretch p-0"
            : "min-h-full w-full flex items-center justify-center p-4"
        }
      >
        <div
          ref={contentRef}
          className={`${
            fullscreen
              ? "w-full h-full relative flex flex-col"
              : "bg-endfield-gray border border-endfield-yellow/30 p-6 max-w-xl w-full relative flex flex-col"
          } ${contentClassName}`.trim()}
        >
          {title && (
            <div className="flex items-center gap-2 mb-4 pb-3 border-b border-endfield-gray-light">
              {title}
            </div>
          )}
          {children}
        </div>
      </div>
    </div>
  );

  if (typeof document === "undefined") {
    return node;
  }
  return createPortal(node, document.body);
}
