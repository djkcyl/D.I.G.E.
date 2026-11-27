import { SITE_CONFIG } from "../../config/site";
/**
 * 完整导出图绘制
 */

import { QRCodeCanvas } from "qrcode.react";
import { createElement } from "react";
import { createRoot } from "react-dom/client";
import type { CalcParams, SolutionResult } from "../../types/calc";
import { buildPoolSegments } from "../poolChartSegments";
import type { BranchBlueprint } from "./blueprintCore";
import {
  buildExportParamsPayload,
  getBranchDenominatorToken,
  getBranchPowerToken,
  getExportTargetPower,
  toFiniteOrNull,
} from "./blueprintCore";
import { buildBranchPngBlob } from "./drawBranchPng";
import { buildPreciseChartPngBlob } from "./drawPreciseChart";
import {
  blobToImage,
  COMPLETE_EXPORT_IMAGE_STYLE,
  canvasToBlob,
  drawPanel,
  ensureCanvasFontReady,
  formatExportValue,
  getCanvasFontFamily,
  wrapTextLines,
} from "./drawUtils";

const DEFAULT_COMPLETE_EXPORT_WEBSITE = SITE_CONFIG.canonicalOrigin;

interface CompleteExportLabels {
  [key: string]: string | Record<string, string> | null;
}

function getCompleteExportLabels(
  labels: Record<string, unknown> = {},
): CompleteExportLabels {
  return {
    title: (labels.title as string) || "D.I.G.E. Complete Export",
    exportTime: (labels.exportTime as string) || "Export Time",
    parameters: (labels.parameters as string) || "Parameters",
    summary: (labels.summary as string) || "Summary",
    branches: (labels.branches as string) || "Branches",
    chart: (labels.chart as string) || "Precise Chart",
    targetPower: (labels.targetPower as string) || "Target Power",
    minBatteryPercent:
      (labels.minBatteryPercent as string) || "Min Battery (%)",
    maxWaste: (labels.maxWaste as string) || "Max Waste",
    maxBranches: (labels.maxBranches as string) || "Max Branches",
    branchPhaseOffset:
      (labels.branchPhaseOffset as string) || "Branch Phase Offset (cells)",
    excludeBelt: (labels.excludeBelt as string) || "Exclude Belts",
    primaryFuel: (labels.primaryFuel as string) || "Primary Fuel",
    secondaryFuel: (labels.secondaryFuel as string) || "Secondary Fuel",
    inputSource: (labels.inputSource as string) || "Input Source",
    actualPower: (labels.actualPower as string) || "Actual Power",
    cyclePeriod: (labels.cyclePeriod as string) || "Cycle Period",
    variance: (labels.variance as string) || "Variance",
    minBattery: (labels.minBattery as string) || "Min Battery",
    branchCount: (labels.branchCount as string) || "Branches",
    totalSplitters: (labels.totalSplitters as string) || "Total Splitters",
    stateOn: (labels.stateOn as string) || "On",
    stateOff: (labels.stateOff as string) || "Off",
    excludeBeltOn: (labels.excludeBeltOn as string) || "Enabled",
    excludeBeltOff: (labels.excludeBeltOff as string) || "Disabled",
    branch: (labels.branch as string) || "Branch",
    footnote: (labels.footnote as string) || "",
    primaryFuelNameMap:
      labels.primaryFuelNameMap && typeof labels.primaryFuelNameMap === "object"
        ? (labels.primaryFuelNameMap as Record<string, string>)
        : null,
    secondaryFuelNameMap:
      labels.secondaryFuelNameMap &&
      typeof labels.secondaryFuelNameMap === "object"
        ? (labels.secondaryFuelNameMap as Record<string, string>)
        : null,
    inputSourceNameMap:
      labels.inputSourceNameMap && typeof labels.inputSourceNameMap === "object"
        ? (labels.inputSourceNameMap as Record<string, string>)
        : null,
  };
}

