import type {
  BasePowerDetails,
  CalcParams,
  ManualBaseLine,
  OscillatingBranch,
  SolutionResult,
  UnifiedFuelBOMItem,
} from "../types/calc";
import type { Fuel } from "./constants";
import {
  buildBranchLimiterOptions,
  getBeltThroughput,
  getEffectiveInput,
  type BranchLimiterPlan,
} from "./inputRate";
import {
  analyzeSplitterComplexity,
  CONSTANTS,
  DEFAULT_INPUT_SOURCE_ID,
  generateValidDenominators,
  getOscillatingPower,
  INPUT_SOURCES,
  PARAM_LIMITS,
  resolveFuel,
} from "./constants";

export type FactoryDesignerParams = CalcParams;

/** Number of full oscillation periods to run before sampling steady-state behavior */
const WARMUP_CYCLES = 2;

/**
 * Hard cap on LCM cycle period (seconds). Prevents OOM from huge timeline arrays
 * when sparse high-power fuels yield enormous multi-branch LCMs (EDGE-01).
 */
const MAX_SIMULATION_DURATION = 1200;

/** @deprecated alias — keep name for any external references */
const MAX_SIMULATION_PERIOD = MAX_SIMULATION_DURATION;

/**
 * Theory-stage prune: single-branch feed interval above this (seconds) cannot
 * sustain battery under realistic minBatteryPercent; skip before simulateCycle.
 */
const MAX_BRANCH_INTERVAL = 600;

/** Absolute ceiling on timeline sample count (seconds of sim wall-clock). */
const MAX_TIMELINE_SAMPLES = 4000;

const PART_FACE = {
  UP: "UP",
  DOWN: "DOWN",
  LEFT: "LEFT",
  RIGHT: "RIGHT",
} as const;

const PART_FUNCTION = {
  INPUT: "INPUT",
  OUTPUT: "OUTPUT",
  RECYCLE: "RECYCLE",
} as const;

function createPart(
  partId: string,
  face: string | null,
  partFunction: string | null = null
): Record<string, unknown> {
  if (partFunction) {
    const part: Record<string, unknown> = { partId, function: partFunction };
    if (face != null) part.face = face;
    return part;
  }
  return { partId, face };
}

function buildBranchBlueprint(
  threeWay: number,
  twoWay: number,
  excludeBelt: boolean = false
): (Record<string, unknown> | null)[][] {
  const totalColumns = 1 + threeWay + twoWay + 1;
  const grid = Array.from({ length: 5 }, () =>
    Array(totalColumns).fill(null)
  ) as (Record<string, unknown> | null)[][];

  // Row 3: Input -> splitters -> thermal bank
  grid[2][0] = createPart("input_source", null, PART_FUNCTION.INPUT);
  let col = 1;

  for (let i = 0; i < threeWay; i += 1) {
    grid[2][col] = createPart("splitter", PART_FACE.RIGHT);
    grid[0][col] = createPart("converger", PART_FACE.LEFT);
    grid[4][col] = createPart("converger", PART_FACE.LEFT);
    if (excludeBelt) {
      grid[1][col] = createPart("converger", PART_FACE.UP);
      grid[3][col] = createPart("converger", PART_FACE.DOWN);
    } else {
      grid[1][col] = createPart("belt", PART_FACE.UP);
      grid[3][col] = createPart("belt", PART_FACE.DOWN);
    }
    col += 1;
  }

  for (let i = 0; i < twoWay; i += 1) {
    grid[2][col] = createPart("splitter", PART_FACE.RIGHT);
    grid[0][col] = createPart("converger", PART_FACE.LEFT);
    if (excludeBelt) {
      grid[1][col] = createPart("converger", PART_FACE.UP);
    } else {
      grid[1][col] = createPart("belt", PART_FACE.UP);
    }
    col += 1;
  }

  grid[2][col] = createPart("thermal_bank", null, PART_FUNCTION.OUTPUT);

  grid[0][0] = createPart("recycle_source", null, PART_FUNCTION.RECYCLE);
  if (grid[4].some((cell) => cell !== null)) {
    grid[4][0] = createPart("recycle_source", null, PART_FUNCTION.RECYCLE);
  }

  if (!excludeBelt) {
    for (let idx = totalColumns - 1; idx >= 0; idx -= 1) {
      if ((grid[0][idx] as Record<string, unknown>)?.partId === "converger") {
        grid[0][idx] = createPart("left_turn_belt", PART_FACE.UP);
        break;
      }
    }
    for (let idx = totalColumns - 1; idx >= 0; idx -= 1) {
      if ((grid[4][idx] as Record<string, unknown>)?.partId === "converger") {
        grid[4][idx] = createPart("right_turn_belt", PART_FACE.DOWN);
        break;
      }
    }
  }

  return grid;
}

interface OscillatingSolutionInput {
  branches: Array<{
    denominator: number;
    phaseOffsetCells?: number;
    power?: number;
    blueprint?: (Record<string, unknown> | null)[][];
    limiterSpeed?: number | null;
    requiresLimiter?: boolean;
    localDenominator?: number;
    branchInterval?: number;
    splitterCount?: { split2: number; split3: number; total: number };
    description?: string;
    fuelId?: string;
    fuel?: Fuel;
  }>;
  fuel: Fuel;
  isPrimary: boolean;
  isMixed?: boolean;
  avgPower: number;
  waste: number;
  variance: number;
  period: number;
  minBattery: number;
  minBatteryPercent: number;
  branchCount: number;
  totalSplitters: number;
  batteryLog: number[];
  powerLog: number[];
  burnStateLog: number[][];
  preciseBatteryLog: number[];
  precisePowerLog: number[];
  preciseBurnStateLog: number[][];
}

interface BuildSolutionOutputParams {
  baseConfig: { totalPower: number; generators: number; belts: number };
  primaryFuel: Fuel;
  targetPower: number;
  inputInterval: number;
  inputSourceId: string;
  rateLimitPerMin?: number | null;
  isRateLimited?: boolean;
  excludeBelt: boolean;
  batteryCapacity: number;
  baseFuelPerSec: number;
  solution: OscillatingSolutionInput | null;
  oscillatingFuelPerSec: number;
  baseDetails?: BasePowerDetails;
  fuelBOM?: UnifiedFuelBOMItem[];
}

