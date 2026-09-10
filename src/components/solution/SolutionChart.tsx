import {
  Chart as ChartJS,
  type ChartOptions,
  type Plugin,
  Filler,
  Legend,
  LinearScale,
  LineElement,
  PointElement,
  Title,
  Tooltip,
} from "chart.js";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { Line } from "react-chartjs-2";
import { useI18n } from "../../i18n";
import { formatTime } from "../../utils/constants";
import { useTheme } from "../../utils/useTheme";

const CHART_CANVAS_BG_DARK = "#111111";
const CHART_CANVAS_BG_LIGHT = "#F8FAFC";

function resolveChartCanvasBg(): string {
  if (typeof document === "undefined") return CHART_CANVAS_BG_DARK;
  const token = getComputedStyle(document.documentElement)
    .getPropertyValue("--ef-chart-canvas")
    .trim();
  if (token) return token;
  return document.documentElement.classList.contains("light")
    ? CHART_CANVAS_BG_LIGHT
    : CHART_CANVAS_BG_DARK;
}

const chartBackgroundPlugin: Plugin<"line"> = {
  id: "digeChartBackground",
  beforeDraw(chart) {
    const { ctx } = chart;
    ctx.save();
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = resolveChartCanvasBg();
    ctx.fillRect(0, 0, chart.width, chart.height);
    ctx.restore();
  },
};

ChartJS.register(
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
  chartBackgroundPlugin
);

const fontFamily = "Frex Sans GB VF";
const TARGET_SECONDS_PER_POINT = 4;
const MAX_CHART_POINTS = 1000;
const MIN_VISIBLE_SECONDS = TARGET_SECONDS_PER_POINT * 20;

export interface SolutionChartProps {
  solution?: {
    batteryLog?: number[];
    powerLog?: number[];
    burnStateLog?: number[][];
    preciseBatteryLog?: number[];
    precisePowerLog?: number[];
    preciseBurnStateLog?: number[][];
    period?: number;
  };
  targetPower: number;
  minBatteryThreshold?: number;
  batteryCapacity?: number;
  hideHoverDetails?: boolean;
  preciseValues?: boolean;
}

