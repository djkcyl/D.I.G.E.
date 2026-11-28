import { useCallback, useEffect, useRef, useState } from "react";

const IMAGE_PREVIEW_SCALE_MIN = 1;
const IMAGE_PREVIEW_SCALE_MAX = 6;

function clampValue(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function getTouchDistance(
  touches: { length: number; 0?: Touch; 1?: Touch } | null | undefined,
): number {
  if (!touches || touches.length < 2) return 0;
  const t0 = touches[0];
  const t1 = touches[1];
  if (!t0 || !t1) return 0;
  return Math.hypot(t1.clientX - t0.clientX, t1.clientY - t0.clientY);
}

function getTouchCenter(
  touches: { length: number; 0?: Touch; 1?: Touch } | null | undefined,
): {
  x: number;
  y: number;
} {
  if (!touches || touches.length < 2) {
    return { x: 0, y: 0 };
  }
  const t0 = touches[0];
  const t1 = touches[1];
  if (!t0 || !t1) return { x: 0, y: 0 };
  return {
    x: (t0.clientX + t1.clientX) / 2,
    y: (t0.clientY + t1.clientY) / 2,
  };
}

type TouchMode = "none" | "pan" | "pinch";

function createInitialTouchState(): {
  mode: TouchMode;
  startDistance: number;
  startScale: number;
  startOffset: { x: number; y: number };
  startCenter: { x: number; y: number };
  panStart: { x: number; y: number };
  panOrigin: { x: number; y: number };
} {
  return {
    mode: "none",
    startDistance: 0,
    startScale: 1,
    startOffset: { x: 0, y: 0 },
    startCenter: { x: 0, y: 0 },
    panStart: { x: 0, y: 0 },
    panOrigin: { x: 0, y: 0 },
  };
}

export default function useImagePreviewZoom({
  previewUrl,
}: {
  previewUrl: string | null | undefined;
}) {
  const [zoomOpen, setZoomOpen] = useState(false);
  const [zoomScale, setZoomScale] = useState(1);
  const [zoomOffset, setZoomOffset] = useState({ x: 0, y: 0 });
  const [zoomDragging, setZoomDragging] = useState(false);

  const viewportRef = useRef<HTMLFieldSetElement | null>(null);
  const naturalRef = useRef({ width: 0, height: 0 });
  const dragRef = useRef({
    active: false,
    startX: 0,
    startY: 0,
    originX: 0,
    originY: 0,
  });
  const touchRef = useRef(createInitialTouchState());

  const clampZoomScale = useCallback(
    (scale: number) =>
      clampValue(scale, IMAGE_PREVIEW_SCALE_MIN, IMAGE_PREVIEW_SCALE_MAX),
    [],
  );

  const getZoomMetrics = useCallback(() => {
    const viewport = viewportRef.current;
    const natural = naturalRef.current;
    if (!viewport || !natural.width || !natural.height) {
      return {
        viewportWidth: 0,
        viewportHeight: 0,
        baseWidth: 0,
        baseHeight: 0,
      };
    }

    const viewportWidth = viewport.clientWidth;
    const viewportHeight = viewport.clientHeight;
    if (!viewportWidth || !viewportHeight) {
      return {
        viewportWidth: 0,
        viewportHeight: 0,
        baseWidth: 0,
        baseHeight: 0,
      };
    }

    const fitRatio = Math.min(
      viewportWidth / natural.width,
      viewportHeight / natural.height,
    );
    return {
      viewportWidth,
      viewportHeight,
      baseWidth: natural.width * fitRatio,
      baseHeight: natural.height * fitRatio,
    };
  }, []);

  const clampZoomOffset = useCallback(
    (offset: { x: number; y: number }, scale: number) => {
      const metrics = getZoomMetrics();
      if (!metrics.baseWidth || !metrics.baseHeight) {
        return { x: 0, y: 0 };
      }
      const scaledWidth = metrics.baseWidth * scale;
      const scaledHeight = metrics.baseHeight * scale;
      const maxOffsetX = Math.max(0, (scaledWidth - metrics.viewportWidth) / 2);
      const maxOffsetY = Math.max(
        0,
        (scaledHeight - metrics.viewportHeight) / 2,
      );
      return {
        x: clampValue(offset.x, -maxOffsetX, maxOffsetX),
        y: clampValue(offset.y, -maxOffsetY, maxOffsetY),
      };
    },
    [getZoomMetrics],
  );

  const resetZoomInteraction = useCallback(() => {
    setZoomDragging(false);
    dragRef.current = {
      active: false,
      startX: 0,
      startY: 0,
      originX: 0,
      originY: 0,
    };
    touchRef.current = createInitialTouchState();
  }, []);

  const resetZoomTransform = useCallback(() => {
    setZoomScale(1);
    setZoomOffset({ x: 0, y: 0 });
    resetZoomInteraction();
  }, [resetZoomInteraction]);

  const openZoom = useCallback(() => {
    if (!previewUrl) return;
    setZoomOpen(true);
  }, [previewUrl]);

  const closeZoom = useCallback(() => {
    setZoomOpen(false);
    resetZoomTransform();
  }, [resetZoomTransform]);

  const updateZoomScale = useCallback(
    (
      nextScale: number,
      focusClient: { x: number; y: number } | null,
      baseState?: { scale?: number; offset?: { x: number; y: number } },
    ) => {
      const safeScale = clampZoomScale(nextScale);
      const previousScale = baseState?.scale ?? zoomScale;
      const previousOffset = baseState?.offset ?? zoomOffset;
      const viewport = viewportRef.current;
      let nextOffset = previousOffset;

      if (focusClient && viewport && previousScale > 0) {
        const rect = viewport.getBoundingClientRect();
        const focusX = focusClient.x - rect.left - rect.width / 2;
        const focusY = focusClient.y - rect.top - rect.height / 2;
        const ratio = safeScale / previousScale;
        nextOffset = {
          x: previousOffset.x * ratio + focusX * (1 - ratio),
          y: previousOffset.y * ratio + focusY * (1 - ratio),
        };
      }

      const clampedOffset = clampZoomOffset(nextOffset, safeScale);
      setZoomScale(safeScale);
      setZoomOffset(clampedOffset);
      return { scale: safeScale, offset: clampedOffset };
    },
    [clampZoomOffset, clampZoomScale, zoomOffset, zoomScale],
  );

  const getViewportCenterFocus = useCallback((): {
    x: number;
    y: number;
  } | null => {
    const viewport = viewportRef.current;
    if (!viewport || viewport.clientWidth <= 0 || viewport.clientHeight <= 0) {
      return null;
    }
    const rect = viewport.getBoundingClientRect();
    return {
      x: rect.left + viewport.clientWidth / 2,
      y: rect.top + viewport.clientHeight / 2,
    };
  }, []);

  const zoomIn = useCallback(() => {
    updateZoomScale(zoomScale + 0.25, getViewportCenterFocus());
  }, [getViewportCenterFocus, updateZoomScale, zoomScale]);

  const zoomOut = useCallback(() => {
    updateZoomScale(zoomScale - 0.25, getViewportCenterFocus());
  }, [getViewportCenterFocus, updateZoomScale, zoomScale]);

  const canPan = zoomScale > 1.001;

  useEffect(() => {
    if (!zoomOpen) return undefined;
    const onResize = () => {
      setZoomOffset((prev) => clampZoomOffset(prev, zoomScale));
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [clampZoomOffset, zoomOpen, zoomScale]);

  useEffect(() => {
    if (!zoomOpen) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeZoom();
      } else if (event.key === "+" || event.key === "=") {
        event.preventDefault();
        zoomIn();
      } else if (event.key === "-" || event.key === "_") {
        event.preventDefault();
        zoomOut();
      } else if (event.key === "0") {
        event.preventDefault();
        resetZoomTransform();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [closeZoom, resetZoomTransform, zoomIn, zoomOpen, zoomOut]);

  const handleZoomImageLoad = useCallback(
    (event: React.SyntheticEvent<HTMLImageElement>) => {
      naturalRef.current = {
        width: event.currentTarget.naturalWidth || 0,
        height: event.currentTarget.naturalHeight || 0,
      };
      setZoomOffset((prev) => clampZoomOffset(prev, zoomScale));
    },
    [clampZoomOffset, zoomScale],
  );

  const handleZoomWheel = useCallback(
    (event: React.WheelEvent) => {
      if (!zoomOpen || !previewUrl) return;
      event.preventDefault();
      const factor = Math.exp(-event.deltaY * 0.0015);
      updateZoomScale(zoomScale * factor, {
        x: event.clientX,
        y: event.clientY,
      });
    },
    [previewUrl, updateZoomScale, zoomOpen, zoomScale],
  );

  const finishDragging = useCallback(() => {
    setZoomDragging(false);
    dragRef.current.active = false;
  }, []);

  const handleMouseDown = useCallback(
    (event: React.MouseEvent) => {
      if (!canPan) return;
      event.preventDefault();
      dragRef.current = {
        active: true,
        startX: event.clientX,
        startY: event.clientY,
        originX: zoomOffset.x,
        originY: zoomOffset.y,
      };
      setZoomDragging(true);
    },
    [canPan, zoomOffset.x, zoomOffset.y],
  );

  const handleMouseMove = useCallback(
    (event: React.MouseEvent) => {
      const dragState = dragRef.current;
      if (!dragState.active) return;
      event.preventDefault();
      const dx = event.clientX - dragState.startX;
      const dy = event.clientY - dragState.startY;
      const nextOffset = clampZoomOffset(
        {
          x: dragState.originX + dx,
          y: dragState.originY + dy,
        },
        zoomScale,
      );
      setZoomOffset(nextOffset);
    },
    [clampZoomOffset, zoomScale],
  );

  const handleTouchStart = useCallback(
    (event: React.TouchEvent) => {
      if (!zoomOpen || !previewUrl) return;
      if (event.touches.length === 2) {
        touchRef.current = {
          mode: "pinch",
          startDistance: getTouchDistance(event.touches),
          startScale: zoomScale,
          startOffset: { ...zoomOffset },
          startCenter: getTouchCenter(event.touches),
          panStart: { x: 0, y: 0 },
          panOrigin: { x: 0, y: 0 },
        };
        return;
      }
      if (event.touches.length === 1) {
        const touch = event.touches[0];
        touchRef.current = {
          ...touchRef.current,
          mode: "pan",
          panStart: { x: touch.clientX, y: touch.clientY },
          panOrigin: { ...zoomOffset },
        };
      }
    },
    [previewUrl, zoomOffset, zoomOpen, zoomScale],
  );

  const handleTouchMove = useCallback(
    (event: React.TouchEvent) => {
      const touchState = touchRef.current;
      if (touchState.mode === "pan" && event.touches.length === 1) {
        if (!canPan) return;
        event.preventDefault();
        const touch = event.touches[0];
        const dx = touch.clientX - touchState.panStart.x;
        const dy = touch.clientY - touchState.panStart.y;
        setZoomOffset(
          clampZoomOffset(
            {
              x: touchState.panOrigin.x + dx,
              y: touchState.panOrigin.y + dy,
            },
            zoomScale,
          ),
        );
        return;
      }

      if (touchState.mode === "pinch" && event.touches.length === 2) {
        event.preventDefault();
        const distance = getTouchDistance(event.touches);
        if (!touchState.startDistance) return;

        const nextScale = clampZoomScale(
          touchState.startScale * (distance / touchState.startDistance),
        );
        const center = getTouchCenter(event.touches);
        const viewport = viewportRef.current;
        if (!viewport) return;

        const rect = viewport.getBoundingClientRect();
        const focusX = center.x - rect.left - rect.width / 2;
        const focusY = center.y - rect.top - rect.height / 2;
        const ratio = nextScale / touchState.startScale;

        let nextOffset = {
          x: touchState.startOffset.x * ratio + focusX * (1 - ratio),
          y: touchState.startOffset.y * ratio + focusY * (1 - ratio),
        };
        nextOffset = {
          x: nextOffset.x + (center.x - touchState.startCenter.x),
          y: nextOffset.y + (center.y - touchState.startCenter.y),
        };

        const clampedOffset = clampZoomOffset(nextOffset, nextScale);
        setZoomScale(nextScale);
        setZoomOffset(clampedOffset);
      }
    },
    [canPan, clampZoomOffset, clampZoomScale, zoomScale],
  );

  const handleTouchEnd = useCallback(
    (event: React.TouchEvent) => {
      if (event.touches.length === 1) {
        const touch = event.touches[0];
        touchRef.current = {
          ...touchRef.current,
          mode: "pan",
          panStart: { x: touch.clientX, y: touch.clientY },
          panOrigin: { ...zoomOffset },
        };
        return;
      }
      if (event.touches.length === 2) {
        touchRef.current = {
          mode: "pinch",
          startDistance: getTouchDistance(event.touches),
          startScale: zoomScale,
          startOffset: { ...zoomOffset },
          startCenter: getTouchCenter(event.touches),
          panStart: { x: 0, y: 0 },
          panOrigin: { x: 0, y: 0 },
        };
        return;
      }
      touchRef.current = createInitialTouchState();
      finishDragging();
    },
    [finishDragging, zoomOffset, zoomScale],
  );

  const handleDoubleClick = useCallback(
    (event: React.MouseEvent) => {
      if (!previewUrl) return;
      const targetScale = zoomScale > 1.5 ? 1 : 2;
      updateZoomScale(targetScale, { x: event.clientX, y: event.clientY });
    },
    [previewUrl, updateZoomScale, zoomScale],
  );

  return {
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
  };
}
