/**
 * 蓝图核心：JSON 结构构建、节点解析
 */

import type { CalcParams, SolutionResult } from "../../types/calc";
import { PARAM_LIMITS } from "../constants";

const DEFAULT_BLUEPRINT_ICON = Object.freeze({
  icon: "blueprint_default_icon",
  baseColor: 101,
});

const DEFAULT_BLUEPRINT_PARAM = Object.freeze({
  sourceType: 2,
  myBpUid: 0,
  hasMyBpUid: false,
  sysBpKey: "",
  hasSysBpKey: false,
  giftBpKey: {
    bpUid: 4,
    targetRoleId: 1000041441,
    shareIdx: 1,
  },
  presetBpKey: "",
  hasPresetBpKey: false,
  opPayloadCase: 13,
});

const DEFAULT_META = Object.freeze({
  creatorRoleId: 1000041441,
  creatorUserId: "0000000000",
  reviewStatus: 2,
  useCount: 0,
  isNew: false,
  fetchTime: 0,
});

const BELT_TEMPLATE_ID = "grid_belt_01";

interface BlueprintGiftBpKey {
  bpUid: number;
  targetRoleId: number;
  shareIdx: number;
}

interface BlueprintParam {
  sourceType: number;
  myBpUid: number;
  hasMyBpUid: boolean;
  sysBpKey: string;
  hasSysBpKey: boolean;
  giftBpKey: BlueprintGiftBpKey;
  presetBpKey: string;
  hasPresetBpKey: boolean;
  opPayloadCase: number;
  [key: string]: unknown;
}

interface BlueprintParts {
  splitters: number[];
  topConvergers: number[];
  bottomConvergers: number[];
  topLaneConvergers: number[];
  bottomLaneConvergers: number[];
  topBelts: number[];
  bottomBelts: number[];
  thermalCol: number | null;
  topTurnCol: number | null;
  bottomTurnCol: number | null;
  hasInputSource: boolean;
  hasTopRecycleSource: boolean;
  hasBottomRecycleSource: boolean;
}

function vec3(
  x: number,
  y: number,
  z: number,
): { x: number; y: number; z: number } {
  return { x, y, z };
}

function cloneBpParam(
  param: Partial<BlueprintParam> = DEFAULT_BLUEPRINT_PARAM as BlueprintParam,
): BlueprintParam {
  const giftBpKey = (param.giftBpKey ?? {}) as Partial<BlueprintGiftBpKey>;

  return {
    sourceType: param.sourceType ?? DEFAULT_BLUEPRINT_PARAM.sourceType,
    myBpUid: param.myBpUid ?? DEFAULT_BLUEPRINT_PARAM.myBpUid,
    hasMyBpUid: param.hasMyBpUid ?? DEFAULT_BLUEPRINT_PARAM.hasMyBpUid,
    sysBpKey: param.sysBpKey ?? DEFAULT_BLUEPRINT_PARAM.sysBpKey,
    hasSysBpKey: param.hasSysBpKey ?? DEFAULT_BLUEPRINT_PARAM.hasSysBpKey,
    giftBpKey: {
      bpUid: giftBpKey.bpUid ?? DEFAULT_BLUEPRINT_PARAM.giftBpKey.bpUid,
      targetRoleId:
        giftBpKey.targetRoleId ??
        DEFAULT_BLUEPRINT_PARAM.giftBpKey.targetRoleId,
      shareIdx:
        giftBpKey.shareIdx ?? DEFAULT_BLUEPRINT_PARAM.giftBpKey.shareIdx,
    },
    presetBpKey: param.presetBpKey ?? DEFAULT_BLUEPRINT_PARAM.presetBpKey,
    hasPresetBpKey:
      param.hasPresetBpKey ?? DEFAULT_BLUEPRINT_PARAM.hasPresetBpKey,
    opPayloadCase: param.opPayloadCase ?? DEFAULT_BLUEPRINT_PARAM.opPayloadCase,
  };
}

