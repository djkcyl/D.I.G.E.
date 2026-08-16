import { useCallback, useEffect, useRef, useState } from "react";
import { useI18n } from "../../../i18n";
import type { OscillatingBranch } from "../../../types/calc";
import { FUEL_OPTIONS, SECONDARY_FUEL_OPTIONS } from "../../../utils/constants";
import BlueprintCell from "./BlueprintCell";

export interface BlueprintBranchProps {
  branch: OscillatingBranch;
  zoom?: number;
  onWheelZoom?: (e: React.WheelEvent) => void;
  onTouchStart?: (e: React.TouchEvent) => void;
  onTouchMove?: (e: React.TouchEvent) => void;
  onTouchEnd?: () => void;
}
export default function BlueprintBranch({
  branch,
  zoom = 1,
  onWheelZoom,
  onTouchStart: onPinchStart,
  onTouchMove: onPinchMove,
  onTouchEnd: onPinchEnd,
}: BlueprintBranchProps) {
  const { t, locale } = useI18n();
  const {
    denominator,
    power,
    blueprint,
    description,
    requiresLimiter,
    limiterSpeed,
    fuelId,
  } = branch;
  const branchFuelMeta = fuelId
    ? FUEL_OPTIONS.find((f) => f.id === fuelId) ||
      SECONDARY_FUEL_OPTIONS.find((f) => f.id === fuelId)
    : undefined;
  const branchFuelLabel = branchFuelMeta
    ? branchFuelMeta.name?.[locale] || branchFuelMeta.name?.en
    : fuelId;
  const hasBlueprint =
    Array.isArray(blueprint) &&
    blueprint.length > 0 &&
    Array.isArray(blueprint[0]);
  const scrollRef = useRef<HTMLFieldSetElement>(null);
  const [isPanning, setIsPanning] = useState(false);
  const [canScroll, setCanScroll] = useState(false);
  const panStartRef = useRef({ x: 0, y: 0, scrollLeft: 0, scrollTop: 0 });
  const isPanningRef = useRef(false);
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const check = () => {
      setCanScroll(
        el.scrollWidth > el.clientWidth || el.scrollHeight > el.clientHeight
      );
    };
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const handlePanStart = useCallback((clientX: number, clientY: number) => {
    const el = scrollRef.current;
    if (
      !el ||
      (el.scrollWidth <= el.clientWidth && el.scrollHeight <= el.clientHeight)
    )
      return;
    isPanningRef.current = true;
    setIsPanning(true);
    panStartRef.current = {
      x: clientX,
      y: clientY,
      scrollLeft: el.scrollLeft,
      scrollTop: el.scrollTop,
    };
  }, []);

  const handlePanMove = useCallback((clientX: number, clientY: number) => {
    if (!isPanningRef.current || !scrollRef.current) return;
    const el = scrollRef.current;
    const { x, y, scrollLeft, scrollTop } = panStartRef.current;
    const z = zoomRef.current;
    const dx = (clientX - x) / z;
    const dy = (clientY - y) / z;
    const maxScrollLeft = Math.max(0, el.scrollWidth - el.clientWidth);
    const maxScrollTop = Math.max(0, el.scrollHeight - el.clientHeight);
    el.scrollLeft = Math.max(0, Math.min(maxScrollLeft, scrollLeft - dx));
    el.scrollTop = Math.max(0, Math.min(maxScrollTop, scrollTop - dy));
  }, []);

  const handlePanEnd = useCallback(() => {
    isPanningRef.current = false;
    setIsPanning(false);
  }, []);

  useEffect(() => {
    if (!isPanning) return;
    const onMove = (e: MouseEvent) => handlePanMove(e.clientX, e.clientY);
    const onUp = () => handlePanEnd();
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    return () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
  }, [isPanning, handlePanMove, handlePanEnd]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const handler = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        onPinchMove?.(e as unknown as React.TouchEvent);
      } else if (e.touches.length === 1 && isPanningRef.current) {
        e.preventDefault();
      }
    };
    el.addEventListener("touchmove", handler, { passive: false });
    return () => el.removeEventListener("touchmove", handler);
  }, [onPinchMove]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !onWheelZoom) return;
    el.addEventListener("wheel", onWheelZoom as unknown as EventListener, {
      passive: false,
    });
    return () =>
      el.removeEventListener("wheel", onWheelZoom as unknown as EventListener);
  }, [onWheelZoom]);

  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button !== 0) return;
      handlePanStart(e.clientX, e.clientY);
      e.preventDefault();
    },
    [handlePanStart]
  );

  const onTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (e.touches.length >= 2) {
        handlePanEnd();
        return;
      }
      if (e.touches.length === 1)
        handlePanMove(e.touches[0].clientX, e.touches[0].clientY);
    },
    [handlePanMove, handlePanEnd]
  );

  const blueprintRows = blueprint ?? [];
  const blueprintCols = blueprintRows?.[0]?.length ?? 0;

  return (
    <div className="flex flex-col gap-1.5 py-2 sm:py-3 px-1 sm:px-2">
      <fieldset
        aria-label={t("blueprintPreview")}
        ref={scrollRef}
        className="flex-1 overflow-x-auto overflow-y-auto pb-1 select-none min-h-0 min-w-0 border-0 p-0 m-0"
        style={{
          cursor: canScroll ? (isPanning ? "grabbing" : "grab") : "default",
        }}
        onMouseDown={onMouseDown}
        onMouseUp={handlePanEnd}
        onMouseLeave={handlePanEnd}
        onTouchStart={(e) => {
          onPinchStart?.(e);
          if (e.touches.length === 1) {
            const touch = e.touches[0];
            handlePanStart(touch.clientX, touch.clientY);
          }
          if (e.touches.length >= 2) handlePanEnd();
        }}
        onTouchMove={onTouchMove}
        onTouchEnd={() => {
          onPinchEnd?.();
          handlePanEnd();
        }}
      >
        <div className="w-max mx-auto">
          <div className="flex flex-col items-center justify-center gap-0.5 mb-1">
            <div className="flex flex-wrap items-center justify-center gap-2">
              <span className="text-xs text-endfield-yellow font-bold">
                1/{String(denominator ?? 0)}
              </span>
              <span className="text-[10px] text-endfield-text">
                {power.toFixed(0)}w
              </span>
              {branchFuelLabel ? (
                <span className="text-[10px] leading-none text-endfield-text-light/80 border border-endfield-gray-light px-1 py-0.5 rounded-sm whitespace-nowrap">
                  {branchFuelLabel}
                </span>
              ) : null}
              {requiresLimiter && limiterSpeed != null ? (
                <span className="text-[10px] font-bold text-endfield-yellow border-2 border-endfield-yellow bg-endfield-yellow/15 px-1.5 py-0.5 shadow-[0_0_8px_rgba(255,214,10,0.25)]">
                  {t("gateShort")} {limiterSpeed}/{t("itemPerMin")}
                </span>
              ) : null}
            </div>
            {description ? (
              <span
                className={`text-[9px] text-center max-w-xs ${
                  requiresLimiter
                    ? "text-endfield-yellow font-medium"
                    : "text-endfield-text/70"
                }`}
              >
                {description}
              </span>
            ) : null}
          </div>
          {hasBlueprint ? (
            <div className="blueprint-grid inline-block border border-endfield-gray-light p-2 select-none w-max">
              <div
                className="grid gap-0 select-none w-max"
                style={{
                  gridTemplateColumns: `repeat(${blueprintCols}, minmax(2.5rem, 1fr))`,
                }}
              >
                {blueprintRows.flatMap((row, rowIndex) =>
                  row.map((part, colIndex) => (
                    <BlueprintCell
                      key={`${rowIndex}-${colIndex}-${String(
                        part?.partId ?? ""
                      )}-${String(part?.face ?? "")}`}
                      part={part}
                      rowIndex={rowIndex}
                      colIndex={colIndex}
                    />
                  ))
                )}
              </div>
            </div>
          ) : (
            <div className="h-8 px-2 border border-endfield-gray-light text-endfield-text-light bg-endfield-black/50 inline-flex items-center text-[10px] font-semibold">
              I S M T R
            </div>
          )}
        </div>
      </fieldset>
    </div>
  );
}