function buildUnifiedBOM(
  baseDetails: BasePowerDetails,
  oscFuel: Fuel | null,
  oscRatePerSec: number,
  primaryFuel: Fuel,
  secondaryFuel: Fuel | null | undefined,
  fuelOverrides?: Record<string, { power?: number; burnTime?: number }>,
  /** 震荡侧平均功率 (W)，用于估算「若满载供同样功率」所需台数 */
  oscAvgPower: number = 0,
  /** 可选：按分支拆分震荡消耗（混合燃料） */
  oscBranches?: Array<{
    fuelId?: string;
    power?: number;
    branchInterval?: number;
    localDenominator?: number;
    denominator?: number;
  }> | null,
  /** 母带间隔，用于 branchInterval fallback */
  inputIntervalForBom: number = 2
): UnifiedFuelBOMItem[] {
  const fuelIdSet = new Set<string>();
  fuelIdSet.add(primaryFuel.id);
  if (secondaryFuel && secondaryFuel.id !== "none") {
    fuelIdSet.add(secondaryFuel.id);
  }
  baseDetails.manualLines.forEach((l) => fuelIdSet.add(l.fuel.id));
  if (oscFuel) fuelIdSet.add(oscFuel.id);
  if (oscBranches) {
    for (const b of oscBranches) {
      if (b.fuelId) fuelIdSet.add(b.fuelId);
    }
  }

  // 按燃料聚合震荡速率与功率
  const oscRateByFuel = new Map<string, number>();
  const oscPowerByFuel = new Map<string, number>();
  if (oscBranches && oscBranches.length > 0) {
    for (const branch of oscBranches) {
      const fid = branch.fuelId || oscFuel?.id;
      if (!fid) continue;
      let bi = branch.branchInterval;
      if (!(bi != null && Number.isFinite(bi) && bi > 0)) {
        const d = branch.localDenominator ?? branch.denominator ?? 1;
        bi = inputIntervalForBom * d;
      }
      if (bi === Infinity || bi <= 0 || !Number.isFinite(bi)) continue;
      const ratePerSec = 1 / bi;
      oscRateByFuel.set(fid, (oscRateByFuel.get(fid) || 0) + ratePerSec);
      oscPowerByFuel.set(
        fid,
        (oscPowerByFuel.get(fid) || 0) + (branch.power ?? 0)
      );
    }
  } else if (oscFuel && oscRatePerSec > 0) {
    oscRateByFuel.set(oscFuel.id, oscRatePerSec);
    oscPowerByFuel.set(oscFuel.id, oscAvgPower > 0 ? oscAvgPower : 0);
  }

  const bomList: UnifiedFuelBOMItem[] = [];

  for (const fuelId of fuelIdSet) {
    const fuel = resolveFuel(fuelId, fuelOverrides);
    if (!fuel || !fuel.burnTime || fuel.burnTime <= 0) continue;

    let baseCount = 0;
    for (const line of baseDetails.manualLines) {
      if (line.fuel.id === fuelId) baseCount += line.count;
    }
    if (baseDetails.autoBaseFuel?.id === fuelId) {
      baseCount += baseDetails.autoBaseCount;
    }

    const fullLoadRatePerMin = 60 / fuel.burnTime;
    const baseRatePerMin = baseCount * fullLoadRatePerMin;

    let oscRatePerMin = 0;
    let oscGenCount = 0;
    const fuelOscRateSec = oscRateByFuel.get(fuelId) || 0;
    const fuelOscPower = oscPowerByFuel.get(fuelId) || 0;
    if (fuelOscRateSec > 0) {
      oscRatePerMin = fuelOscRateSec * 60;
      // 与旧 FuelConsumptionTable 一致：按震荡功率估算满载台数（ceil），
      // 不可用 round(rate*burnTime)——低速震荡会变成 0，导致「每天节省」恒为 0。
      const powerForGens =
        fuelOscPower > 0 && Number.isFinite(fuelOscPower)
          ? fuelOscPower
          : fuelOscRateSec * fuel.burnTime * fuel.power;
      if (powerForGens > 0 && fuel.power > 0) {
        oscGenCount = Math.max(1, Math.ceil(powerForGens / fuel.power));
      }
    }

    const totalRatePerMin = baseRatePerMin + oscRatePerMin;
    const totalRatePerHour = totalRatePerMin * 60;
    const totalRatePerDay = totalRatePerMin * 1440;

    // 对照：常驻满载 + 震荡若改为同台数满载供料
    const maxCapacityRatePerMin =
      (baseCount + oscGenCount) * fullLoadRatePerMin;
    const savedRatePerMin = Math.max(
      0,
      maxCapacityRatePerMin - totalRatePerMin
    );
    const savedRatePerDay = savedRatePerMin * 1440;
    const savedPercent =
      maxCapacityRatePerMin > 0
        ? (savedRatePerMin / maxCapacityRatePerMin) * 100
        : 0;

    if (baseCount === 0 && oscRatePerMin <= 0) continue;

    bomList.push({
      fuelId: fuel.id,
      fuelName: fuel.name,
      basePoolCount: baseCount,
      baseRatePerMin,
      oscGeneratorCount: oscGenCount,
      oscRatePerMin,
      totalRatePerMin,
      totalRatePerHour,
      totalRatePerDay,
      savedRatePerDay,
      savedPercent,
    });
  }

  return bomList;
}

function buildSolutionOutput({
  baseConfig,
  primaryFuel,
  targetPower,
  inputInterval,
  inputSourceId,
  rateLimitPerMin = null,
  isRateLimited = false,
  excludeBelt,
  batteryCapacity,
  baseFuelPerSec,
  solution,
  oscillatingFuelPerSec,
  baseDetails,
  fuelBOM,
}: BuildSolutionOutputParams): SolutionResult {
  if (!solution) {
    return {
      baseConfig,
      baseFuel: primaryFuel,
      oscillating: null,
      oscillatingFuel: null,
      fuel: primaryFuel,
      isPrimary: true,
      inputInterval,
      inputSourceId,
      rateLimitPerMin,
      isRateLimited,
      excludeBelt: excludeBelt,
      avgPower: baseConfig.totalPower,
      waste: baseConfig.totalPower - targetPower,
      variance: 0,
      period: 0,
      minBattery: batteryCapacity,
      minBatteryPercent: 100,
      branchCount: 0,
      totalSplitters: 0,
      batteryLog: [batteryCapacity, batteryCapacity],
      powerLog: [baseConfig.totalPower, baseConfig.totalPower],
      burnStateLog: [],
      preciseBatteryLog: [batteryCapacity, batteryCapacity],
      precisePowerLog: [baseConfig.totalPower, baseConfig.totalPower],
      preciseBurnStateLog: [],
      fuelConsumption: {
        base: {
          fuel: primaryFuel,
          perSecond: baseFuelPerSec,
          perMinute: baseFuelPerSec * 60,
          perHour: baseFuelPerSec * 3600,
          perDay: baseFuelPerSec * 86400,
        },
        oscillating: {
          fuel: null,
          perSecond: 0,
          perMinute: 0,
          perHour: 0,
          perDay: 0,
        },
      },
      baseDetails,
      fuelBOM,
    };
  }

  const oscillating: OscillatingBranch[] = solution.branches.map((b) => ({
    denominator: b.denominator,
    phaseOffsetCells: b.phaseOffsetCells ?? 0,
    power: b.power ?? 0,
    blueprint: b.blueprint,
    limiterSpeed: b.limiterSpeed ?? null,
    requiresLimiter: Boolean(b.requiresLimiter),
    localDenominator: b.localDenominator,
    branchInterval: b.branchInterval,
    splitterCount: b.splitterCount,
    description: b.description,
    fuelId: b.fuelId ?? b.fuel?.id ?? solution.fuel.id,
  }));
  return {
    baseConfig,
    baseFuel: primaryFuel,
    oscillating,
    oscillatingFuel: solution.fuel,
    fuel: solution.fuel,
    isPrimary: solution.isPrimary,
    isMixed: Boolean(solution.isMixed),
    inputInterval,
    inputSourceId,
    rateLimitPerMin,
    isRateLimited,
    excludeBelt: excludeBelt,
    avgPower: solution.avgPower,
    waste: solution.waste,
    variance: solution.variance,
    period: solution.period,
    minBattery: solution.minBattery,
    minBatteryPercent: solution.minBatteryPercent,
    branchCount: solution.branchCount,
    totalSplitters: solution.totalSplitters,
    batteryLog: solution.batteryLog,
    powerLog: solution.powerLog,
    burnStateLog: solution.burnStateLog,
    preciseBatteryLog: solution.preciseBatteryLog,
    precisePowerLog: solution.precisePowerLog,
    preciseBurnStateLog: solution.preciseBurnStateLog,
    fuelConsumption: {
      base: {
        fuel: primaryFuel,
        perSecond: baseFuelPerSec,
        perMinute: baseFuelPerSec * 60,
        perHour: baseFuelPerSec * 3600,
        perDay: baseFuelPerSec * 86400,
      },
      oscillating: {
        fuel: solution.fuel,
        perSecond: oscillatingFuelPerSec,
        perMinute: oscillatingFuelPerSec * 60,
        perHour: oscillatingFuelPerSec * 3600,
        perDay: oscillatingFuelPerSec * 86400,
      },
    },
    baseDetails,
    fuelBOM,
  };
}

