/**
 * 蓝图导出：下载、ZIP 打包、完整图
 */
import { strToU8, zipSync } from "fflate";
import type { CalcParams, SolutionResult } from "../../types/calc";
import { buildPoolSegments } from "../poolChartSegments";
import type {
  BranchBlueprint,
  BuildExportParamsPayloadOptions,
} from "./blueprintCore";
import {
  buildEndfieldBlueprint,
  buildExportParamsPayload,
  getBranchDenominatorToken,
  getBranchPowerToken,
  getExportTargetPower,
  getIndexedBranchStem,
} from "./blueprintCore";
import { buildBranchPngBlob } from "./drawBranchPng";
import { buildCompleteExportImageBlob } from "./drawCompleteExport";
import { buildPreciseChartPngBlob } from "./drawPreciseChart";

function getDefaultFileName(
  branch: BranchBlueprint | null | undefined,
): string {
  const stem = `dige_branch_1_${branch ? getBranchDenominatorToken(branch) : "unknown"}_${branch ? getBranchPowerToken(branch) : "unknownw"}`;
  return `${stem}_blueprint.json`;
}

function getDefaultPngFileName(
  branch: BranchBlueprint | null | undefined,
): string {
  const stem = `dige_branch_1_${branch ? getBranchDenominatorToken(branch) : "unknown"}_${branch ? getBranchPowerToken(branch) : "unknownw"}`;
  return `${stem}.png`;
}

function getDefaultZipFileName(branches: BranchBlueprint[]): string {
  const count = Array.isArray(branches) ? branches.length : 0;
  const totalPower = Array.isArray(branches)
    ? branches.reduce((sum, branch) => {
        const power = Number(branch?.power);
        return sum + (Number.isFinite(power) ? power : 0);
      }, 0)
    : 0;
  const powerToken = `${Math.round(totalPower)}w`;

  if (count > 0) {
    return `dige_branches_all_${count}_${powerToken}.zip`;
  }
  return "dige_branches_all.zip";
}

function getDefaultCompleteImageFileName(branches: BranchBlueprint[]): string {
  const count = Array.isArray(branches) ? branches.length : 0;
  const totalPower = Array.isArray(branches)
    ? branches.reduce((sum, branch) => {
        const power = Number(branch?.power);
        return sum + (Number.isFinite(power) ? power : 0);
      }, 0)
    : 0;
  const powerToken = `${Math.round(totalPower)}w`;
  return `dige_export_full_${count}_${powerToken}.png`;
}

function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  try {
    anchor.click();
  } finally {
    anchor.remove();
    URL.revokeObjectURL(url);
  }
}

async function blobToU8(blob: Blob): Promise<Uint8Array> {
  const buffer = await blob.arrayBuffer();
  return new Uint8Array(buffer);
}

export interface BlueprintExportOptions {
  filename?: string;
  name?: string;
  desc?: string;
  bpIcon?: Record<string, unknown>;
  meta?: Record<string, unknown>;
  bpParam?: Record<string, unknown>;
  bpTags?: string[];
  branchLabel?: string;
  cellSize?: number;
  pixelRatio?: number;
  fontFamily?: string;
  params?: CalcParams;
  solution?: SolutionResult;
  targetPower?: number;
  batteryCapacity?: number;
  chartLabels?: Record<string, string>;
  chartWidth?: number;
  chartHeight?: number;
  completeLabels?: Record<string, unknown>;
  includePng?: boolean;
  includeParams?: boolean;
  includePreciseChart?: boolean;
  [key: string]: unknown;
}

export function downloadEndfieldBlueprint(
  branch: BranchBlueprint,
  options: BlueprintExportOptions = {},
): Record<string, unknown> {
  const output = buildEndfieldBlueprint(branch, options);
  const fileName =
    typeof options.filename === "string" && options.filename.trim()
      ? options.filename.trim()
      : getDefaultFileName(branch);

  const json = JSON.stringify(output, null, 4);
  const blob = new Blob([json], { type: "application/json" });
  downloadBlob(blob, fileName);
  return output;
}

