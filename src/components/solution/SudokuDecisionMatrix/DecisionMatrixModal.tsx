import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useI18n } from "../../../i18n";
import CloseButton from "../../ui/CloseButton";
import useDraggablePanel from "../../ui/useDraggablePanel";

export interface DecisionMatrixModalProps {
  show: boolean;
  onClose: () => void;
  title?: string;
  children?: React.ReactNode;
  /** 每次自增拉回居中位置；用于 HUD 的绿色按钮。 */
  recenterSignal?: number;
}

const MAX_PANEL_WIDTH = 352;
const VIEWPORT_MARGIN = 12;

function panelWidthForViewport() {
  if (typeof window === "undefined") return MAX_PANEL_WIDTH;
  return Math.max(
    1,
    Math.min(MAX_PANEL_WIDTH, window.innerWidth - VIEWPORT_MARGIN * 2),
  );
}

/** 非模态决策盘：可拖动、窗外可滚动；无全屏遮罩，实体面板保持内容清晰。 */
export default function DecisionMatrixModal({
  show,
  onClose,
  title,
  children,
  recenterSignal = 0,
}: DecisionMatrixModalProps) {
  const { t } = useI18n();
  const panelRef = useRef<HTMLDivElement>(null);
  const lastFocusedRef = useRef<HTMLElement | null>(null);
  const [panelWidth, setPanelWidth] = useState(panelWidthForViewport);
  const { position, recenter, dragHandlers } = useDraggablePanel({
    width: panelWidth,
    initialPlacement: "center",
    recenterSignal,
  });

  useEffect(() => {
    const onResize = () => setPanelWidth(panelWidthForViewport());
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // 不持久化移动端位置，每次展开都重新拉回居中。
  useEffect(() => {
    if (show) recenter();
  }, [show, recenter]);

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
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      const lastFocused = lastFocusedRef.current;
      if (lastFocused && document.contains(lastFocused)) {
        lastFocused.focus();
      }
    };
  }, [show, onClose]);

  if (!show) return null;

  const node = (
    <>
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-label={title}
        className="fixed z-[61] flex flex-col bg-endfield-gray border border-endfield-yellow/45 p-3 shadow-[0_12px_40px_rgba(0,0,0,0.45)]"
        style={{
          left: position.x,
          top: position.y,
          width: panelWidth,
          maxHeight: "85vh",
        }}
      >
        <div
          className="mb-2 flex shrink-0 items-center justify-between gap-2 cursor-move select-none touch-none"
          {...dragHandlers}
        >
          <div className="min-w-0 truncate text-sm font-bold text-endfield-text uppercase tracking-widest">
            {title}
          </div>
          <CloseButton
            onClick={onClose}
            label={t("close")}
            sizeClass="w-7 h-7"
          />
        </div>
        <div className="min-h-0 overflow-y-auto">{children}</div>
      </div>
    </>
  );

  if (typeof document === "undefined") return node;
  return createPortal(node, document.body);
}