function normalizePhaseOffsetCells(value: unknown): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return 0;
  }
  const rounded = Math.round(numeric);
  return Math.min(
    PARAM_LIMITS.MAX_PHASE_OFFSET_CELLS,
    Math.max(PARAM_LIMITS.MIN_PHASE_OFFSET_CELLS, rounded)
  );
}

interface SimulatorParams {
  targetPower: number;
  minBatteryPercent: number;
  batteryCapacity: number;
  inputInterval: number;
}

interface SimulateCycleSuccess {
  success: true;
  period: number;
  avgPower: number;
  waste: number;
  variance: number;
  minBattery: number;
  minBatteryPercent: number;
  batteryLog: number[];
  powerLog: number[];
  burnStateLog: number[][];
  preciseBatteryLog: number[];
  precisePowerLog: number[];
  preciseBurnStateLog: number[][];
}

interface SimulateCycleFailure {
  success: false;
  reason: "period_too_long" | "battery_depleted_preheat" | "battery_below_min";
  minBattery?: number;
}

type SimulateCycleResult = SimulateCycleSuccess | SimulateCycleFailure;

class PowerCycleSimulator {
  targetPower: number;
  minBatteryPercent: number;
  batteryCapacity: number;
  inputInterval: number;

  constructor({
    targetPower,
    minBatteryPercent,
    batteryCapacity,
    inputInterval,
  }: SimulatorParams) {
    this.targetPower = targetPower;
    this.minBatteryPercent = minBatteryPercent;
    this.batteryCapacity = batteryCapacity;
    this.inputInterval = inputInterval;
  }

  _gcd(a: number, b: number): number {
    return b === 0 ? a : this._gcd(b, a % b);
  }

  _lcm(a: number, b: number): number {
    if (a === 0 || b === 0) {
      return 0;
    }
    if (!Number.isFinite(a) || !Number.isFinite(b) || a < 0 || b < 0) {
      return Number.POSITIVE_INFINITY;
    }
    const g = this._gcd(a, b);
    // Avoid intermediate overflow: (a/g)*b may exceed Number.MAX_SAFE_INTEGER
    const ag = a / g;
    if (b !== 0 && ag > Number.MAX_SAFE_INTEGER / b) {
      return Number.POSITIVE_INFINITY;
    }
    const result = Math.abs(ag) * b;
    if (!Number.isFinite(result)) {
      return Number.POSITIVE_INFINITY;
    }
    return result;
  }

  _getCyclePeriodFromIntervals(intervals: number[]): number {
    if (intervals.length === 0) {
      return this.inputInterval;
    }
    // LCM in milliseconds to avoid float drift (e.g. 10/3 s)
    const maxPeriodMs = MAX_SIMULATION_DURATION * 1000;
    const toMs = (sec: number) => {
      if (!Number.isFinite(sec) || sec <= 0) return Number.POSITIVE_INFINITY;
      return Math.max(1, Math.round(sec * 1000));
    };
    let periodMs = toMs(intervals[0]);
    if (!Number.isFinite(periodMs) || periodMs > maxPeriodMs) {
      return Number.POSITIVE_INFINITY;
    }
    for (let i = 1; i < intervals.length; i += 1) {
      const next = toMs(intervals[i]);
      if (!Number.isFinite(next) || next > maxPeriodMs) {
        return Number.POSITIVE_INFINITY;
      }
      periodMs = this._lcm(periodMs, next);
      if (!Number.isFinite(periodMs) || periodMs > maxPeriodMs) {
        return Number.POSITIVE_INFINITY;
      }
    }
    return periodMs / 1000;
  }

  _resolveBranchInterval(branch: {
    denominator: number;
    branchInterval?: number;
    localDenominator?: number;
    baseInterval?: number;
  }): number {
    if (
      branch.branchInterval != null &&
      Number.isFinite(branch.branchInterval) &&
      branch.branchInterval > 0
    ) {
      return branch.branchInterval;
    }
    if (
      branch.baseInterval != null &&
      branch.localDenominator != null &&
      Number.isFinite(branch.baseInterval) &&
      branch.baseInterval > 0
    ) {
      return branch.baseInterval * branch.localDenominator;
    }
    return this.inputInterval * branch.denominator;
  }