export async function downloadEndfieldBlueprintZip(
  branches: BranchBlueprint[],
  options: BlueprintExportOptions = {},
): Promise<Record<string, unknown>[]> {
  const items = Array.isArray(branches) ? branches.filter(Boolean) : [];
  if (items.length === 0) {
    throw new Error("No branch blueprint data provided.");
  }

  const includePng = options.includePng !== false;
  const includeParams = options.includeParams !== false;
  const includePreciseChart =
    options.includePreciseChart !== false && Boolean(options.solution);
  const targetPower = getExportTargetPower(options.solution ?? undefined, {
    targetPower: options.targetPower,
  });
  const files: Record<string, Uint8Array> = {};
  const outputs: Record<string, unknown>[] = [];

  for (let index = 0; index < items.length; index += 1) {
    const branch = items[index];
    const output = buildEndfieldBlueprint(branch, options);
    outputs.push(output);
    const stem = getIndexedBranchStem(branch, index);
    files[`${stem}_blueprint.json`] = strToU8(JSON.stringify(output, null, 4));

    if (includePng) {
      const pngBlob = await buildBranchPngBlob(branch, {
        ...options,
        branchLabel: `Branch ${index + 1}`,
      });
      files[`${stem}.png`] = await blobToU8(pngBlob);
    }
  }

  if (includeParams) {
    const paramsPayload = buildExportParamsPayload({
      params: options.params,
      solution: options.solution,
      branches: items,
      includePng,
      includePreciseChart,
      targetPower,
    } as BuildExportParamsPayloadOptions);
    files["export_params.json"] = strToU8(
      JSON.stringify(paramsPayload, null, 2),
    );
  }

  if (includePreciseChart && options.solution) {
    const preciseChartBlob = await buildPreciseChartPngBlob(options.solution, {
      targetPower,
      batteryCapacity: options.batteryCapacity,
      minBatteryThreshold: options.params?.minBatteryPercent,
      chartLabels: options.chartLabels,
      fontFamily: options.fontFamily,
      chartWidth: options.chartWidth,
      chartHeight: options.chartHeight,
      poolSegments: buildPoolSegments(options.params),
    });
    files["chart_precise.png"] = await blobToU8(preciseChartBlob);
  }

  const zipBytes = zipSync(files, { level: 6 });
  const fileName =
    typeof options.filename === "string" && options.filename.trim()
      ? options.filename.trim()
      : getDefaultZipFileName(items);

  const blob = new Blob([zipBytes as BlobPart], { type: "application/zip" });
  downloadBlob(blob, fileName);
  return outputs;
}

export async function buildEndfieldBlueprintPng(
  branch: BranchBlueprint,
  options: BlueprintExportOptions = {},
): Promise<{ fileName: string; blob: Blob }> {
  const fileName =
    typeof options.filename === "string" && options.filename.trim()
      ? options.filename.trim()
      : getDefaultPngFileName(branch);
  const blob = await buildBranchPngBlob(branch, options);
  return { fileName, blob };
}

export async function downloadEndfieldBlueprintPng(
  branch: BranchBlueprint,
  options: BlueprintExportOptions = {},
): Promise<Blob> {
  const { fileName, blob } = await buildEndfieldBlueprintPng(branch, options);
  downloadBlob(blob, fileName);
  return blob;
}

export async function buildEndfieldCompleteImage(
  branches: BranchBlueprint[],
  options: BlueprintExportOptions & { shareUrl?: string } = {},
): Promise<{ fileName: string; blob: Blob }> {
  const items = Array.isArray(branches) ? branches.filter(Boolean) : [];
  if (items.length === 0) {
    throw new Error("No branch blueprint data provided.");
  }

  const fileName =
    typeof options.filename === "string" && options.filename.trim()
      ? options.filename.trim()
      : getDefaultCompleteImageFileName(items);
  const blob = await buildCompleteExportImageBlob(items, options);
  return { fileName, blob };
}