function createStructureNode(
  nodeId: number,
  templateId: string,
  x: number,
  z: number,
  rotationY: number,
): Record<string, unknown> {
  const interactivePosition =
    templateId === "power_station_1"
      ? vec3(x, 0, z + 1)
      : vec3(x + 0.5, 0, z + 0.5);

  return {
    templateId,
    productIcon: "",
    nodeId,
    transform: {
      position: vec3(x, 0, z),
      direction: vec3(0, rotationY, 0),
      interactiveParam: {
        position: interactivePosition,
        rotation: vec3(0, rotationY, 0),
        properties: {},
      },
      directionIn: null,
      directionOut: null,
      points: [],
    },
    coms: [],
  };
}

function createBeltNode(
  nodeId: number,
  directionInY: number,
  directionOutY: number,
  points: { x: number; z: number }[],
): Record<string, unknown> {
  const normalizedPoints =
    points.length === 1 ? [points[0], points[0]] : points;
  return {
    templateId: BELT_TEMPLATE_ID,
    productIcon: "",
    nodeId,
    transform: {
      position: null,
      direction: null,
      interactiveParam: null,
      directionIn: vec3(0, directionInY, 0),
      directionOut: vec3(0, directionOutY, 0),
      points: normalizedPoints.map(({ x, z }) => vec3(x, 0, z)),
    },
    coms: [],
  };
}

export function getBlueprintHeight(blueprint: unknown[][] | unknown): number {
  return Array.isArray(blueprint) ? blueprint.length : 0;
}

export function getBlueprintWidth(blueprint: unknown[][] | unknown): number {
  if (
    !Array.isArray(blueprint) ||
    blueprint.length === 0 ||
    !Array.isArray(blueprint[0])
  ) {
    return 0;
  }
  return blueprint[0].length;
}

function toGameZ(row: number, height: number): number {
  return height - 1 - row;
}

export interface BranchBlueprint {
  blueprint?: (Record<string, unknown> | null)[][];
  denominator?: number;
  power?: number;
  phaseOffsetCells?: number;
}

export type ValidBranchBlueprint = BranchBlueprint & {
  blueprint: (Record<string, unknown> | null)[][];
};

export function assertValidBranchBlueprint(
  branch: BranchBlueprint | null | undefined,
): asserts branch is ValidBranchBlueprint {
  const blueprint = branch?.blueprint;
  if (
    !Array.isArray(blueprint) ||
    blueprint.length === 0 ||
    !Array.isArray(blueprint[0])
  ) {
    throw new Error("Invalid branch blueprint data.");
  }
}