function buildCompleteInfoSections(
  payload: Record<string, unknown>,
  labels: CompleteExportLabels,
): {
  parameters: { label: string; value: string }[];
  summary: { label: string; value: string }[];
} {
  const params = (payload?.params || {}) as Record<string, unknown>;
  const summary = (payload?.solutionSummary || {}) as Record<string, unknown>;
  const branches = Array.isArray(payload?.branches)
    ? (payload.branches as Record<string, unknown>[])
    : [];
  const resolveMappedValue = (
    value: unknown,
    nameMap: Record<string, string> | null,
  ): string => {
    if (value == null) return "-";
    const key = String(value);
    const mappedValue =
      nameMap && Object.hasOwn(nameMap, key) ? nameMap[key] : "";
    if (typeof mappedValue === "string" && mappedValue.trim()) {
      return mappedValue.trim();
    }
    return formatExportValue(value);
  };
  const excludeBeltValue =
    typeof params.excludeBelt === "boolean"
      ? params.excludeBelt
        ? String(labels.excludeBeltOn ?? "")
        : String(labels.excludeBeltOff ?? "")
      : formatExportValue(params.excludeBelt);
  const branchPhaseOffsetValues =
    branches.length > 0
      ? branches
          .map((branch, index) => {
            const rawOffset = toFiniteOrNull(branch?.phaseOffsetCells);
            const offset =
              rawOffset == null ? 0 : Math.max(0, Math.round(rawOffset));
            return `${String(labels.branch ?? "")} ${index + 1}: ${offset}`;
          })
          .join(" | ")
      : "-";

  return {
    parameters: [
      {
        label: String(labels.targetPower ?? ""),
        value: `${formatExportValue(payload?.targetPower)}w`,
      },
      {
        label: String(labels.minBatteryPercent ?? ""),
        value: `${formatExportValue(params.minBatteryPercent)}%`,
      },
      {
        label: String(labels.maxWaste ?? ""),
        value: formatExportValue(params.maxWaste),
      },
      {
        label: String(labels.maxBranches ?? ""),
        value: formatExportValue(params.maxBranches),
      },
      {
        label: String(labels.branchPhaseOffset ?? ""),
        value: branchPhaseOffsetValues,
      },
      { label: String(labels.excludeBelt ?? ""), value: excludeBeltValue },
      {
        label: String(labels.primaryFuel),
        value: resolveMappedValue(
          params.primaryFuelId,
          labels.primaryFuelNameMap as Record<string, string> | null,
        ),
      },
      {
        label: String(labels.secondaryFuel),
        value: resolveMappedValue(
          params.secondaryFuelId,
          labels.secondaryFuelNameMap as Record<string, string> | null,
        ),
      },
      {
        label: String(labels.inputSource),
        value: resolveMappedValue(
          params.inputSourceId,
          labels.inputSourceNameMap as Record<string, string> | null,
        ),
      },
    ],
    summary: [
      {
        label: String(labels.actualPower ?? ""),
        value: `${formatExportValue(summary.avgPower)}w`,
      },
      {
        label: String(labels.cyclePeriod ?? ""),
        value: `${formatExportValue(summary.period)}s`,
      },
      {
        label: String(labels.variance ?? ""),
        value: formatExportValue(summary.variance),
      },
      {
        label: String(labels.minBattery ?? ""),
        value: `${formatExportValue(summary.minBattery)} (${formatExportValue(summary.minBatteryPercent)}%)`,
      },
      {
        label: String(labels.branchCount ?? ""),
        value: formatExportValue(summary.branchCount),
      },
      {
        label: String(labels.totalSplitters ?? ""),
        value: formatExportValue(summary.totalSplitters),
      },
    ],
  };
}

async function buildShareQrCodeImage(
  shareUrl: string,
  options: Record<string, unknown> = {},
): Promise<HTMLImageElement | null> {
  const value = typeof shareUrl === "string" ? shareUrl.trim() : "";
  if (!value) return null;
  if (typeof document === "undefined") return null;

  const mountNode = document.createElement("div");
  const size = Number.isFinite(options.size)
    ? Math.max(96, Math.round(options.size as number))
    : 240;
  mountNode.style.position = "fixed";
  mountNode.style.left = "-10000px";
  mountNode.style.top = "-10000px";
  mountNode.style.width = `${size}px`;
  mountNode.style.height = `${size}px`;
  mountNode.style.opacity = "0";
  mountNode.style.pointerEvents = "none";

  const host = document.body || document.documentElement;
  if (!host) return null;
  host.appendChild(mountNode);

  const root = createRoot(mountNode);
  const waitForPaint = () =>
    new Promise<void>((resolve) => {
      if (
        typeof window !== "undefined" &&
        typeof window.requestAnimationFrame === "function"
      ) {
        window.requestAnimationFrame(() => resolve());
        return;
      }
      setTimeout(resolve, 0);
    });

  try {
    root.render(
      createElement(QRCodeCanvas, {
        value,
        size,
        level: "L",
        bgColor: "#f2d378",
        fgColor: "#0d1218",
        marginSize: 1,
      }),
    );
    await waitForPaint();
    await waitForPaint();

    const qrCanvas = mountNode.querySelector("canvas");
    if (!qrCanvas || qrCanvas.tagName !== "CANVAS") {
      return null;
    }

    const blob = await canvasToBlob(qrCanvas, "image/png");
    return blobToImage(blob);
  } catch (error) {
    console.warn("Share QR render failed:", error);
    return null;
  } finally {
    root.unmount();
    mountNode.remove();
  }
}

