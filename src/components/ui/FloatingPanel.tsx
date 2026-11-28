import { useEffect } from "react";
import useDraggablePanel from "./useDraggablePanel";

/**
 * 可拖动悬浮面板：用于把决策盘从"点开即关的小浮层"升级成常驻小窗，
 * 让用户在页面滚动查看燃料消耗/流程图时仍能随时切换策略。
 *
 * 关键行为：
 * - 无全屏遮罩（不阻断页面滚动与点击）；
 * - 标题栏拖动，位置记在 localStorage；
 * - Esc 关闭；拖出视口会自动夹回可视区。
 */

export interface FloatingPanelProps {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  /** 位置记忆 key；不传则不持久化 */
  storageKey?: string;
  width?: number;
  closeLabel?: string;
  /** 每次自增都会把面板重新居中（双击触发） */
  recenterSignal?: number;
}

export default function FloatingPanel({
  title,
  onClose,
  children,
  storageKey,
  width = 380,
  closeLabel = "close",
  recenterSignal = 0,
}: FloatingPanelProps) {
  const { position, recenter, dragHandlers } = useDraggablePanel({
    width,
    storageKey,
    recenterSignal,
  });

  // Esc 关闭
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-label={title}
      className="fixed z-50 flex flex-col bg-endfield-gray border border-endfield-yellow/40 shadow-[0_12px_40px_rgba(0,0,0,0.45)]"
      style={{ left: position.x, top: position.y, width, maxHeight: "70vh" }}
    >
      {/* biome-ignore lint/a11y/noStaticElementInteractions: 标题栏拖动与双击居中是鼠标交互，键盘用户走 Esc / 关闭按钮 */}
      <div
        className="flex items-center justify-between gap-2 px-2 py-1.5 border-b border-endfield-gray-light cursor-move select-none touch-none bg-endfield-dark/60"
        onDoubleClick={recenter}
        {...dragHandlers}
      >
        <span className="text-xs font-bold text-endfield-text uppercase tracking-widest truncate">
          {title}
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label={closeLabel}
          className="shrink-0 w-6 h-6 inline-flex items-center justify-center text-endfield-text/60 hover:text-endfield-text"
        >
          ✕
        </button>
      </div>
      <div className="overflow-auto p-2">{children}</div>
    </div>
  );
}