function collectBlueprintParts(
  blueprint: (Record<string, unknown> | null)[][],
): BlueprintParts {
  const parts: BlueprintParts = {
    splitters: [],
    topConvergers: [],
    bottomConvergers: [],
    topLaneConvergers: [],
    bottomLaneConvergers: [],
    topBelts: [],
    bottomBelts: [],
    thermalCol: null,
    topTurnCol: null,
    bottomTurnCol: null,
    hasInputSource: false,
    hasTopRecycleSource: false,
    hasBottomRecycleSource: false,
  };

  const height = getBlueprintHeight(blueprint);
  const middleRow = Math.floor(height / 2);
  const topBeltRow = middleRow - 1;
  const bottomBeltRow = middleRow + 1;

  for (let row = 0; row < blueprint.length; row += 1) {
    const cells = blueprint[row];
    for (let col = 0; col < cells.length; col += 1) {
      const part = cells[col] as Record<string, unknown> | null;
      if (!part?.partId) continue;

      switch (part.partId) {
        case "splitter":
          if (row === middleRow) parts.splitters.push(col);
          break;
        case "converger":
          if (row === 0) parts.topConvergers.push(col);
          if (row === height - 1) parts.bottomConvergers.push(col);
          if (row === topBeltRow) parts.topLaneConvergers.push(col);
          if (row === bottomBeltRow) parts.bottomLaneConvergers.push(col);
          break;
        case "belt":
          if (row === topBeltRow) parts.topBelts.push(col);
          if (row === bottomBeltRow) parts.bottomBelts.push(col);
          break;
        case "left_turn_belt":
          if (row === 0) parts.topTurnCol = col;
          break;
        case "right_turn_belt":
          if (row === height - 1) parts.bottomTurnCol = col;
          break;
        case "thermal_bank":
          if (row === middleRow) parts.thermalCol = col;
          break;
        case "input_source":
          if (row === middleRow) parts.hasInputSource = true;
          break;
        case "recycle_source":
          if (row === 0) parts.hasTopRecycleSource = true;
          if (row === height - 1) parts.hasBottomRecycleSource = true;
          break;
        default:
          break;
      }
    }
  }

  parts.splitters.sort((a: number, b: number) => a - b);
  parts.topConvergers.sort((a: number, b: number) => a - b);
  parts.bottomConvergers.sort((a: number, b: number) => a - b);
  parts.topLaneConvergers.sort((a: number, b: number) => a - b);
  parts.bottomLaneConvergers.sort((a: number, b: number) => a - b);
  parts.topBelts.sort((a: number, b: number) => a - b);
  parts.bottomBelts.sort((a: number, b: number) => a - b);

  return parts;
}

function buildNodesFromBranch(branch: BranchBlueprint): {
  nodes: Record<string, unknown>[];
  width: number;
  height: number;
} {
  assertValidBranchBlueprint(branch);
  const blueprint = branch.blueprint;
  const width = getBlueprintWidth(blueprint);
  const height = getBlueprintHeight(blueprint);
  const middleRow = Math.floor(height / 2);
  const topBeltRow = middleRow - 1;
  const bottomBeltRow = middleRow + 1;
  const parts = collectBlueprintParts(blueprint);

  if (parts.thermalCol == null) {
    throw new Error("Thermal bank is missing in branch blueprint.");
  }

  const nodes: Record<string, unknown>[] = [];
  let nodeId = 1;

  nodes.push(
    createStructureNode(
      nodeId++,
      "power_station_1",
      parts.thermalCol + 1,
      toGameZ(middleRow, height),
      270,
    ),
  );

  for (const col of parts.splitters) {
    nodes.push(
      createStructureNode(
        nodeId++,
        "log_splitter",
        col,
        toGameZ(middleRow, height),
        270,
      ),
    );
  }

  for (const col of parts.topConvergers) {
    nodes.push(
      createStructureNode(
        nodeId++,
        "log_converger",
        col,
        toGameZ(0, height),
        90,
      ),
    );
  }

  for (const col of parts.bottomConvergers) {
    nodes.push(
      createStructureNode(
        nodeId++,
        "log_converger",
        col,
        toGameZ(height - 1, height),
        90,
      ),
    );
  }

  for (const col of parts.topLaneConvergers) {
    nodes.push(
      createStructureNode(
        nodeId++,
        "log_converger",
        col,
        toGameZ(topBeltRow, height),
        180,
      ),
    );
  }

  for (const col of parts.bottomLaneConvergers) {
    nodes.push(
      createStructureNode(
        nodeId++,
        "log_converger",
        col,
        toGameZ(bottomBeltRow, height),
        0,
      ),
    );
  }

  const mergeBottomSourceIntoTurn =
    parts.hasBottomRecycleSource &&
    parts.bottomTurnCol != null &&
    parts.bottomBelts.length <= 1;

  if (parts.bottomTurnCol != null) {
    const points = [
      { x: parts.bottomTurnCol, z: toGameZ(bottomBeltRow, height) },
      { x: parts.bottomTurnCol, z: toGameZ(height - 1, height) },
    ];
    if (mergeBottomSourceIntoTurn) {
      points.push({ x: 0, z: toGameZ(height - 1, height) });
    }
    nodes.push(createBeltNode(nodeId++, 180, 270, points));
  }

  if (parts.hasTopRecycleSource) {
    nodes.push(
      createBeltNode(nodeId++, 270, 270, [{ x: 0, z: toGameZ(0, height) }]),
    );
  }

  if (parts.hasInputSource) {
    nodes.push(
      createBeltNode(nodeId++, 90, 90, [
        { x: 0, z: toGameZ(middleRow, height) },
      ]),
    );
  }

  if (parts.hasBottomRecycleSource && !mergeBottomSourceIntoTurn) {
    nodes.push(
      createBeltNode(nodeId++, 270, 270, [
        { x: 0, z: toGameZ(height - 1, height) },
      ]),
    );
  }

  if (parts.topTurnCol != null) {
    nodes.push(
      createBeltNode(nodeId++, 0, 270, [
        { x: parts.topTurnCol, z: toGameZ(topBeltRow, height) },
        { x: parts.topTurnCol, z: toGameZ(0, height) },
      ]),
    );
  }

  for (const col of [...parts.topBelts].sort((a: number, b: number) => b - a)) {
    if (col === parts.topTurnCol) continue;
    nodes.push(
      createBeltNode(nodeId++, 0, 0, [
        { x: col, z: toGameZ(topBeltRow, height) },
      ]),
    );
  }

  for (const col of [...parts.bottomBelts].sort(
    (a: number, b: number) => b - a,
  )) {
    if (col === parts.bottomTurnCol) continue;
    nodes.push(
      createBeltNode(nodeId++, 180, 180, [
        { x: col, z: toGameZ(bottomBeltRow, height) },
      ]),
    );
  }

  return { nodes, width, height };
}

