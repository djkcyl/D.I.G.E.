/**
 * 分支 PNG 绘制
 */

import type { BranchBlueprint } from "./blueprintCore";
import {
  assertValidBranchBlueprint,
  getBlueprintHeight,
  getBlueprintWidth,
  getBranchDenominatorToken,
  getBranchPowerToken,
} from "./blueprintCore";
import {
  BRANCH_PNG_STYLE,
  canvasToBlob,
  drawBlueprintCell,
  ensureCanvasFontReady,
  getCanvasFontFamily,
  preloadBlueprintImages,
} from "./drawUtils";

export async function buildBranchPngBlob(
  branch: BranchBlueprint,
  options: Record<string, unknown> = {},
): Promise<Blob> {
  assertValidBranchBlueprint(branch);
  const blueprint = branch.blueprint;
  const rows = getBlueprintHeight(blueprint);
  const cols = getBlueprintWidth(blueprint);

  const cellSize =
    Number.isFinite(options.cellSize) &&
    (options.cellSize as number) >= 24 &&
    (options.cellSize as number) <= 96
      ? Math.round(options.cellSize as number)
      : BRANCH_PNG_STYLE.cellSize;

  const { outerPadding, headerHeight, headerGap, gridPadding } =
    BRANCH_PNG_STYLE;
  const fontFamily = getCanvasFontFamily(options as { fontFamily?: string });
  await ensureCanvasFontReady(fontFamily);

  const gridWidth = cols * cellSize;
  const gridHeight = rows * cellSize;
  const frameX = outerPadding;
  const frameY = outerPadding + headerHeight + headerGap;
  const frameWidth = gridWidth + gridPadding * 2;
  const frameHeight = gridHeight + gridPadding * 2;
  const canvasWidth = frameX * 2 + frameWidth;
  const canvasHeight =
    outerPadding + headerHeight + headerGap + frameHeight + outerPadding;

  const resolvedPixelRatio = Number.isFinite(options.pixelRatio)
    ? Number(options.pixelRatio)
    : BRANCH_PNG_STYLE.exportPixelRatio;
  const pixelRatio = Math.max(1, Math.min(4, resolvedPixelRatio));

  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(canvasWidth * pixelRatio));
  canvas.height = Math.max(1, Math.round(canvasHeight * pixelRatio));

  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Canvas 2D context is unavailable.");
  }

  context.scale(pixelRatio, pixelRatio);
  context.imageSmoothingEnabled = true;
  context.fillStyle = "#0d1218";
  context.fillRect(0, 0, canvasWidth, canvasHeight);

  const branchLabel =
    typeof options.branchLabel === "string" && options.branchLabel.trim()
      ? `${(options.branchLabel as string).trim()} `
      : "";
  const headerText = `${branchLabel}1/${getBranchDenominatorToken(branch)} | ${getBranchPowerToken(branch)}`;
  context.fillStyle = "#f2d378";
  context.font = `700 13px ${fontFamily}`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(
    headerText,
    canvasWidth / 2,
    outerPadding + headerHeight / 2,
  );

  context.fillStyle = "rgba(20, 26, 34, 0.95)";
  context.fillRect(frameX, frameY, frameWidth, frameHeight);
  context.strokeStyle = "rgba(141, 149, 162, 0.8)";
  context.lineWidth = 1;
  context.strokeRect(
    frameX + 0.5,
    frameY + 0.5,
    frameWidth - 1,
    frameHeight - 1,
  );

  const images = await preloadBlueprintImages(blueprint);
  const cellOriginX = frameX + gridPadding;
  const cellOriginY = frameY + gridPadding;

  for (let rowIndex = 0; rowIndex < rows; rowIndex += 1) {
    const row = blueprint[rowIndex];
    for (let colIndex = 0; colIndex < cols; colIndex += 1) {
      const part = row[colIndex] as Record<string, unknown> | null;
      const x = cellOriginX + colIndex * cellSize;
      const y = cellOriginY + rowIndex * cellSize;
      drawBlueprintCell(context, part, x, y, cellSize, fontFamily, images);
    }
  }

  return canvasToBlob(canvas, "image/png");
}