  simulateCycle(
    baseConfig: { totalPower: number },
    oscillatingBranches: Array<{
      denominator: number;
      phaseOffsetCells?: number;
      branchInterval?: number;
      localDenominator?: number;
      baseInterval?: number;
      fuel?: Fuel;
    }>,
    fuel: Fuel
  ): SimulateCycleResult {
    const branchIntervals = oscillatingBranches.map((b) =>
      this._resolveBranchInterval(b)
    );
    // Early prune: any branch with absurd feed interval → battery physics fail
    for (const iv of branchIntervals) {
      if (!Number.isFinite(iv) || iv <= 0 || iv > MAX_BRANCH_INTERVAL) {
        return { success: false, reason: "period_too_long" };
      }
    }
    const period = this._getCyclePeriodFromIntervals(branchIntervals);
    if (
      !Number.isFinite(period) ||
      period <= 0 ||
      period > MAX_SIMULATION_DURATION
    ) {
      return { success: false, reason: "period_too_long" };
    }

    const warmupCycles = WARMUP_CYCLES;
    const maxPhaseOffset = oscillatingBranches.reduce((maxOffset, branch) => {
      const offsetSeconds =
        normalizePhaseOffsetCells(branch.phaseOffsetCells) *
        CONSTANTS.BELT_INTERVAL;
      return Math.max(maxOffset, offsetSeconds);
    }, 0);
    const warmupDuration = Math.max(
      period * warmupCycles,
      maxPhaseOffset + period
    );
    const totalDuration = warmupDuration + period;
    const timelineSize = Math.ceil(totalDuration);
    // Hard memory fence: refuse allocation of runaway timelines
    if (
      !Number.isFinite(timelineSize) ||
      timelineSize <= 0 ||
      timelineSize > MAX_TIMELINE_SAMPLES
    ) {
      return { success: false, reason: "period_too_long" };
    }

    const powerTimeline = new Array(timelineSize).fill(0);
    const branchBurnTimeline = oscillatingBranches.map(() =>
      new Array(timelineSize).fill(0)
    );

    for (const [branchIndex, branch] of oscillatingBranches.entries()) {
      const inputInterval = branchIntervals[branchIndex];
      if (!Number.isFinite(inputInterval) || inputInterval <= 0) {
        continue;
      }
      const phaseOffsetCells = normalizePhaseOffsetCells(
        branch.phaseOffsetCells
      );
      const branchStartTime = phaseOffsetCells * CONSTANTS.BELT_INTERVAL;
      let lastBurnEnd = 0;

      for (let t = branchStartTime; t < totalDuration; t += inputInterval) {
        const branchFuel = branch.fuel ?? fuel;
        const burnStart = Math.max(t, lastBurnEnd);
        const burnEnd = burnStart + branchFuel.burnTime;
        lastBurnEnd = burnEnd;

        const start = Math.floor(burnStart);
        const end = Math.min(Math.ceil(burnEnd), totalDuration);
        for (let i = start; i < end; i += 1) {
          powerTimeline[i] += branchFuel.power;
          branchBurnTimeline[branchIndex][i] = 1;
        }
      }
    }

    const checkStart = Math.floor(warmupDuration);
    const checkEnd = Math.floor(totalDuration);
    const cyclePower = powerTimeline.slice(checkStart, checkEnd);

    const minBatteryRequired =
      (this.batteryCapacity * this.minBatteryPercent) / 100;
    let battery = this.batteryCapacity;
    let minBattery = battery;
    const batteryLog: number[] = [];
    const powerLog: number[] = [];
    const burnStateLog = oscillatingBranches.map(() => [] as number[]);
    const preciseBatteryLog: number[] = [];
    const precisePowerLog: number[] = [];
    const preciseBurnStateLog = oscillatingBranches.map(() => [] as number[]);

    for (let t = 0; t < checkStart; t += 1) {
      const supply = baseConfig.totalPower + powerTimeline[t];
      battery += supply - this.targetPower;
      if (battery > this.batteryCapacity) {
        battery = this.batteryCapacity;
      }
      if (battery < 0) {
        return { success: false, reason: "battery_depleted_preheat" };
      }
    }

    const sampleStep = period >= 2000 ? Math.ceil(period / 500) : 1;
    for (let t = checkStart; t < checkEnd; t += 1) {
      const supply = baseConfig.totalPower + powerTimeline[t];
      battery += supply - this.targetPower;

      if (battery > this.batteryCapacity) {
        battery = this.batteryCapacity;
      }
      if (battery < minBattery) {
        minBattery = battery;
      }

      if (period < 2000 || (t - checkStart) % sampleStep === 0) {
        batteryLog.push(battery);
        powerLog.push(supply);
        for (let i = 0; i < burnStateLog.length; i += 1) {
          burnStateLog[i].push(branchBurnTimeline[i][t]);
        }
      }

      // Cap precise logs: full 1Hz only for short cycles; long cycles reuse sampleStep
      if (period < 2000 || (t - checkStart) % sampleStep === 0) {
        preciseBatteryLog.push(battery);
        precisePowerLog.push(supply);
        for (let i = 0; i < preciseBurnStateLog.length; i += 1) {
          preciseBurnStateLog[i].push(branchBurnTimeline[i][t]);
        }
      }

      if (battery < minBatteryRequired) {
        return {
          success: false,
          reason: "battery_below_min",
          minBattery,
        };
      }
    }

    const avgPower =
      cyclePower.reduce((sum: number, p: number) => sum + p, 0) /
        cyclePower.length +
      baseConfig.totalPower;
    const variance =
      cyclePower.reduce(
        (sum: number, p: number) =>
          sum + (p - (avgPower - baseConfig.totalPower)) ** 2,
        0
      ) / cyclePower.length;
    const waste = avgPower - this.targetPower;

    return {
      success: true,
      period,
      avgPower,
      waste,
      variance,
      minBattery,
      minBatteryPercent: (minBattery / this.batteryCapacity) * 100,
      batteryLog,
      powerLog,
      burnStateLog,
      preciseBatteryLog,
      precisePowerLog,
      preciseBurnStateLog,
    };
  }
}

/**
 * 工厂设计器 - 计算最优发电方案
 */
export class FactoryDesigner {
  targetPower: number;
  minBatteryPercent: number;
  maxWaste: number;
  primaryFuel: Fuel;
  secondaryFuel: Fuel | null;
  inputSource: {
    id: string;
    interval: number;
    speed?: number;
    [key: string]: unknown;
  };
  inputInterval: number;
  rateLimitPerMin: number | null;
  isRateLimited: boolean;
  batteryCapacity: number;
  maxBranches: number;
  branchPhaseOffsets: number[];
  excludeBelt: boolean;
  /**
   * 排除物品准入口限速器。
   * false（默认）= 启用限速求解；true = 忽略限速/满速普通算法。
   */
  excludeItemGateLimiter: boolean;
  /** 手动常驻行（本地 state，不进 URL） */
  manualBaseLines: ManualBaseLine[];
  /**
   * 自动规划常驻：
   * undefined + 无 manual → 旧 floor；true → 补齐；false → 不补齐
   */
  autoPlanBasePools: boolean | undefined;
  /** undefined=legacy 不混合；auto/primaryOnly/secondaryOnly/mixed */
  multiFuelMode: CalcParams["multiFuelMode"];
  fuelOverrides?: Record<string, { power?: number; burnTime?: number }>;
  validDenominators: number[];
  simulator: PowerCycleSimulator;

  constructor(params: FactoryDesignerParams) {
    this.targetPower = params.targetPower;
    this.minBatteryPercent = params.minBatteryPercent;
    this.maxWaste = params.maxWaste;
    const resolvedPrimary = resolveFuel(
      params.primaryFuelId,
      params.fuelOverrides
    );
    if (!resolvedPrimary) {
      throw new Error(`Unknown primary fuel: ${params.primaryFuelId}`);
    }
    this.primaryFuel = resolvedPrimary;

    const resolvedSecondary =
      params.secondaryFuelId !== "none"
        ? resolveFuel(params.secondaryFuelId, params.fuelOverrides)
        : null;
    if (params.secondaryFuelId !== "none" && !resolvedSecondary) {
      throw new Error(`Unknown secondary fuel: ${params.secondaryFuelId}`);
    }
    this.secondaryFuel = resolvedSecondary ?? null;

    const inputSourceId = params.inputSourceId || DEFAULT_INPUT_SOURCE_ID;
    const baseSource =
      INPUT_SOURCES[inputSourceId] || INPUT_SOURCES[DEFAULT_INPUT_SOURCE_ID];
    // 全局母带始终为输入源满速；准入口限速由震荡分支自动决策
    const effective = getEffectiveInput(inputSourceId, null);
    this.inputSource = {
      ...baseSource,
      id: inputSourceId,
      speed: effective.speed,
      interval: effective.interval,
    };
    this.inputInterval = effective.interval;
    this.rateLimitPerMin = null;
    this.isRateLimited = false;
    this.batteryCapacity = CONSTANTS.BATTERY_CAPACITY;
    const normalizedMaxBranches = Number.isInteger(params.maxBranches)
      ? params.maxBranches ?? PARAM_LIMITS.MAX_BRANCHES
      : PARAM_LIMITS.MAX_BRANCHES;
    this.maxBranches = Math.min(
      PARAM_LIMITS.MAX_BRANCHES,
      Math.max(PARAM_LIMITS.MIN_BRANCHES, normalizedMaxBranches)
    );
    this.branchPhaseOffsets = Array.from(
      { length: this.maxBranches },
      (_, index) => {
        const key = `phaseOffsetBranch${index + 1}` as keyof CalcParams;
        const val = params[key];
        const num = Number(val);
        return normalizePhaseOffsetCells(Number.isFinite(num) ? num : 0);
      }
    );
    this.excludeBelt = Boolean(params.excludeBelt ?? true);
    // false/缺省=启用限速求解；true=排除限速（满速）
    this.excludeItemGateLimiter = Boolean(params.excludeItemGateLimiter);
    this.manualBaseLines = Array.isArray(params.manualBaseLines)
      ? params.manualBaseLines.filter(
          (l) =>
            l &&
            typeof l.fuelId === "string" &&
            Number.isFinite(l.count) &&
            l.count > 0
        )
      : [];
    // null/undefined → 缺省（旧 floor）；仅显式 true/false 生效
    this.autoPlanBasePools =
      params.autoPlanBasePools === undefined ||
      params.autoPlanBasePools === null
        ? undefined
        : Boolean(params.autoPlanBasePools);
    this.multiFuelMode = params.multiFuelMode;
    this.fuelOverrides = params.fuelOverrides;

    this.validDenominators = generateValidDenominators();
    this.simulator = new PowerCycleSimulator({
      targetPower: this.targetPower,
      minBatteryPercent: this.minBatteryPercent,
      batteryCapacity: this.batteryCapacity,
      inputInterval: Number.isFinite(this.inputInterval)
        ? this.inputInterval
        : 0,
    });
  }