export default function SolutionChart({
  solution,
  targetPower,
  minBatteryThreshold,
  batteryCapacity,
  hideHoverDetails = false,
  preciseValues = false,
}: SolutionChartProps) {
  const { t } = useI18n();
  const { isLight } = useTheme();
  const chartRef = useRef<React.ComponentRef<typeof Line> | null>(null);
  const interactionRef = useRef({
    dragging: false,
    lastClientX: 0,
    pinchDistance: 0,
  });
  const zoomRangeRef = useRef({
    min: 0,
    max: 0,
    isCustom: false,
  });

  const {
    batteryData,
    powerData,
    burnStateData,
    xValues,
    secondsPerPoint,
    maxX,
    minVisibleSpanPoints,
  } = useMemo(() => {
    const sourceBatteryLog = preciseValues
      ? solution?.preciseBatteryLog || solution?.batteryLog
      : solution?.batteryLog;
    const sourcePowerLog = preciseValues
      ? solution?.precisePowerLog || solution?.powerLog
      : solution?.powerLog;
    const sourceBurnStateLog = preciseValues
      ? solution?.preciseBurnStateLog || solution?.burnStateLog
      : solution?.burnStateLog;

    let batteryData = sourceBatteryLog ? [...sourceBatteryLog] : [];
    let powerData = sourcePowerLog ? [...sourcePowerLog] : [];
    let burnStateData = sourceBurnStateLog
      ? sourceBurnStateLog.map((series) => [...series])
      : [];

    // For base-only/direct solutions we may have a single sample.
    // Duplicate it so the chart renders a visible horizontal segment.
    if (batteryData.length === 1) {
      const batteryValue = batteryData[0] ?? 0;
      const powerValue = powerData[0] ?? 0;
      batteryData = [batteryValue, batteryValue];
      powerData = [powerValue, powerValue];
      burnStateData = burnStateData.map((series) => {
        const state = series[0] ?? 0;
        return [state, state];
      });
    }

    const rawBatteryData = batteryData;
    const rawPowerData = powerData;
    const rawBurnStateData = burnStateData;
    const rawPointCount = rawBatteryData.length;
    const rawPeriod = Math.max(0, solution?.period ?? 0);
    const usingPreciseSource =
      preciseValues && Array.isArray(solution?.preciseBatteryLog);
    const rawSecondsPerPoint = usingPreciseSource
      ? 1
      : rawPeriod > 0 && rawPointCount > 1
      ? rawPeriod / (rawPointCount - 1)
      : 1;

    let secondsPerPoint = rawSecondsPerPoint;

    if (!preciseValues && rawPeriod > 0 && rawPointCount > 1) {
      const sampleCount = Math.floor(rawPeriod / TARGET_SECONDS_PER_POINT) + 1;
      const lastRawIndex = rawPointCount - 1;
      const getNearestRawIndex = (tSec: number) => {
        const rawPos = tSec / rawSecondsPerPoint;
        return Math.max(0, Math.min(lastRawIndex, Math.round(rawPos)));
      };
      const sampleLinear = (arr: number[], tSec: number) => {
        const rawPos = tSec / rawSecondsPerPoint;
        const i0 = Math.max(0, Math.min(lastRawIndex, Math.floor(rawPos)));
        const i1 = Math.max(0, Math.min(lastRawIndex, i0 + 1));
        const ratio = Math.max(0, Math.min(1, rawPos - i0));
        const v0 = arr[i0] ?? 0;
        const v1 = arr[i1] ?? v0;
        return v0 + (v1 - v0) * ratio;
      };

      batteryData = Array.from({ length: sampleCount }, (_, sampleIdx) => {
        const tSec = sampleIdx * TARGET_SECONDS_PER_POINT;
        return sampleLinear(rawBatteryData, tSec);
      });

      powerData = Array.from({ length: sampleCount }, (_, sampleIdx) => {
        const tSec = sampleIdx * TARGET_SECONDS_PER_POINT;
        const i = getNearestRawIndex(tSec);
        return rawPowerData[i] ?? 0;
      });

      burnStateData = rawBurnStateData.map((series) =>
        Array.from({ length: sampleCount }, (_, sampleIdx) => {
          const tSec = sampleIdx * TARGET_SECONDS_PER_POINT;
          const i = getNearestRawIndex(tSec);
          return series[i] ?? 0;
        })
      );

      secondsPerPoint = TARGET_SECONDS_PER_POINT;
    }

    if (!preciseValues && batteryData.length > MAX_CHART_POINTS) {
      const compactStep = Math.ceil(batteryData.length / MAX_CHART_POINTS);
      const lastIndex = batteryData.length - 1;
      const keepCompact = (_: unknown, i: number) =>
        i % compactStep === 0 || i === lastIndex;
      batteryData = batteryData.filter(keepCompact);
      powerData = powerData.filter(keepCompact);
      burnStateData = burnStateData.map((series) => series.filter(keepCompact));
      secondsPerPoint *= compactStep;
    }

    const pointCount = batteryData.length;
    const maxX = Math.max(0, pointCount - 1);
    const maxVisibleSeconds = Math.max(0, maxX * secondsPerPoint);
    const minVisibleSeconds = Math.min(
      MIN_VISIBLE_SECONDS,
      maxVisibleSeconds || MIN_VISIBLE_SECONDS
    );
    const minVisibleSpanPoints =
      secondsPerPoint > 0
        ? Math.min(maxX + 1, minVisibleSeconds / secondsPerPoint)
        : Math.min(20, maxX + 1);
    const xValues = batteryData.map((_, i) => i);

    return {
      batteryData,
      powerData,
      burnStateData,
      xValues,
      secondsPerPoint,
      maxX,
      minVisibleSpanPoints,
    };
  }, [solution, preciseValues]);

  const hasData = !!(solution && batteryData.length > 0);
  const toSeconds = useCallback(
    (value: number) => value * secondsPerPoint,
    [secondsPerPoint]
  );
  const toIndex = useCallback(
    (value: number) => (secondsPerPoint > 0 ? value / secondsPerPoint : 0),
    [secondsPerPoint]
  );
  const clampRange = useCallback(
    (min: number, max: number, minSpanOverride: number | null = null) => {
      const fullMin = 0;
      const fullMax = maxX;
      const fullSpan = fullMax - fullMin;
      let nextMin = min;
      let nextMax = max;
      let span = nextMax - nextMin;

      const minSpan = Number.isFinite(minSpanOverride)
        ? Math.max(0, minSpanOverride ?? 0)
        : Math.min(minVisibleSpanPoints, fullSpan || 1);

      if (span < minSpan) {
        span = minSpan;
        const center = (nextMin + nextMax) / 2;
        nextMin = center - span / 2;
        nextMax = center + span / 2;
      }

      if (nextMin < fullMin) {
        nextMax += fullMin - nextMin;
        nextMin = fullMin;
      }
      if (nextMax > fullMax) {
        nextMin -= nextMax - fullMax;
        nextMax = fullMax;
      }

      if (fullSpan <= 0) return { min: fullMin, max: fullMax };
      return {
        min: Math.max(fullMin, nextMin),
        max: Math.min(fullMax, nextMax),
      };
    },
    [maxX, minVisibleSpanPoints]
  );
  const isFullRange = useCallback(
    (range: { min: number; max: number }) =>
      Math.abs(range.min) < 1e-3 && Math.abs(range.max - maxX) < 1e-3,
    [maxX]
  );
  const storedSpanPoints = zoomRangeRef.current.isCustom
    ? Math.max(
        0,
        toIndex(zoomRangeRef.current.max) - toIndex(zoomRangeRef.current.min)
      )
    : null;
  const renderRange = zoomRangeRef.current.isCustom
    ? clampRange(
        toIndex(zoomRangeRef.current.min),
        toIndex(zoomRangeRef.current.max),
        storedSpanPoints
      )
    : { min: 0, max: maxX };
  const batteryPercent = batteryData.map((v) =>
    Math.min(100, Math.max(0, (v / (batteryCapacity || 100000)) * 100))
  );
  const powerPoints = xValues.map((x, i) => ({ x, y: powerData[i] ?? null }));
  const targetPoints = xValues.map((x) => ({ x, y: targetPower }));
  const batteryPoints = xValues.map((x, i) => ({ x, y: batteryPercent[i] }));
  const minBatteryThresholdValue = Number.isFinite(minBatteryThreshold)
    ? Math.min(100, Math.max(0, Number(minBatteryThreshold)))
    : null;
  const minBatteryThresholdPoints =
    minBatteryThresholdValue === null
      ? []
      : xValues.map((x) => ({ x, y: minBatteryThresholdValue }));
  const minBatteryThresholdLabel =
    minBatteryThresholdValue === null
      ? t("minBatteryPercent")
      : `${t("minBatteryPercent")} (${minBatteryThresholdValue.toFixed(0)}%)`;
  const powerLineColor = isLight ? "#D97706" : "#d4ff00";
  const batteryLineColor = isLight ? "#0891B2" : "#4ecdc4";
  const targetLineColor = isLight ? "#DC2626" : "#ff6b6b";
  const chartCanvasBg = isLight ? CHART_CANVAS_BG_LIGHT : CHART_CANVAS_BG_DARK;
  const burnLineColor = isLight ? "#C2410C" : "#ff9f43";
  const minBatteryLineColor = isLight ? "#B45309" : "#ffd166";
  const powerFillColor = isLight
    ? "rgba(217, 119, 6, 0.08)"
    : "rgba(212, 255, 0, 0.05)";
  const batteryFillColor = isLight
    ? "rgba(8, 145, 178, 0.08)"
    : "rgba(78, 205, 196, 0.05)";
  const burnFillColor = isLight
    ? "rgba(194, 65, 12, 0.12)"
    : "rgba(255, 159, 67, 0.15)";
  const burnStateDatasets = burnStateData.map((series, idx) => ({
    label: `${t("branch")} ${idx + 1} ${t("burnStateShort")}`,
    data: xValues.map((x, i) => ({ x, y: series[i] > 0 ? idx + 1 : null })),
    borderColor: burnLineColor,
    backgroundColor: burnFillColor,
    borderWidth: 2,
    pointRadius: 0,
    fill: false,
    stepped: true,
    spanGaps: false,
    yAxisID: "y2",
  }));

  const data = useMemo(
    () => ({
      datasets: [
        {
          label: t("currentPower"),
          data: powerPoints,
          borderColor: powerLineColor,
          backgroundColor: powerFillColor,
          borderWidth: 1.5,
          pointRadius: 0,
          fill: true,
          tension: 0.1,
          yAxisID: "y",
        },
        {
          label: t("targetPowerLine"),
          data: targetPoints,
          borderColor: targetLineColor,
          borderWidth: 1,
          borderDash: [4, 4],
          pointRadius: 0,
          fill: false,
          yAxisID: "y",
        },
        {
          label: t("batteryLevel"),
          data: batteryPoints,
          borderColor: batteryLineColor,
          backgroundColor: batteryFillColor,
          borderWidth: 1.5,
          pointRadius: 0,
          fill: true,
          tension: 0.1,
          yAxisID: "y1",
        },
        ...(minBatteryThresholdValue === null
          ? []
          : [
              {
                label: minBatteryThresholdLabel,
                data: minBatteryThresholdPoints,
                borderColor: minBatteryLineColor,
                borderWidth: 1,
                borderDash: [6, 4],
                pointRadius: 0,
                fill: false,
                yAxisID: "y1",
              },
            ]),
        ...burnStateDatasets,
      ],
    }),
    [
      t,
      powerPoints,
      targetPoints,
      batteryPoints,
      minBatteryThresholdLabel,
      minBatteryThresholdPoints,
      minBatteryThresholdValue,
      burnStateDatasets,
      powerLineColor,
      powerFillColor,
      targetLineColor,
      batteryLineColor,
      batteryFillColor,
      minBatteryLineColor,
    ]
  );

  const options = useMemo(() => {
    const gridColor = isLight ? "#E5E7EB" : "#1A1A1A";
    const tickColor = isLight ? "#4B5563" : "#888888";
    const legendColor = isLight ? "#4B5563" : "#666666";
    return {
      responsive: true,
      maintainAspectRatio: false,
      animation: false as const,
      interaction: {
        mode: (hideHoverDetails ? "nearest" : "index") as "nearest" | "index",
        intersect: hideHoverDetails,
      },
      plugins: {
        legend: {
          display: true,
          position: "top" as const,
          align: "start" as const,
          labels: {
            color: legendColor,
            font: { family: fontFamily, size: 12 },
            boxWidth: 12,
            boxHeight: 12,
            padding: 10,
          },
        },
        tooltip: {
          enabled: !hideHoverDetails,
          backgroundColor: isLight
            ? "rgba(255, 255, 255, 0.95)"
            : "rgba(17, 17, 17, 0.95)",
          titleColor: isLight ? "#09090B" : "#FFFFFF",
          bodyColor: isLight ? "#52525B" : "#CCCCCC",
          borderColor: isLight ? "#E2E4E8" : "#2A2A2A",
          borderWidth: 1,
          titleFont: { family: fontFamily, size: 12 },
          bodyFont: { family: fontFamily, size: 12 },
          callbacks: {
            title: ((items: unknown[]) => {
              if (!items || items.length === 0) return "";
              const first = items[0] as { parsed?: { x?: number | null } };
              const x = Number(first?.parsed?.x ?? 0);
              return formatTime(Math.max(0, x * secondsPerPoint));
            }) as (this: unknown, items: unknown[]) => string,
            label: ((context: {
              dataset: { label?: string; yAxisID?: string };
              parsed?: { y?: number | null };
            }) => {
              const label = context.dataset.label || "";
              const value = context.parsed?.y;
              if (context.dataset.yAxisID === "y1") {
                return `${label}: ${Number(value).toFixed(1)}%`;
              }
              if (context.dataset.yAxisID === "y2") {
                return value
                  ? `${label}: ${t("stateOn")}`
                  : `${label}: ${t("stateOff")}`;
              }
              return `${label}: ${Math.round(Number(value) || 0)}w`;
            }) as (this: unknown, context: unknown) => string,
          },
        },
      },
      scales: {
        x: {
          type: "linear" as const,
          display: true,
          min: renderRange.min,
          max: renderRange.max,
          grid: { color: gridColor },
          ticks: {
            color: tickColor,
            font: { family: fontFamily, size: 11 },
            maxTicksLimit: 6,
            callback: (value: string | number) =>
              formatTime(Math.max(0, Number(value) * secondsPerPoint)),
          },
        },
        y: {
          type: "linear" as const,
          display: true,
          position: "left" as const,
          grid: { color: gridColor },
          ticks: {
            color: powerLineColor,
            font: { family: fontFamily, size: 12 },
            maxTicksLimit: 5,
          },
          title: {
            display: true,
            text: `${t("powerAxis")} (w)`,
            color: powerLineColor,
            font: { family: fontFamily, size: 12 },
          },
          min: 0,
        },
        y1: {
          type: "linear" as const,
          display: true,
          position: "right" as const,
          grid: { drawOnChartArea: false },
          ticks: {
            color: tickColor,
            font: { family: fontFamily, size: 12 },
            callback: (value: number) => `${value}%`,
            maxTicksLimit: 5,
          },
          title: {
            display: true,
            text: `${t("batteryAxis")} (%)`,
            color: batteryLineColor,
            font: { family: fontFamily, size: 12 },
          },
          min: 0,
          max: 100,
        },
        y2: {
          type: "linear" as const,
          display: false,
          position: "right" as const,
          offset: true,
          grid: { drawOnChartArea: false },
          ticks: { display: false },
          title: { display: false },
          min: 0,
          max: Math.max(1, burnStateDatasets.length + 0.5),
        },
      },
    } as ChartOptions<"line">;
  }, [
    isLight,
    hideHoverDetails,
    secondsPerPoint,
    t,
    renderRange.min,
    renderRange.max,
    burnStateDatasets.length,
    powerLineColor,
    batteryLineColor,
  ]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;

    const xOptions = chart.options?.scales?.x;
    if (!xOptions) return;

    const stored = zoomRangeRef.current;
    const storedSpan = stored.isCustom
      ? Math.max(0, toIndex(stored.max) - toIndex(stored.min))
      : null;
    const next = stored.isCustom
      ? clampRange(toIndex(stored.min), toIndex(stored.max), storedSpan)
      : clampRange(0, maxX);
    const full = isFullRange(next);
    zoomRangeRef.current = {
      min: toSeconds(next.min),
      max: toSeconds(next.max),
      isCustom: stored.isCustom ? !full : false,
    };
    xOptions.min = next.min;
    xOptions.max = next.max;
    chart.update("none");
  }, [maxX, clampRange, isFullRange, toIndex, toSeconds]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    chart.update("none");
  }, [isLight, data, options]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || maxX <= 0) return undefined;

    const canvas = chart.canvas;
    canvas.style.touchAction = "none";

    const getCurrentRange = () => {
      const xScale = chart.scales.x;
      const min = Number.isFinite(xScale?.min) ? xScale.min : 0;
      const max = Number.isFinite(xScale?.max) ? xScale.max : maxX;
      return { min, max };
    };

    const applyRange = (min: number, max: number) => {
      const next = clampRange(min, max);
      const xOptions = chart.options?.scales?.x;
      if (!xOptions) return;
      xOptions.min = next.min;
      xOptions.max = next.max;
      const full = isFullRange(next);
      zoomRangeRef.current = {
        min: toSeconds(next.min),
        max: toSeconds(next.max),
        isCustom: !full,
      };
      chart.update("none");
    };

    const zoomAtClientX = (clientX: number, factor: number) => {
      const xScale = chart.scales.x;
      if (!xScale) return;
      const rect = canvas.getBoundingClientRect();
      const pixelX = clientX - rect.left;
      const centerValue = xScale.getValueForPixel(pixelX);
      if (centerValue == null || !Number.isFinite(centerValue)) return;

      const { min, max } = getCurrentRange();
      const span = Math.max(1, max - min);
      const nextSpan = Math.max(
        Math.min(minVisibleSpanPoints, maxX || 1),
        span * factor
      );
      const ratio = (centerValue - min) / span;
      const nextMin = centerValue - ratio * nextSpan;
      const nextMax = nextMin + nextSpan;
      applyRange(nextMin, nextMax);
    };

    const panByPixels = (deltaPixels: number) => {
      const xScale = chart.scales.x;
      if (!xScale) return;
      const { min, max } = getCurrentRange();
      const span = Math.max(1, max - min);
      const pxSpan = Math.max(1, xScale.right - xScale.left);
      const deltaX = (deltaPixels / pxSpan) * span;
      applyRange(min + deltaX, max + deltaX);
    };

    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const factor = event.deltaY < 0 ? 0.9 : 1.1;
      zoomAtClientX(event.clientX, factor);
    };

    const onMouseDown = (event: MouseEvent) => {
      interactionRef.current.dragging = true;
      interactionRef.current.lastClientX = event.clientX;
    };

    const onMouseMove = (event: MouseEvent) => {
      if (!interactionRef.current.dragging) return;
      event.preventDefault();
      const delta = interactionRef.current.lastClientX - event.clientX;
      interactionRef.current.lastClientX = event.clientX;
      panByPixels(delta);
    };

    const stopMouseDrag = () => {
      interactionRef.current.dragging = false;
    };

    const onTouchStart = (event: TouchEvent) => {
      if (event.touches.length === 1) {
        interactionRef.current.dragging = true;
        interactionRef.current.lastClientX = event.touches[0].clientX;
        interactionRef.current.pinchDistance = 0;
      } else if (event.touches.length === 2) {
        const [a, b] = event.touches;
        interactionRef.current.dragging = false;
        interactionRef.current.pinchDistance = Math.hypot(
          a.clientX - b.clientX,
          a.clientY - b.clientY
        );
      }
    };

    const onTouchMove = (event: TouchEvent) => {
      event.preventDefault();

      if (event.touches.length === 1 && interactionRef.current.dragging) {
        const clientX = event.touches[0].clientX;
        const delta = interactionRef.current.lastClientX - clientX;
        interactionRef.current.lastClientX = clientX;
        panByPixels(delta);
        return;
      }

      if (event.touches.length === 2) {
        const [a, b] = event.touches;
        const distance = Math.hypot(
          a.clientX - b.clientX,
          a.clientY - b.clientY
        );
        const centerX = (a.clientX + b.clientX) / 2;

        if (interactionRef.current.pinchDistance > 0) {
          const factor = interactionRef.current.pinchDistance / distance;
          zoomAtClientX(centerX, factor);
        }
        interactionRef.current.pinchDistance = distance;
      }
    };

    const onTouchEnd = (event: TouchEvent) => {
      if (event.touches.length === 0) {
        interactionRef.current.dragging = false;
        interactionRef.current.pinchDistance = 0;
      } else if (event.touches.length === 1) {
        interactionRef.current.dragging = true;
        interactionRef.current.lastClientX = event.touches[0].clientX;
        interactionRef.current.pinchDistance = 0;
      }
    };

    canvas.addEventListener("wheel", onWheel, { passive: false });
    canvas.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", stopMouseDrag);
    canvas.addEventListener("mouseleave", stopMouseDrag);
    canvas.addEventListener("touchstart", onTouchStart, { passive: false });
    canvas.addEventListener("touchmove", onTouchMove, { passive: false });
    canvas.addEventListener("touchend", onTouchEnd);
    canvas.addEventListener("touchcancel", onTouchEnd);

    return () => {
      canvas.removeEventListener("wheel", onWheel);
      canvas.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", stopMouseDrag);
      canvas.removeEventListener("mouseleave", stopMouseDrag);
      canvas.removeEventListener("touchstart", onTouchStart);
      canvas.removeEventListener("touchmove", onTouchMove);
      canvas.removeEventListener("touchend", onTouchEnd);
      canvas.removeEventListener("touchcancel", onTouchEnd);
    };
  }, [maxX, minVisibleSpanPoints, clampRange, isFullRange, toSeconds]);

  if (!hasData) {
    return (
      <div
        className="h-56 sm:h-72 flex items-center justify-center text-endfield-text text-sm notranslate"
        translate="no"
      >
        {t("noChartData")}
      </div>
    );
  }

  return (
    <div
      className="h-56 sm:h-72 notranslate"
      translate="no"
      style={{ backgroundColor: "var(--ef-chart-canvas)" }}
    >
      <Line
        key={isLight ? "light" : "dark"}
        ref={chartRef}
        data={data}
        options={options}
        style={{ backgroundColor: chartCanvasBg }}
      />
    </div>
  );
}
