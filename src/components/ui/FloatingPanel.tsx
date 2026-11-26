import { useCallback, useEffect, useRef, useState } from "react";

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

interface Point {
  x: number;
  y: number;
}

const HEADER_HEIGHT = 34;
const MARGIN = 8;

function clampPosition(pos: Point, width: number): Point {
  if (typeof window === "undefined") return pos;
  const maxX = Math.max(MARGIN, window.innerWidth - width - MARGIN);
  const maxY = Math.max(MARGIN, window.innerHeight - HEADER_HEIGHT - MARGIN);
  return {
    x: Math.min(Math.max(MARGIN, pos.x), maxX),
    y: Math.min(Math.max(MARGIN, pos.y), maxY),
  };
}

function readStoredPosition(storageKey: string | undefined): Point | null {
  if (!storageKey || typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Point>;
    if (typeof parsed.x !== "number" || typeof parsed.y !== "number")
      return null;
    return { x: parsed.x, y: parsed.y };
  } catch {
    return null;
  }
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
  const [pos, setPos] = useState<Point>(() => {
    const stored = readStoredPosition(storageKey);
    if (stored) return stored;
    if (typeof window === "undefined") return { x: 40, y: 96 };
    return {
      x: Math.max(MARGIN, window.innerWidth - width - 24),
      y: 96,
    };
  });
  const dragRef = useRef<{
    startX: number;
    startY: number;
    origin: Point;
  } | null>(null);

  // 视口变化时夹回可视区
  useEffect(() => {
    const onResize = () => setPos((prev) => clampPosition(prev, width));
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [width]);

  const recenter = useCallback(() => {
    if (typeof window === "undefined") return;
    setPos(
      clampPosition(
        {
          x: (window.innerWidth - width) / 2,
          y: Math.max(MARGIN, window.innerHeight * 0.18),
        },
        width,
      ),
    );
  }, [width]);

  // 外部信号（顶部触发按钮双击）→ 重新居中
  useEffect(() => {
    if (!recenterSignal) return;
    recenter();
  }, [recenterSignal, recenter]);

  // Esc 关闭
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const persist = useCallback(
    (next: Point) => {
      if (!storageKey) return;
      try {
        window.localStorage.setItem(storageKey, JSON.stringify(next));
      } catch {
        /* 隐私模式忽略 */
      }
    },
    [storageKey],
  );

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    dragRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      origin: pos,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    const next = clampPosition(
      {
        x: drag.origin.x + (event.clientX - drag.startX),
        y: drag.origin.y + (event.clientY - drag.startY),
      },
      width,
    );
    setPos(next);
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    dragRef.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
    persist(pos);
  };

  return (
    <div
      role="dialog"
      aria-label={title}
      className="fixed z-50 flex flex-col bg-endfield-gray border border-endfield-yellow/40 shadow-[0_12px_40px_rgba(0,0,0,0.45)]"
      style={{ left: pos.x, top: pos.y, width, maxHeight: "70vh" }}
    >
      {/* biome-ignore lint/a11y/noStaticElementInteractions: 标题栏拖动与双击居中是鼠标交互，键盘用户走 Esc / 关闭按钮 */}
      <div
        className="flex items-center justify-between gap-2 px-2 py-1.5 border-b border-endfield-gray-light cursor-move select-none touch-none bg-endfield-dark/60"
        onDoubleClick={recenter}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        <span className="text-xs font-bold text-endfield-text uppercase tracking-widest truncate">
          {title}
        </span>
        <button
          type="button"
          onClick={onClose}
          // 拖动区在父级，关掉指针捕获，避免双击后点击被标题栏吞掉
          onPointerDown={(e) => e.stopPropagation()}
          onPointerUp={(e) => e.stopPropagation()}
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