  /** 限速为 0（inputInterval === Infinity）时的安全判断 */
  private _isZeroInputRate(): boolean {
    return (
      this.inputInterval === Infinity ||
      this.inputInterval <= 0 ||
      !Number.isFinite(this.inputInterval)
    );
  }

  _getDirectBaseConfigs(): Array<{
    generators: number;
    totalPower: number;
    belts: number;
  }> {
    // 限速 0：仅可能返回基地 200W 方案
    if (this._isZeroInputRate()) {
      const waste = CONSTANTS.BASE_POWER - this.targetPower;
      if (waste >= 0 && waste <= this.maxWaste) {
        return [{ generators: 0, totalPower: CONSTANTS.BASE_POWER, belts: 0 }];
      }
      return [];
    }

    const inputSpeed = getBeltThroughput(this.inputInterval);
    const gensPerBelt = inputSpeed * this.primaryFuel.burnTime;
    const minGenerators = Math.max(
      0,
      Math.ceil(
        (this.targetPower - CONSTANTS.BASE_POWER) / this.primaryFuel.power
      )
    );
    const maxGenerators = Math.max(
      0,
      Math.floor(
        (this.targetPower + this.maxWaste - CONSTANTS.BASE_POWER) /
          this.primaryFuel.power
      )
    );

    if (maxGenerators < minGenerators) {
      return [];
    }

    const configs: Array<{
      generators: number;
      totalPower: number;
      belts: number;
    }> = [];
    for (
      let generators = minGenerators;
      generators <= maxGenerators;
      generators += 1
    ) {
      const totalPower =
        CONSTANTS.BASE_POWER + generators * this.primaryFuel.power;
      const waste = totalPower - this.targetPower;
      if (waste < 0 || waste > this.maxWaste) {
        continue;
      }
      configs.push({
        generators,
        totalPower,
        belts: gensPerBelt > 0 ? Math.ceil(generators / gensPerBelt) : 0,
      });
    }
    return configs;
  }

  calculateBasePower(): {
    generators: number;
    totalPower: number;
    belts: number;
    baseDetails: BasePowerDetails;
    baseFuelPerSec: number;
  } {
    const corePower = CONSTANTS.BASE_POWER;

    if (this._isZeroInputRate()) {
      const baseDetails: BasePowerDetails = {
        corePower,
        manualLines: [],
        autoBaseCount: 0,
        autoBaseFuel: undefined,
        totalBasePower: corePower,
      };
      return {
        generators: 0,
        totalPower: corePower,
        belts: 0,
        baseDetails,
        baseFuelPerSec: 0,
      };
    }

    const inputSpeed = getBeltThroughput(this.inputInterval);

    const manualLines: BasePowerDetails["manualLines"] = [];
    let manualPower = 0;
    let manualGenerators = 0;
    let manualFuelPerSec = 0;
    const generatorsByFuelId = new Map();

    for (const line of this.manualBaseLines) {
      const fuel = resolveFuel(line.fuelId, this.fuelOverrides);
      if (!fuel || !Number.isFinite(fuel.power) || fuel.power <= 0) continue;
      const count = Math.max(0, Math.floor(line.count));
      if (count <= 0) continue;
      const power = count * fuel.power;
      manualLines.push({ fuel, count, power });
      manualPower += power;
      manualGenerators += count;
      generatorsByFuelId.set(
        fuel.id,
        (generatorsByFuelId.get(fuel.id) || 0) + count
      );
      if (fuel.burnTime > 0) {
        manualFuelPerSec += count / fuel.burnTime;
      }
    }

    const hasManual = manualLines.length > 0;
    const isLegacyDefault = !hasManual && this.autoPlanBasePools === undefined;
    const enableAuto = this.autoPlanBasePools === true || isLegacyDefault;

    let autoBaseCount = 0;
    let autoBaseFuel: Fuel | undefined;
    let autoPower = 0;
    let autoFuelPerSec = 0;

    const remainingForAuto = this.targetPower - corePower - manualPower;
    if (enableAuto && remainingForAuto > 0 && this.primaryFuel.power > 0) {
      autoBaseCount = Math.floor(remainingForAuto / this.primaryFuel.power);
      if (autoBaseCount > 0) {
        autoBaseFuel = this.primaryFuel;
        autoPower = autoBaseCount * this.primaryFuel.power;
        if (this.primaryFuel.burnTime > 0) {
          autoFuelPerSec = autoBaseCount / this.primaryFuel.burnTime;
        }
        generatorsByFuelId.set(
          this.primaryFuel.id,
          (generatorsByFuelId.get(this.primaryFuel.id) || 0) + autoBaseCount
        );
      }
    }

    const totalPower = corePower + manualPower + autoPower;
    const generators = manualGenerators + autoBaseCount;

    let belts = 0;
    if (inputSpeed > 0) {
      for (const [fuelId, count] of generatorsByFuelId) {
        const fuel = resolveFuel(fuelId, this.fuelOverrides);
        if (!fuel || fuel.burnTime <= 0 || count <= 0) continue;
        const gensPerBelt = inputSpeed * fuel.burnTime;
        if (gensPerBelt > 0) {
          belts += Math.ceil(count / gensPerBelt);
        }
      }
    }

    const baseDetails: BasePowerDetails = {
      corePower,
      manualLines,
      autoBaseCount,
      autoBaseFuel,
      totalBasePower: totalPower,
    };

    return {
      generators,
      totalPower,
      belts,
      baseDetails,
      baseFuelPerSec: manualFuelPerSec + autoFuelPerSec,
    };
  }

  /**
   * Generate combinations with repetition (multiset) — intentional because
   * multiple branches can share the same denominator.
   */
  _getCombinationsWithRepetition(arr: number[], length: number): number[][] {
    if (length === 1) {
      return arr.map((x) => [x]);
    }

    const combinations: number[][] = [];
    arr.forEach((v, i) => {
      const subs = this._getCombinationsWithRepetition(
        arr.slice(i),
        length - 1
      );
      subs.forEach((sub) => {
        combinations.push([v, ...sub]);
      });
    });
    return combinations;
  }