function defaultBlueprintName(branch: BranchBlueprint): string {
  const denominator = Number(branch?.denominator);
  if (Number.isFinite(denominator) && denominator > 0) {
    return `1/${denominator}`;
  }
  return "Blueprint";
}

export function getBranchDenominatorToken(
  branch: BranchBlueprint | null | undefined,
): string {
  const denominator = Number(branch?.denominator);
  if (Number.isFinite(denominator) && denominator > 0) {
    return String(denominator);
  }
  return "unknown";
}

export function getBranchPowerToken(
  branch: BranchBlueprint | null | undefined,
): string {
  const power = Number(branch?.power);
  if (Number.isFinite(power)) {
    return `${Math.round(power)}w`;
  }
  return "unknownw";
}

export function getIndexedBranchStem(
  branch: BranchBlueprint,
  index: number,
): string {
  return `branch_${index + 1}_1_${getBranchDenominatorToken(branch)}_${getBranchPowerToken(branch)}`;
}

export interface BuildBlueprintOptions {
  name?: string;
  desc?: string;
  bpIcon?: Record<string, unknown>;
  meta?: Record<string, unknown>;
  bpParam?: Partial<BlueprintParam>;
  bpTags?: string[];
}

export function buildEndfieldBlueprint(
  branch: BranchBlueprint,
  options: BuildBlueprintOptions = {},
): Record<string, unknown> {
  const { nodes, width, height } = buildNodesFromBranch(branch);
  const name =
    typeof options.name === "string" && options.name.trim()
      ? options.name.trim()
      : defaultBlueprintName(branch);
  const desc = typeof options.desc === "string" ? options.desc : "";

  const bpIcon = {
    ...DEFAULT_BLUEPRINT_ICON,
    ...(options.bpIcon || {}),
  };

  const meta = {
    ...DEFAULT_META,
    ...(options.meta || {}),
  };

  const bpParam = cloneBpParam(
    options.bpParam || (DEFAULT_BLUEPRINT_PARAM as BlueprintParam),
  );

  return {
    index: "",
    bluePrintData: {
      name,
      desc,
      bpSize: {
        xLen: width + 1,
        zLen: height,
      },
      bpIcon,
      bpTags: Array.isArray(options.bpTags) ? options.bpTags : [],
      reviewStatus: meta.reviewStatus,
      bpParam,
      useCount: meta.useCount,
      creatorRoleId: meta.creatorRoleId,
      creatorUserId: meta.creatorUserId,
      nodes,
      isNew: meta.isNew,
      fetchTime: meta.fetchTime,
    },
  };
}

