/**
 * 周期图表绘制
 */

import {
  Chart as ChartJS,
  Filler,
  Legend,
  LinearScale,
  LineElement,
  PointElement,
  Title,
  Tooltip,
} from "chart.js";
import type { SolutionResult } from "../../types/calc";
import { CONSTANTS, formatTime } from "../constants";
import {
  type PoolSegments,
  poolAverageWatt,
  poolWattAt,
  resolveLogSecondsPerPoint,
} from "../poolChartSegments";
import { getExportTargetPower } from "./blueprintCore";

const POOL_LINE_COLOR = "#ffd60a";
import {
  canvasToBlob,
  ensureCanvasFontReady,
  getCanvasFontFamily,
  PRECISE_CHART_STYLE,
} from "./drawUtils";

ChartJS.register(
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
);

function getPreciseChartLabels(
  labels: Record<string, string> = {},
): Record<string, string> {
  return {
    currentPower: labels.currentPower || "Current Power",
    targetPowerLine: labels.targetPowerLine || "Target Power",
    batteryLevel: labels.batteryLevel || "Battery Level",
    minBatteryPercent: labels.minBatteryPercent || "Min Battery (%)",
    branch: labels.branch || "Branch",
    burnStateShort: labels.burnStateShort || "Burn",
    powerAxis: labels.powerAxis || "Power",
    batteryAxis: labels.batteryAxis || "Battery",
    stateOn: labels.stateOn || "On",
    stateOff: labels.stateOff || "Off",
    oscPoolPowerLine: labels.oscPoolPowerLine || "Pool Power",
  };
}

function getPreciseSeries(solution: SolutionResult | null | undefined): {
  batteryLog: number[];
  powerLog: number[];
  burnStateLog: number[][];
} {
  const batteryLog =
    Array.isArray(solution?.preciseBatteryLog) &&
    solution.preciseBatteryLog.length > 0
      ? solution.preciseBatteryLog
      : (solution?.batteryLog ?? []);
  const powerLog =
    Array.isArray(solution?.precisePowerLog) &&
    solution.precisePowerLog.length > 0
      ? solution.precisePowerLog
      : (solution?.powerLog ?? []);
  const burnStateLog =
    Array.isArray(solution?.preciseBurnStateLog) &&
    solution.preciseBurnStateLog.length > 0
      ? solution.preciseBurnStateLog
      : (solution?.burnStateLog ?? []);

  return {
    batteryLog: Array.isArray(batteryLog) ? batteryLog : [],
    powerLog: Array.isArray(powerLog) ? powerLog : [],
    burnStateLog: Array.isArray(burnStateLog) ? burnStateLog : [],
  };
}

export interface PreciseChartOptions {
  targetPower?: number;
  batteryCapacity?: number;
  minBatteryThreshold?: number;
  chartLabels?: Record<string, string>;
  fontFamily?: string;
  chartWidth?: number;
  chartHeight?: number;
  /** 自定义震荡池分段；不传时不画池折线（与旧行为一致） */
  poolSegments?: PoolSegments;
  [key: string]: unknown;
}