  calculateOscillatingPlans(
    fuel: Fuel,
    baseConfig: { totalPower: number },
    isPrimary: boolean
  ): OscillatingSolutionInput[] {
    if (this._isZeroInputRate()) {
      return [];
    }
    const gap = this.targetPower - baseConfig.totalPower;
    if (gap <= 0) {
      return [];
    }

    const solutions: OscillatingSolutionInput[] = [];
    // true=忽略限速（满速）；false=枚举准入口限速
    const allBranchOptions: BranchLimiterPlan[] = buildBranchLimiterOptions(
      fuel,
      this.inputSource.id,
      this.validDenominators,
      this.excludeItemGateLimiter
    );
    // 剪枝：单支功率不超过 gap+容差；按硬件成本优先保留，避免组合爆炸
    const maxSinglePower = gap + this.maxWaste + 10;
    const pruned = allBranchOptions
      .filter(
        (o) =>
          o.power > 0 &&
          o.power <= maxSinglePower &&
          Number.isFinite(o.branchInterval) &&
          o.branchInterval > 0 &&
          o.branchInterval <= MAX_BRANCH_INTERVAL
      )
      .sort((a, b) => {
        if (a.hardwareCost !== b.hardwareCost)
          return a.hardwareCost - b.hardwareCost;
        return a.power - b.power;
      });
    const MAX_BRANCH_OPTIONS = 48;
    const branchOptions =
      pruned.length > MAX_BRANCH_OPTIONS
        ? pruned.slice(0, MAX_BRANCH_OPTIONS)
        : pruned;
    if (branchOptions.length === 0) {
      return solutions;
    }

    // 组合索引（可重复组合）
    const optionIndexList = branchOptions.map((_, i) => i);

    for (let r = 1; r <= this.maxBranches; r += 1) {
      const combinations = this._getCombinationsWithRepetition(
        optionIndexList,
        r
      );

      for (const comboIdx of combinations) {
        const combo = comboIdx.map((i) => branchOptions[i]);
        const theoryPower = combo.reduce((sum, opt) => sum + opt.power, 0);
        const theoryTotal = baseConfig.totalPower + theoryPower;
        const theoryWaste = theoryTotal - this.targetPower;
        if (theoryWaste < 0 || theoryWaste > this.maxWaste + 10) {
          continue;
        }

        const branchConfigs = combo.map((opt, i) => ({
          denominator: opt.denominator,
          localDenominator: opt.localDenominator,
          branchInterval: opt.branchInterval,
          phaseOffsetCells: this.branchPhaseOffsets[i] ?? 0,
          power: opt.power,
          limiterSpeed: opt.limiterSpeed,
          requiresLimiter: opt.requiresLimiter,
          splitterCount: opt.splitterCount,
          description: opt.description,
          fuelId: fuel.id,
          fuel,
          complexity: {
            total: opt.splitterCount.total,
            twoWay: opt.splitterCount.split2,
            threeWay: opt.splitterCount.split3,
          },
        }));

        const result = this.simulator.simulateCycle(
          baseConfig,
          branchConfigs,
          fuel
        );

        if (
          result.success &&
          result.waste != null &&
          result.waste >= 0 &&
          result.waste <= this.maxWaste
        ) {
          const totalSplitters = combo.reduce(
            (sum, opt) => sum + opt.splitterCount.total,
            0
          );

          solutions.push({
            fuel,
            isPrimary,
            isMixed: false,
            branches: branchConfigs.map((branchConfig) => ({
              denominator: branchConfig.denominator,
              phaseOffsetCells: branchConfig.phaseOffsetCells,
              power: branchConfig.power,
              limiterSpeed: branchConfig.limiterSpeed,
              requiresLimiter: branchConfig.requiresLimiter,
              localDenominator: branchConfig.localDenominator,
              branchInterval: branchConfig.branchInterval,
              splitterCount: branchConfig.splitterCount,
              description: branchConfig.description,
              fuelId: branchConfig.fuelId ?? fuel.id,
              fuel: branchConfig.fuel ?? fuel,
              complexity: branchConfig.complexity,
              blueprint: buildBranchBlueprint(
                branchConfig.complexity.threeWay,
                branchConfig.complexity.twoWay,
                this.excludeBelt
              ),
            })),
            branchCount: combo.length,
            totalSplitters,
            period: result.period ?? 0,
            avgPower: result.avgPower ?? 0,
            waste: result.waste ?? 0,
            variance: result.variance ?? 0,
            minBattery: result.minBattery ?? 0,
            minBatteryPercent: result.minBatteryPercent ?? 0,
            batteryLog: result.batteryLog ?? [],
            powerLog: result.powerLog ?? [],
            burnStateLog: result.burnStateLog ?? [],
            preciseBatteryLog: result.preciseBatteryLog ?? [],
            precisePowerLog: result.precisePowerLog ?? [],
            preciseBurnStateLog: result.preciseBurnStateLog ?? [],
          });
        }
      }
    }

    return solutions;
  }

  /** 剪枝分支候选（复用 buildBranchLimiterOptions） */
  getPrunedBranchOptions(
    fuel: Fuel,
    gap: number,
    K: number
  ): BranchLimiterPlan[] {
    const allBranchOptions: BranchLimiterPlan[] = buildBranchLimiterOptions(
      fuel,
      this.inputSource.id,
      this.validDenominators,
      this.excludeItemGateLimiter
    );
    const maxSinglePower = gap + this.maxWaste + 10;
    const pruned = allBranchOptions
      .filter(
        (o) =>
          o.power > 0 &&
          o.power <= maxSinglePower &&
          Number.isFinite(o.branchInterval) &&
          o.branchInterval > 0 &&
          o.branchInterval <= MAX_BRANCH_INTERVAL
      )
      .sort((a, b) => {
        if (a.hardwareCost !== b.hardwareCost)
          return a.hardwareCost - b.hardwareCost;
        return a.power - b.power;
      });
    return pruned.length > K ? pruned.slice(0, K) : pruned;
  }

  private _optToBranchConfig(
    opt: BranchLimiterPlan,
    index: number,
    fuel: Fuel
  ) {
    return {
      denominator: opt.denominator,
      localDenominator: opt.localDenominator,
      branchInterval: opt.branchInterval,
      phaseOffsetCells: this.branchPhaseOffsets[index] ?? 0,
      power: opt.power,
      limiterSpeed: opt.limiterSpeed,
      requiresLimiter: opt.requiresLimiter,
      splitterCount: opt.splitterCount,
      description: opt.description,
      fuelId: fuel.id,
      fuel,
      complexity: {
        total: opt.splitterCount.total,
        twoWay: opt.splitterCount.split2,
        threeWay: opt.splitterCount.split3,
      },
    };
  }