export interface CompleteExportImageOptions {
  params?: CalcParams;
  solution?: SolutionResult;
  targetPower?: number;
  completeLabels?: Record<string, unknown>;
  shareUrl?: string;
  websiteUrl?: string;
  chartLabels?: Record<string, string>;
  batteryCapacity?: number;
  fontFamily?: string;
  canvasWidth?: number;
  chartWidth?: number;
  chartHeight?: number;
  [key: string]: unknown;
}

export async function buildCompleteExportImageBlob(
  branches: BranchBlueprint[],
  options: CompleteExportImageOptions = {},
): Promise<Blob> {
  const items = Array.isArray(branches) ? branches.filter(Boolean) : [];
  if (items.length === 0) {
    throw new Error("No branch blueprint data provided.");
  }

  const labels = getCompleteExportLabels(options.completeLabels ?? {});
  const targetPower = getExportTargetPower(options.solution ?? undefined, {
    targetPower: options.targetPower,
  });
  const includePreciseChart = Boolean(options.solution);
  const payload = buildExportParamsPayload({
    params: options.params,
    solution: options.solution,
    branches: items,
    includePng: true,
    includePreciseChart,
    targetPower,
  });
  const infoSections = buildCompleteInfoSections(payload, labels);
  const solutionSummary = (payload.solutionSummary || {}) as Record<
    string,
    unknown
  >;

  const fontFamily = getCanvasFontFamily(options);
  await ensureCanvasFontReady(fontFamily);

  const canvasWidth =
    typeof options.canvasWidth === "number" &&
    Number.isFinite(options.canvasWidth)
      ? Math.max(1200, Math.round(options.canvasWidth))
      : COMPLETE_EXPORT_IMAGE_STYLE.width;
  const { padding, sectionGap, cardPadding, branchGap } =
    COMPLETE_EXPORT_IMAGE_STYLE;
  const contentWidth = canvasWidth - padding * 2;
  const panelTitleHeight = 30;
  const chartTargetWidth =
    typeof options.chartWidth === "number" &&
    Number.isFinite(options.chartWidth)
      ? Math.max(800, Math.round(options.chartWidth))
      : Math.max(800, Math.round(contentWidth - cardPadding * 2));
  const chartTargetHeight =
    typeof options.chartHeight === "number" &&
    Number.isFinite(options.chartHeight)
      ? Math.max(450, Math.round(options.chartHeight))
      : Math.max(450, Math.round(chartTargetWidth * 0.38));

  const chartBlob =
    includePreciseChart && options.solution
      ? await buildPreciseChartPngBlob(options.solution, {
          targetPower,
          batteryCapacity: options.batteryCapacity,
          minBatteryThreshold: options.params?.minBatteryPercent,
          chartLabels: options.chartLabels,
          fontFamily,
          chartWidth: chartTargetWidth,
          chartHeight: chartTargetHeight,
          poolSegments: buildPoolSegments(options.params),
        })
      : null;
  const chartImage = chartBlob ? await blobToImage(chartBlob) : null;
  const shareQrImage = await buildShareQrCodeImage(options.shareUrl ?? "");
  const titleBlockHeight = shareQrImage ? 132 : 98;

  const branchImages: {
    image: HTMLImageElement;
    branch: BranchBlueprint;
    index: number;
  }[] = [];
  for (let index = 0; index < items.length; index += 1) {
    const branch = items[index];
    const branchBlob = await buildBranchPngBlob(branch, {
      ...options,
      fontFamily,
      branchLabel: `${labels.branch} ${index + 1}`,
    });
    const branchImage = await blobToImage(branchBlob);
    branchImages.push({ image: branchImage, branch, index });
  }

  const measureCanvas = document.createElement("canvas");
  const measureContext = measureCanvas.getContext("2d");
  if (!measureContext) {
    throw new Error("Canvas 2D context is unavailable.");
  }
  measureContext.font = `500 18px ${fontFamily}`;
  const infoColumns = 2;
  const infoColumnGap = 16;
  const infoTextMaxWidth =
    (contentWidth - cardPadding * 2 - infoColumnGap) / infoColumns;
  const infoLineHeight = 24;
  const parameterLines = infoSections.parameters.flatMap((entry) =>
    wrapTextLines(
      measureContext,
      `${entry.label}: ${entry.value}`,
      infoTextMaxWidth - 8,
    ),
  );
  const summaryLines = infoSections.summary.flatMap((entry) =>
    wrapTextLines(
      measureContext,
      `${entry.label}: ${entry.value}`,
      infoTextMaxWidth - 8,
    ),
  );
  const infoBodyLines = Math.max(parameterLines.length, summaryLines.length);
  const infoPanelHeight =
    cardPadding * 2 + panelTitleHeight + infoBodyLines * infoLineHeight + 10;

  let chartDrawWidth = 0;
  let chartDrawHeight = 0;
  let chartPanelHeight = 0;
  if (chartImage) {
    const chartScale = Math.min(
      1,
      (contentWidth - cardPadding * 2) / chartImage.width,
    );
    chartDrawWidth = chartImage.width * chartScale;
    chartDrawHeight = chartImage.height * chartScale;
    chartPanelHeight = cardPadding * 2 + panelTitleHeight + chartDrawHeight;
  }

  const branchColumns = Math.max(1, Math.min(3, branchImages.length));
  const innerWidth = contentWidth - cardPadding * 2;
  const branchCardGapY = 16;
  const branchRows: (typeof branchImages)[] = [];
  let row: typeof branchImages = [];
  for (const branchItem of branchImages) {
    row.push(branchItem);
    if (row.length === branchColumns) {
      branchRows.push(row);
      row = [];
    }
  }
  if (row.length > 0) {
    branchRows.push(row);
  }

  const branchRowLayouts = branchRows.map((currentRow) => {
    const totalRowWidth = currentRow.reduce(
      (sum, { image }) => sum + image.width,
      0,
    );
    const rowGapTotal = Math.max(0, currentRow.length - 1) * branchGap;
    const availableWidth = innerWidth - rowGapTotal;
    const cellWidths = currentRow.map(
      ({ image }) => (availableWidth * image.width) / totalRowWidth,
    );
    return { cellWidths };
  });

  const labelAreaHeight = 30;
  const imageTopPadding = 12;
  const imageBottomPadding = 12;
  const branchRowHeights = branchRows.map((currentRow, rowIndex) => {
    const { cellWidths } = branchRowLayouts[rowIndex];
    let maxHeight = 0;
    currentRow.forEach(({ image }, colIndex) => {
      const cellWidth = cellWidths[colIndex];
      const drawScale = Math.min(1, cellWidth / image.width);
      const drawHeight = image.height * drawScale;
      const cardHeight =
        labelAreaHeight + imageTopPadding + drawHeight + imageBottomPadding;
      maxHeight = Math.max(maxHeight, cardHeight);
    });
    return maxHeight;
  });

  const branchesPanelHeight =
    cardPadding * 2 +
    panelTitleHeight +
    branchRowHeights.reduce((sum, h) => sum + h, 0) +
    Math.max(0, branchRowHeights.length - 1) * branchCardGapY;

  const footnoteText =
    typeof labels.footnote === "string" ? labels.footnote.trim() : "";
  const websiteText =
    typeof options.websiteUrl === "string" && options.websiteUrl.trim()
      ? options.websiteUrl.trim()
      : DEFAULT_COMPLETE_EXPORT_WEBSITE;
  const footnoteFontSize = 18;
  const footerSectionGap = 6;
  measureContext.font = `500 ${footnoteFontSize}px ${fontFamily}`;
  const footerSourceTexts = [footnoteText, websiteText].filter(
    (text): text is string => Boolean(text),
  );
  const footerSections = footerSourceTexts.map((text) =>
    wrapTextLines(measureContext, text, contentWidth - 32),
  );
  measureContext.font = `500 18px ${fontFamily}`;
  const footnoteLineHeight = footnoteFontSize + 1;
  const footerHeight =
    footerSections.reduce(
      (sum, lines) => sum + lines.length * footnoteLineHeight,
      0,
    ) +
    Math.max(0, footerSections.length - 1) * footerSectionGap;
  const footnoteGap = footerSections.length > 0 ? 12 : 0;

  let canvasHeight = padding + titleBlockHeight + sectionGap + infoPanelHeight;
  if (chartPanelHeight > 0) {
    canvasHeight += sectionGap + chartPanelHeight;
  }
  canvasHeight += sectionGap + branchesPanelHeight;
  const footnoteBottomPadding = footerSections.length > 0 ? 12 : padding;
  if (footerSections.length > 0) {
    canvasHeight += footnoteGap + footerHeight;
  }
  canvasHeight += footnoteBottomPadding;
  canvasHeight = Math.ceil(canvasHeight);

  const canvas = document.createElement("canvas");
  canvas.width = canvasWidth;
  canvas.height = canvasHeight;
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Canvas 2D context is unavailable.");
  }

  context.fillStyle = COMPLETE_EXPORT_IMAGE_STYLE.background;
  context.fillRect(0, 0, canvasWidth, canvasHeight);

  let cursorY = padding;
  const qrSize = shareQrImage
    ? Math.min(148, Math.max(120, titleBlockHeight - 8))
    : 0;
  const titleTextMaxWidth = shareQrImage
    ? Math.max(280, contentWidth - qrSize - 16)
    : contentWidth;
  const titleY = shareQrImage ? cursorY + 8 : cursorY;
  const summaryY = shareQrImage ? cursorY + 62 : cursorY + 46;
  const exportTimeY = shareQrImage ? cursorY + 90 : cursorY + 70;

  context.fillStyle = COMPLETE_EXPORT_IMAGE_STYLE.titleColor;
  context.font = `700 36px ${fontFamily}`;
  context.textAlign = "left";
  context.textBaseline = "top";
  context.fillText(
    String(labels.title ?? ""),
    padding,
    titleY,
    titleTextMaxWidth,
  );

  context.fillStyle = COMPLETE_EXPORT_IMAGE_STYLE.subtitleColor;
  context.font = `500 18px ${fontFamily}`;
  const exportTime = `${labels.exportTime}: ${payload.exportedAt}`;
  const summaryText = `${labels.branchCount}: ${formatExportValue(solutionSummary.branchCount, String(items.length))} | ${labels.actualPower}: ${formatExportValue(solutionSummary.avgPower)}w`;
  const summaryLine =
    wrapTextLines(context, summaryText, titleTextMaxWidth)[0] || summaryText;
  const exportTimeLine =
    wrapTextLines(context, exportTime, titleTextMaxWidth)[0] || exportTime;
  context.fillText(summaryLine, padding, summaryY, titleTextMaxWidth);
  context.fillText(exportTimeLine, padding, exportTimeY, titleTextMaxWidth);

  if (shareQrImage && qrSize > 0) {
    const qrX = padding + contentWidth - qrSize;
    const qrY = cursorY + (titleBlockHeight - qrSize) / 2;
    context.drawImage(shareQrImage, qrX, qrY, qrSize, qrSize);
  }
  cursorY += titleBlockHeight + sectionGap;

  drawPanel(context, padding, cursorY, contentWidth, infoPanelHeight);
  context.fillStyle = COMPLETE_EXPORT_IMAGE_STYLE.titleColor;
  context.font = `700 22px ${fontFamily}`;
  const leftX = padding + cardPadding;
  const rightX = leftX + infoTextMaxWidth + infoColumnGap;
  context.fillText(
    String(labels.parameters ?? ""),
    leftX,
    cursorY + cardPadding,
  );
  context.fillText(String(labels.summary ?? ""), rightX, cursorY + cardPadding);

  context.fillStyle = COMPLETE_EXPORT_IMAGE_STYLE.textColor;
  context.font = `500 18px ${fontFamily}`;
  let leftY = cursorY + cardPadding + panelTitleHeight;
  parameterLines.forEach((line) => {
    context.fillText(line, leftX, leftY);
    leftY += infoLineHeight;
  });
  let rightY = cursorY + cardPadding + panelTitleHeight;
  summaryLines.forEach((line) => {
    context.fillText(line, rightX, rightY);
    rightY += infoLineHeight;
  });
  cursorY += infoPanelHeight;

  if (chartImage && chartPanelHeight > 0) {
    cursorY += sectionGap;
    drawPanel(context, padding, cursorY, contentWidth, chartPanelHeight);
    context.fillStyle = COMPLETE_EXPORT_IMAGE_STYLE.titleColor;
    context.font = `700 22px ${fontFamily}`;
    context.fillText(
      String(labels.chart ?? ""),
      padding + cardPadding,
      cursorY + cardPadding,
    );
    const imageX = padding + (contentWidth - chartDrawWidth) / 2;
    const imageY = cursorY + cardPadding + panelTitleHeight;
    context.drawImage(
      chartImage,
      imageX,
      imageY,
      chartDrawWidth,
      chartDrawHeight,
    );
    cursorY += chartPanelHeight;
  }

  cursorY += sectionGap;
  drawPanel(context, padding, cursorY, contentWidth, branchesPanelHeight);
  context.fillStyle = COMPLETE_EXPORT_IMAGE_STYLE.titleColor;
  context.font = `700 22px ${fontFamily}`;
  context.fillText(
    String(labels.branches ?? ""),
    padding + cardPadding,
    cursorY + cardPadding,
  );

  let rowY = cursorY + cardPadding + panelTitleHeight;
  branchRows.forEach((currentRow, rowIndex) => {
    const rowHeight = branchRowHeights[rowIndex];
    const { cellWidths } = branchRowLayouts[rowIndex];
    let cardX = padding + cardPadding;
    currentRow.forEach((item, colIndex) => {
      const cellWidth = cellWidths[colIndex];
      const cardY = rowY;
      const { image, branch, index } = item;
      const scale = Math.min(1, cellWidth / image.width);
      const drawWidth = image.width * scale;
      const drawHeight = image.height * scale;

      context.fillStyle = "rgba(12, 18, 26, 0.95)";
      context.fillRect(cardX, cardY, cellWidth, rowHeight);
      context.strokeStyle = "rgba(141, 149, 162, 0.55)";
      context.lineWidth = 1;
      context.strokeRect(
        cardX + 0.5,
        cardY + 0.5,
        cellWidth - 1,
        rowHeight - 1,
      );

      context.fillStyle = COMPLETE_EXPORT_IMAGE_STYLE.dimTextColor;
      context.font = `600 15px ${fontFamily}`;
      const labelText = `${labels.branch} ${index + 1} | 1/${getBranchDenominatorToken(branch)} | ${getBranchPowerToken(branch)}`;
      const labelLines = wrapTextLines(context, labelText, cellWidth - 16);
      const firstLine = labelLines[0] || labelText;
      context.fillText(firstLine, cardX + 8, cardY + 6);

      const imageAreaHeight =
        rowHeight - labelAreaHeight - imageTopPadding - imageBottomPadding;
      const imageY =
        cardY +
        labelAreaHeight +
        imageTopPadding +
        (imageAreaHeight - drawHeight) / 2;
      context.drawImage(
        image,
        cardX + (cellWidth - drawWidth) / 2,
        imageY,
        drawWidth,
        drawHeight,
      );
      cardX += cellWidth + branchGap;
    });
    rowY += rowHeight + branchCardGapY;
  });
  cursorY += branchesPanelHeight;

  if (footerSections.length > 0) {
    cursorY += footnoteGap;
    context.save();
    context.fillStyle = COMPLETE_EXPORT_IMAGE_STYLE.dimTextColor;
    context.font = `500 ${footnoteFontSize}px ${fontFamily}`;
    context.textAlign = "center";
    context.textBaseline = "top";
    const centerX = padding + contentWidth / 2;
    let lineY = cursorY;
    footerSections.forEach((sectionLines, sectionIndex) => {
      sectionLines.forEach((line) => {
        context.fillText(line, centerX, lineY);
        lineY += footnoteLineHeight;
      });
      if (sectionIndex < footerSections.length - 1) {
        lineY += footerSectionGap;
      }
    });
    context.restore();
  }

  return canvasToBlob(canvas, "image/png");
}