export async function buildPreciseChartPngBlob(
  solution: SolutionResult | null | undefined,
  options: PreciseChartOptions = {},
): Promise<Blob> {
  const { batteryLog, powerLog, burnStateLog } = getPreciseSeries(solution);
  if (batteryLog.length === 0 || powerLog.length === 0) {
    throw new Error("No precise chart data available for export.");
  }

  const labels = getPreciseChartLabels(options.chartLabels ?? {});
  const fontFamily = getCanvasFontFamily(options);
  await ensureCanvasFontReady(fontFamily);

  const width =
    typeof options.chartWidth === "number" &&
    Number.isFinite(options.chartWidth)
      ? Math.max(800, Math.round(options.chartWidth))
      : PRECISE_CHART_STYLE.width;
  const height =
    typeof options.chartHeight === "number" &&
    Number.isFinite(options.chartHeight)
      ? Math.max(450, Math.round(options.chartHeight))
      : PRECISE_CHART_STYLE.height;
  const targetPower = getExportTargetPower(solution, options);
  const batteryCapacity =
    typeof options.batteryCapacity === "number" &&
    Number.isFinite(options.batteryCapacity)
      ? options.batteryCapacity
      : CONSTANTS.BATTERY_CAPACITY;
  const minBatteryThreshold = Number.isFinite(options.minBatteryThreshold)
    ? Math.min(100, Math.max(0, Number(options.minBatteryThreshold)))
    : null;

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Canvas 2D context is unavailable.");
  }
  ctx.fillStyle = PRECISE_CHART_STYLE.background;
  ctx.fillRect(0, 0, width, height);

  const xValues = batteryLog.map((_, i) => i);
  // 下标 → 秒：日志按仿真 sampleStep 采样，不能把下标当秒
  const secondsPerPoint = resolveLogSecondsPerPoint(solution);
  const poolSegments = Array.isArray(options.poolSegments)
    ? options.poolSegments
    : [];
  const poolLog = Array.isArray(solution?.poolPowerLog)
    ? solution.poolPowerLog
    : [];
  const poolDatasets =
    poolAverageWatt(poolSegments) > 0
      ? [
          {
            label: labels.oscPoolPowerLine,
            data: xValues.map((x, i) => ({
              x,
              y: poolLog[i] ?? poolWattAt(poolSegments, x * secondsPerPoint),
            })),
            borderColor: POOL_LINE_COLOR,
            borderWidth: 1.2,
            borderDash: [2, 3],
            pointRadius: 0,
            fill: false,
            stepped: true,
            yAxisID: "y",
          },
        ]
      : [];
  const batteryPercent = batteryLog.map((value) => {
    const ratio = batteryCapacity > 0 ? (value / batteryCapacity) * 100 : 0;
    return Math.min(100, Math.max(0, ratio));
  });

  const burnStateDatasets = burnStateLog.map((series, index) => ({
    label: `${labels.branch} ${index + 1} ${labels.burnStateShort}`,
    data: xValues.map((x, pointIndex) => ({
      x,
      y: series[pointIndex] > 0 ? index + 1 : null,
    })),
    borderColor: PRECISE_CHART_STYLE.burnColor,
    backgroundColor: "rgba(255, 159, 67, 0.12)",
    borderWidth: 2,
    pointRadius: 0,
    fill: false,
    stepped: true,
    spanGaps: false,
    yAxisID: "y2",
  }));

  const chart = new ChartJS(ctx, {
    type: "line",
    data: {
      datasets: [
        {
          label: labels.currentPower,
          data: xValues.map((x, i) => ({ x, y: powerLog[i] ?? null })),
          borderColor: PRECISE_CHART_STYLE.powerColor,
          backgroundColor: "rgba(212, 255, 0, 0.05)",
          borderWidth: 1.5,
          pointRadius: 0,
          fill: true,
          tension: 0.1,
          yAxisID: "y",
        },
        ...poolDatasets,
        {
          label: labels.targetPowerLine,
          data: xValues.map((x) => ({ x, y: targetPower })),
          borderColor: PRECISE_CHART_STYLE.targetColor,
          borderWidth: 1,
          borderDash: [4, 4],
          pointRadius: 0,
          fill: false,
          yAxisID: "y",
        },
        {
          label: labels.batteryLevel,
          data: xValues.map((x, i) => ({ x, y: batteryPercent[i] ?? null })),
          borderColor: PRECISE_CHART_STYLE.batteryColor,
          backgroundColor: "rgba(78, 205, 196, 0.05)",
          borderWidth: 1.5,
          pointRadius: 0,
          fill: true,
          tension: 0.1,
          yAxisID: "y1",
        },
        ...(minBatteryThreshold === null
          ? []
          : [
              {
                label: labels.minBatteryPercent,
                data: xValues.map((x) => ({ x, y: minBatteryThreshold })),
                borderColor: PRECISE_CHART_STYLE.minBatteryThresholdColor,
                borderWidth: 1,
                borderDash: [6, 4],
                pointRadius: 0,
                fill: false,
                yAxisID: "y1",
              },
            ]),
        ...burnStateDatasets,
      ],
    },
    options: {
      responsive: false,
      maintainAspectRatio: false,
      animation: false,
      parsing: false,
      normalized: true,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: {
          display: true,
          position: "top",
          align: "start",
          labels: {
            color: PRECISE_CHART_STYLE.legendColor,
            font: { family: fontFamily, size: 16 },
            boxWidth: 16,
            boxHeight: 16,
            padding: 16,
          },
        },
        tooltip: {
          enabled: true,
          backgroundColor: "#1a1a1a",
          titleColor: PRECISE_CHART_STYLE.textColor,
          bodyColor: "#cccccc",
          borderColor: "#333333",
          borderWidth: 1,
          titleFont: { family: fontFamily, size: 14 },
          bodyFont: { family: fontFamily, size: 14 },
          callbacks: {
            title: ((items: { parsed?: { x?: number | null } }[]) => {
              if (!items || items.length === 0) return "";
              const x = Number(items[0]?.parsed?.x ?? 0);
              return formatTime(Math.max(0, x * secondsPerPoint));
            }) as (this: unknown, items: unknown[]) => string,
            label: ((context: {
              dataset: { label?: string; yAxisID?: string };
              parsed?: { y?: number | null };
            }) => {
              const label = context.dataset.label || "";
              const value = context.parsed?.y ?? undefined;
              if (context.dataset.yAxisID === "y1") {
                return `${label}: ${Number(value).toFixed(1)}%`;
              }
              if (context.dataset.yAxisID === "y2") {
                return value
                  ? `${label}: ${labels.stateOn}`
                  : `${label}: ${labels.stateOff}`;
              }
              return `${label}: ${Math.round(Number(value) || 0)}w`;
            }) as (this: unknown, context: unknown) => string,
          },
        },
      },
      scales: {
        x: {
          type: "linear",
          display: true,
          min: 0,
          max: Math.max(0, xValues.length - 1),
          grid: { color: PRECISE_CHART_STYLE.gridColor },
          ticks: {
            color: PRECISE_CHART_STYLE.textColor,
            font: { family: fontFamily, size: 14 },
            maxTicksLimit: 8,
            callback: (value: string | number) =>
              formatTime(Math.max(0, Number(value) * secondsPerPoint)),
          },
        },
        y: {
          type: "linear",
          display: true,
          position: "left",
          grid: { color: PRECISE_CHART_STYLE.gridColor },
          ticks: {
            color: PRECISE_CHART_STYLE.powerColor,
            font: { family: fontFamily, size: 14 },
            maxTicksLimit: 7,
          },
          title: {
            display: true,
            text: `${labels.powerAxis} (w)`,
            color: PRECISE_CHART_STYLE.powerColor,
            font: { family: fontFamily, size: 14 },
          },
          min: 0,
        },
        y1: {
          type: "linear",
          display: true,
          position: "right",
          grid: { drawOnChartArea: false },
          ticks: {
            color: PRECISE_CHART_STYLE.batteryColor,
            font: { family: fontFamily, size: 14 },
            callback: (value: string | number) => `${value}%`,
            maxTicksLimit: 7,
          },
          title: {
            display: true,
            text: `${labels.batteryAxis} (%)`,
            color: PRECISE_CHART_STYLE.batteryColor,
            font: { family: fontFamily, size: 14 },
          },
          min: 0,
          max: 100,
        },
        y2: {
          type: "linear",
          display: false,
          position: "right",
          offset: true,
          grid: { drawOnChartArea: false },
          ticks: { display: false },
          title: { display: false },
          min: 0,
          max: Math.max(1, burnStateDatasets.length + 0.5),
        },
      },
    },
  });

  try {
    chart.update("none");
    chart.stop();
    await new Promise<void>((resolve) => {
      if (
        typeof window !== "undefined" &&
        typeof window.requestAnimationFrame === "function"
      ) {
        window.requestAnimationFrame(() => resolve());
        return;
      }
      setTimeout(resolve, 0);
    });
    return canvasToBlob(canvas, "image/png");
  } finally {
    chart.destroy();
  }
}