  buildMixedSolutionOutput(
    branchConfigs: Array<{
      denominator: number;
      phaseOffsetCells?: number;
      power?: number;
      limiterSpeed?: number | null;
      requiresLimiter?: boolean;
      localDenominator?: number;
      branchInterval?: number;
      splitterCount?: { split2: number; split3: number; total: number };
      description?: string;
      fuelId?: string;
      fuel?: Fuel;
      complexity?: { total: number; twoWay: number; threeWay: number };
    }>,
    result: SimulateCycleSuccess,
    primaryFuel: Fuel
  ): OscillatingSolutionInput {
    const totalSplitters = branchConfigs.reduce(
      (sum, b) => sum + (b.splitterCount?.total ?? 0),
      0
    );
    return {
      fuel: primaryFuel,
      isPrimary: true,
      isMixed: true,
      branches: branchConfigs.map((branchConfig) => ({
        denominator: branchConfig.denominator,
        phaseOffsetCells: branchConfig.phaseOffsetCells,
        power: branchConfig.power,
        limiterSpeed: branchConfig.limiterSpeed,
        requiresLimiter: branchConfig.requiresLimiter,
        localDenominator: branchConfig.localDenominator,
        branchInterval: branchConfig.branchInterval,
        splitterCount: branchConfig.splitterCount,
        description: branchConfig.description,
        fuelId: branchConfig.fuelId ?? branchConfig.fuel?.id ?? primaryFuel.id,
        fuel: branchConfig.fuel,
        complexity: branchConfig.complexity,
        blueprint: buildBranchBlueprint(
          branchConfig.complexity?.threeWay ?? 0,
          branchConfig.complexity?.twoWay ?? 0,
          this.excludeBelt
        ),
      })),
      branchCount: branchConfigs.length,
      totalSplitters,
      period: result.period ?? 0,
      avgPower: result.avgPower ?? 0,
      waste: result.waste ?? 0,
      variance: result.variance ?? 0,
      minBattery: result.minBattery ?? 0,
      minBatteryPercent: result.minBatteryPercent ?? 0,
      batteryLog: result.batteryLog ?? [],
      powerLog: result.powerLog ?? [],
      burnStateLog: result.burnStateLog ?? [],
      preciseBatteryLog: result.preciseBatteryLog ?? [],
      precisePowerLog: result.precisePowerLog ?? [],
      preciseBurnStateLog: result.preciseBurnStateLog ?? [],
    };
  }

  calculateMixedOscillatingPlans(baseConfig: {
    totalPower: number;
  }): OscillatingSolutionInput[] {
    if (this._isZeroInputRate()) return [];
    if (!this.secondaryFuel) return [];
    const gap = this.targetPower - baseConfig.totalPower;
    if (gap <= 0) return [];

    const primary = this.primaryFuel;
    const secondary = this.secondaryFuel;
    const solutions: OscillatingSolutionInput[] = [];
    const MAX_SIM_CALLS = 300;
    let simCount = 0;

    const tryCombo = (opts: BranchLimiterPlan[], fuels: Fuel[]): boolean => {
      // returns true if budget exhausted
      if (simCount >= MAX_SIM_CALLS) return true;
      const theoryPower = opts.reduce((sum, o) => sum + o.power, 0);
      const theoryWaste =
        baseConfig.totalPower + theoryPower - this.targetPower;
      if (theoryWaste < 0 || theoryWaste > this.maxWaste + 10) return false;

      const branchConfigs = opts.map((opt, i) =>
        this._optToBranchConfig(opt, i, fuels[i])
      );
      simCount += 1;
      const result = this.simulator.simulateCycle(
        baseConfig,
        branchConfigs,
        primary // fallback; per-branch fuel used inside
      );
      if (
        result.success &&
        result.waste != null &&
        result.waste >= 0 &&
        result.waste <= this.maxWaste
      ) {
        solutions.push(
          this.buildMixedSolutionOutput(branchConfigs, result, primary)
        );
      }
      return simCount >= MAX_SIM_CALLS;
    };

    // 2-branch: 1P + 1S，池 Top-24
    if (this.maxBranches >= 2) {
      const pOpts = this.getPrunedBranchOptions(primary, gap, 24);
      const sOpts = this.getPrunedBranchOptions(secondary, gap, 24);
      outer2: for (const po of pOpts) {
        for (const so of sOpts) {
          if (tryCombo([po, so], [primary, secondary])) break outer2;
        }
      }
    }

    // 3-branch: 2P+1S 与 1P+2S，池 Top-16，共享 sim 预算
    if (this.maxBranches >= 3 && simCount < MAX_SIM_CALLS) {
      const pOpts = this.getPrunedBranchOptions(primary, gap, 16);
      const sOpts = this.getPrunedBranchOptions(secondary, gap, 16);

      // 2P + 1S
      outer3a: for (let i = 0; i < pOpts.length; i += 1) {
        for (let j = i; j < pOpts.length; j += 1) {
          for (const so of sOpts) {
            if (
              tryCombo([pOpts[i], pOpts[j], so], [primary, primary, secondary])
            )
              break outer3a;
          }
        }
      }

      // 1P + 2S
      if (simCount < MAX_SIM_CALLS) {
        outer3b: for (const po of pOpts) {
          for (let i = 0; i < sOpts.length; i += 1) {
            for (let j = i; j < sOpts.length; j += 1) {
              if (
                tryCombo(
                  [po, sOpts[i], sOpts[j]],
                  [primary, secondary, secondary]
                )
              )
                break outer3b;
            }
          }
        }
      }
    }

    return solutions;
  }

  _buildSolutionSignature(solution: OscillatingSolutionInput): string {
    const round = (value: number, digits: number): number => {
      const factor = 10 ** digits;
      return Math.round(value * factor) / factor;
    };

    const branchKey = (solution.branches || [])
      .map((b) => {
        const fid = b.fuelId ?? b.fuel?.id ?? solution.fuel.id;
        const d = b.denominator;
        const lim =
          b.limiterSpeed == null || !Number.isFinite(b.limiterSpeed)
            ? "n"
            : String(b.limiterSpeed);
        return fid + ":" + d + ":" + lim;
      })
      .join(",");

    return [
      solution.isMixed ? "mix" : "mono",
      branchKey,
      solution.branchCount,
      round(solution.avgPower, 1),
      round(solution.waste, 1),
      round(solution.variance, 2),
      round(solution.minBatteryPercent, 1),
    ].join("|");
  }