export function toFiniteOrNull(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function roundNumber(value: unknown, digits: number = 2): number | null {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  const factor = 10 ** digits;
  return Math.round(n * factor) / factor;
}

function buildPhaseOffsetParamPayload(
  params: CalcParams | null | undefined,
): Record<string, number | null> {
  const payload: Record<string, number | null> = {};
  for (let i = 1; i <= PARAM_LIMITS.MAX_BRANCHES; i += 1) {
    payload[`phaseOffsetBranch${i}`] = toFiniteOrNull(
      params?.[`phaseOffsetBranch${i}`],
    );
  }
  return payload;
}

export interface BuildExportParamsPayloadOptions {
  params?: CalcParams;
  solution?: SolutionResult;
  branches?: BranchBlueprint[];
  includePng?: boolean;
  includePreciseChart?: boolean;
  targetPower?: number;
}

export function getExportTargetPower(
  solution: SolutionResult | null | undefined,
  options: { targetPower?: number } = {},
): number {
  const explicitTarget = Number(options.targetPower);
  if (Number.isFinite(explicitTarget)) {
    return explicitTarget;
  }
  const avgPower = Number(solution?.avgPower);
  const waste = Number(solution?.waste);
  if (Number.isFinite(avgPower) && Number.isFinite(waste)) {
    return avgPower - waste;
  }
  return 0;
}

export function buildExportParamsPayload({
  params,
  solution,
  branches,
  includePng,
  includePreciseChart,
  targetPower,
}: BuildExportParamsPayloadOptions): Record<string, unknown> {
  const safeParams =
    params && typeof params === "object"
      ? {
          targetPower: toFiniteOrNull(params.targetPower),
          minBatteryPercent: toFiniteOrNull(params.minBatteryPercent),
          maxWaste: toFiniteOrNull(params.maxWaste),
          maxBranches: toFiniteOrNull(params.maxBranches),
          ...buildPhaseOffsetParamPayload(params),
          excludeBelt:
            typeof params.excludeBelt === "boolean" ? params.excludeBelt : null,
          primaryFuelId: params.primaryFuelId ?? null,
          secondaryFuelId: params.secondaryFuelId ?? null,
          inputSourceId: params.inputSourceId ?? null,
        }
      : null;

  const branchList = Array.isArray(branches)
    ? branches.map((branch, index) => ({
        index: index + 1,
        denominator: Number(branch?.denominator),
        power: roundNumber(branch?.power, 2),
        phaseOffsetCells: toFiniteOrNull(branch?.phaseOffsetCells),
        fileStem: getIndexedBranchStem(branch, index),
      }))
    : [];

  return {
    exportedAt: new Date().toISOString(),
    files: {
      branchJson: true,
      branchPng: includePng,
      preciseChartPng: includePreciseChart,
    },
    targetPower: roundNumber(targetPower, 2),
    params: safeParams,
    solutionSummary: solution
      ? {
          avgPower: roundNumber(solution.avgPower, 2),
          waste: roundNumber(solution.waste, 2),
          variance: roundNumber(solution.variance, 4),
          period: Number(solution.period ?? 0),
          minBattery: roundNumber(solution.minBattery, 2),
          minBatteryPercent: roundNumber(solution.minBatteryPercent, 4),
          branchCount: Number(solution.branchCount ?? branchList.length),
          totalSplitters: Number(solution.totalSplitters ?? 0),
        }
      : null,
    branches: branchList,
  };
}
