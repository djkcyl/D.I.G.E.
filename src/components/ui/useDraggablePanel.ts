import type { PointerEvent as ReactPointerEvent } from "react";
import { useCallback, useEffect, useRef, useState } from "react";

/** 悬浮面板共用拖动与位置记忆；不含外观，供桌面窗和移动端决策盘复用。 */
export interface PanelPoint {
  x: number;
  y: number;
}

export interface PanelViewport {
  width: number;
  height: number;
}

const HEADER_HEIGHT = 34;
const MARGIN = 8;

/** 标题栏至少留在视口内；这是纯函数，便于在 Node 回归中验证边界。 */
export function clampPanelPosition(
  pos: PanelPoint,
  width: number,
  viewport: PanelViewport,
): PanelPoint {
  const maxX = Math.max(MARGIN, viewport.width - width - MARGIN);
  const maxY = Math.max(MARGIN, viewport.height - HEADER_HEIGHT - MARGIN);
  return {
    x: Math.min(Math.max(MARGIN, pos.x), maxX),
    y: Math.min(Math.max(MARGIN, pos.y), maxY),
  };
}

function readStoredPosition(storageKey: string | undefined): PanelPoint | null {
  if (!storageKey || typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PanelPoint>;
    if (typeof parsed.x !== "number" || typeof parsed.y !== "number")
      return null;
    return { x: parsed.x, y: parsed.y };
  } catch {
    return null;
  }
}

export interface UseDraggablePanelOptions {
  width: number;
  /** 传入才记忆位置；移动端不传，重开时由外观层负责居中。 */
  storageKey?: string;
  /** 每次自增都会拉回居中位置（例如 HUD 的绿色按钮）。 */
  recenterSignal?: number;
  /** 桌面保持原来的靠右初始位置；移动端使用居中。 */
  initialPlacement?: "top-right" | "center";
}

export default function useDraggablePanel({
  width,
  storageKey,
  recenterSignal = 0,
  initialPlacement = "top-right",
}: UseDraggablePanelOptions) {
  const [pos, setPos] = useState<PanelPoint>(() => {
    const stored = readStoredPosition(storageKey);
    if (stored) return stored;
    if (typeof window === "undefined") return { x: 40, y: 96 };
    if (initialPlacement === "center") {
      return {
        x: Math.max(MARGIN, (window.innerWidth - width) / 2),
        y: Math.max(MARGIN, window.innerHeight * 0.18),
      };
    }
    return {
      x: Math.max(MARGIN, window.innerWidth - width - 24),
      y: 96,
    };
  });
  const posRef = useRef(pos);
  const dragRef = useRef<{
    startX: number;
    startY: number;
    origin: PanelPoint;
  } | null>(null);

  const updatePosition = useCallback((next: PanelPoint) => {
    posRef.current = next;
    setPos(next);
  }, []);

  const confine = useCallback(
    (next: PanelPoint) => {
      if (typeof window === "undefined") return next;
      return clampPanelPosition(next, width, {
        width: window.innerWidth,
        height: window.innerHeight,
      });
    },
    [width],
  );

  // 旋转屏幕或调整窗口时，保证标题栏还能被拖回。
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onResize = () => updatePosition(confine(posRef.current));
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [confine, updatePosition]);

  const recenter = useCallback(() => {
    if (typeof window === "undefined") return;
    updatePosition(
      confine({
        x: (window.innerWidth - width) / 2,
        y: Math.max(MARGIN, window.innerHeight * 0.18),
      }),
    );
  }, [confine, updatePosition, width]);

  useEffect(() => {
    if (!recenterSignal) return;
    recenter();
  }, [recenterSignal, recenter]);

  const persist = useCallback(() => {
    if (!storageKey) return;
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(posRef.current));
    } catch {
      /* 隐私模式忽略 */
    }
  }, [storageKey]);

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    if (event.target instanceof Element && event.target.closest("button")) {
      return;
    }
    dragRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      origin: posRef.current,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    updatePosition(
      confine({
        x: drag.origin.x + (event.clientX - drag.startX),
        y: drag.origin.y + (event.clientY - drag.startY),
      }),
    );
  };

  const handlePointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    persist();
  };

  return {
    position: pos,
    recenter,
    dragHandlers: {
      onPointerDown: handlePointerDown,
      onPointerMove: handlePointerMove,
      onPointerUp: handlePointerUp,
      onPointerCancel: handlePointerUp,
    },
  };
}