  solve(): SolutionResult[] {
    const layered = this.calculateBasePower();
    const baseConfig = {
      generators: layered.generators,
      totalPower: layered.totalPower,
      belts: layered.belts,
    };
    const layeredBaseDetails = layered.baseDetails;
    const layeredBaseFuelPerSec = layered.baseFuelPerSec;

    // 纯常驻直达方案：仍用旧 _getDirectBaseConfigs（主燃料满载枚举）。
    // 若用户启用了手动常驻分层，则不再混入旧式「仅主燃料」直达枚举，避免双重常驻语义冲突。
    const useLayeredOnly =
      this.manualBaseLines.length > 0 || this.autoPlanBasePools === false;

    const directBaseOutputs = useLayeredOnly
      ? (() => {
          const waste = baseConfig.totalPower - this.targetPower;
          if (waste < 0 || waste > this.maxWaste) return [] as SolutionResult[];
          const fuelBOM = buildUnifiedBOM(
            layeredBaseDetails,
            null,
            0,
            this.primaryFuel,
            this.secondaryFuel,
            this.fuelOverrides
          );
          return [
            buildSolutionOutput({
              baseConfig,
              primaryFuel: this.primaryFuel,
              targetPower: this.targetPower,
              inputInterval: this.inputInterval,
              inputSourceId: this.inputSource.id,
              rateLimitPerMin: null,
              isRateLimited: false,
              excludeBelt: this.excludeBelt,
              batteryCapacity: this.batteryCapacity,
              baseFuelPerSec: layeredBaseFuelPerSec,
              solution: null,
              oscillatingFuelPerSec: 0,
              baseDetails: layeredBaseDetails,
              fuelBOM,
            }),
          ];
        })()
      : this._getDirectBaseConfigs().map((directBaseConfig) => {
          const baseFuelPerSec =
            directBaseConfig.generators > 0
              ? directBaseConfig.generators / this.primaryFuel.burnTime
              : 0;
          // 旧路径：用 direct 台数合成简易 baseDetails，保持 BOM 可用
          const autoCount = directBaseConfig.generators;
          const details: BasePowerDetails = {
            corePower: CONSTANTS.BASE_POWER,
            manualLines: [],
            autoBaseCount: autoCount,
            autoBaseFuel: autoCount > 0 ? this.primaryFuel : undefined,
            totalBasePower: directBaseConfig.totalPower,
          };
          const fuelBOM = buildUnifiedBOM(
            details,
            null,
            0,
            this.primaryFuel,
            this.secondaryFuel,
            this.fuelOverrides
          );
          return buildSolutionOutput({
            baseConfig: directBaseConfig,
            primaryFuel: this.primaryFuel,
            targetPower: this.targetPower,
            inputInterval: this.inputInterval,
            inputSourceId: this.inputSource.id,
            rateLimitPerMin: null,
            isRateLimited: false,
            excludeBelt: this.excludeBelt,
            batteryCapacity: this.batteryCapacity,
            baseFuelPerSec,
            solution: null,
            oscillatingFuelPerSec: 0,
            baseDetails: details,
            fuelBOM,
          });
        });

    const allOscillatingSolutions: OscillatingSolutionInput[] = [];
    if (baseConfig.totalPower < this.targetPower) {
      const mode = this.multiFuelMode ?? "auto";
      const hasSecondary = Boolean(this.secondaryFuel);

      if (mode === "primaryOnly" || !hasSecondary) {
        allOscillatingSolutions.push(
          ...this.calculateOscillatingPlans(this.primaryFuel, baseConfig, true)
        );
      } else if (mode === "secondaryOnly") {
        allOscillatingSolutions.push(
          ...this.calculateOscillatingPlans(
            this.secondaryFuel!,
            baseConfig,
            false
          )
        );
      } else if (mode === "mixed") {
        allOscillatingSolutions.push(
          ...this.calculateMixedOscillatingPlans(baseConfig)
        );
      } else if (mode === "legacy") {
        // 主+副各自单燃料全枚举，不跑混合
        allOscillatingSolutions.push(
          ...this.calculateOscillatingPlans(this.primaryFuel, baseConfig, true)
        );
        allOscillatingSolutions.push(
          ...this.calculateOscillatingPlans(
            this.secondaryFuel!,
            baseConfig,
            false
          )
        );
      } else {
        // auto（默认）：主 + 副 + 混合联合竞争
        allOscillatingSolutions.push(
          ...this.calculateOscillatingPlans(this.primaryFuel, baseConfig, true)
        );
        allOscillatingSolutions.push(
          ...this.calculateOscillatingPlans(
            this.secondaryFuel!,
            baseConfig,
            false
          )
        );
        allOscillatingSolutions.push(
          ...this.calculateMixedOscillatingPlans(baseConfig)
        );
      }
    }

    const uniqueSolutions: OscillatingSolutionInput[] = [];
    const seenSignatures = new Set<string>();
    for (const solution of allOscillatingSolutions) {
      const signature = this._buildSolutionSignature(solution);
      if (seenSignatures.has(signature)) {
        continue;
      }
      seenSignatures.add(signature);
      uniqueSolutions.push(solution);
    }

    const outputs: SolutionResult[] = [...directBaseOutputs];
    for (const solution of uniqueSolutions) {
      const oscillatingFuelPerSec = solution.branches
        ? solution.branches.reduce(
            (
              sum: number,
              branch: {
                denominator: number;
                branchInterval?: number;
                localDenominator?: number;
              }
            ) =>
              (() => {
                const branchInterval =
                  branch.branchInterval != null &&
                  Number.isFinite(branch.branchInterval) &&
                  branch.branchInterval > 0
                    ? branch.branchInterval
                    : this.inputInterval *
                      (branch.localDenominator ?? branch.denominator);
                if (
                  branchInterval === Infinity ||
                  branchInterval <= 0 ||
                  !Number.isFinite(branchInterval)
                ) {
                  return sum;
                }
                return sum + 1 / branchInterval;
              })(),
            0
          )
        : 0;

      const branchLimits = (solution.branches || [])
        .map((b) => b.limiterSpeed)
        .filter((v): v is number => v != null && Number.isFinite(v));
      const anyLimited = (solution.branches || []).some(
        (b) => b.requiresLimiter
      );
      const oscAvgPower = (solution.branches || []).reduce(
        (sum, branch) => sum + (branch.power ?? 0),
        0
      );
      const fuelBOM = buildUnifiedBOM(
        layeredBaseDetails,
        solution.fuel,
        oscillatingFuelPerSec,
        this.primaryFuel,
        this.secondaryFuel,
        this.fuelOverrides,
        oscAvgPower,
        solution.branches,
        this.inputInterval
      );
      outputs.push(
        buildSolutionOutput({
          baseConfig,
          primaryFuel: this.primaryFuel,
          targetPower: this.targetPower,
          inputInterval: this.inputInterval,
          inputSourceId: this.inputSource.id,
          rateLimitPerMin:
            branchLimits.length === 1
              ? branchLimits[0]
              : anyLimited
              ? branchLimits[0] ?? null
              : null,
          isRateLimited: anyLimited,
          excludeBelt: this.excludeBelt,
          batteryCapacity: this.batteryCapacity,
          baseFuelPerSec: layeredBaseFuelPerSec,
          solution,
          oscillatingFuelPerSec,
          baseDetails: layeredBaseDetails,
          fuelBOM,
        })
      );
    }

    const secondaryId = this.secondaryFuel?.id;
    outputs.sort((a, b) => {
      // 1. waste，5W 容差
      const wasteDiff = a.waste - b.waste;
      if (Math.abs(wasteDiff) > 5.0) {
        return wasteDiff;
      }
      // 2. totalSplitters（限流器紧凑优先）
      if (a.totalSplitters !== b.totalSplitters) {
        return a.totalSplitters - b.totalSplitters;
      }
      // 3. branchCount
      if (a.branchCount !== b.branchCount) {
        return a.branchCount - b.branchCount;
      }
      // 4. 副燃料震荡消耗速率（跨区负担）
      if (secondaryId && secondaryId !== "none") {
        const aSubRate =
          a.fuelBOM?.find((f) => f.fuelId === secondaryId)?.oscRatePerMin ?? 0;
        const bSubRate =
          b.fuelBOM?.find((f) => f.fuelId === secondaryId)?.oscRatePerMin ?? 0;
        if (Math.abs(aSubRate - bSubRate) > 1e-4) {
          return aSubRate - bSubRate;
        }
      }
      // 5. variance
      return a.variance - b.variance;
    });

    return outputs.slice(0, 5);
  }
}
