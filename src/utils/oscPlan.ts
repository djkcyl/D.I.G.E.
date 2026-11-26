import type { Fuel } from "./constants";
import {
  BELT_ITEMS_PER_MINUTE,
  branchItemsPerMinute,
  branchLossFraction,
  branchWatt,
  DEFAULT_DEVICE_LIMIT,
  DEFAULT_LOSS_TOLERANCE,
  deviceCostOfDenominator,
  fullSpeedPerMinute,
  ITEM_LOSS_PER_WINDOW,
  ITEM_LOSS_WINDOW_MINUTES,
  maxDenominatorForDeviceLimit,
  maxDenominatorForLossTolerance,
} from "./oscBudget";

/** 支路数上限（与 PARAM_LIMITS.MAX_BRANCHES 对齐，避免循环依赖） */
export const DEFAULT_MAX_BRANCHES = 3;

/** 单支路规划明细 */
export interface OscBranchPlan {
  denominator: number;
  watt: number;
  /** 该支路实际被消耗的投料速率（个/分，已按满速封顶） */
  itemsPerMinute: number;
  deviceCost: number;
  lossFraction: number;
}

export interface OscPoolPlan {
  fuelId: string;
  branches: OscBranchPlan[];
  totalWatt: number;
  deviceCost: number;
  /** 各取货口起点的吞物品损耗叠加（个/分）：每支 1/30 */
  totalLossPerMinute: number;
  /** 损耗占母带实际供料的比例 */
  lossFraction: number;
  deviceLimit: number;
  lossTolerance: number;
}

/** 每 30 分钟丢 1 个 → 每分钟 1/30 个 */
export const LOSS_ITEMS_PER_MINUTE =
  ITEM_LOSS_PER_WINDOW / ITEM_LOSS_WINDOW_MINUTES;

export interface OscPlanOptions {
  deviceLimit?: number;
  lossTolerance?: number;
  beltPerMinute?: number;
  maxBranches?: number;
}

/** 单支路明细（母带速率按满速封顶） */
export function buildBranchPlan(
  fuel: Fuel,
  denominator: number,
  beltPerMinute: number = BELT_ITEMS_PER_MINUTE,
): OscBranchPlan {
  const cost = deviceCostOfDenominator(denominator);
  return {
    denominator,
    watt: branchWatt(fuel, denominator, beltPerMinute),
    itemsPerMinute: Math.min(
      branchItemsPerMinute(denominator, beltPerMinute),
      fullSpeedPerMinute(fuel),
    ),
    deviceCost: cost?.total ?? 0,
    lossFraction: branchLossFraction(fuel, denominator, beltPerMinute),
  };
}

/** 由若干支路分母合成一个方案：功率按路求和，损耗按路叠加 */
export function buildPoolPlan(
  fuel: Fuel,
  denominators: number[],
  options: OscPlanOptions = {},
): OscPoolPlan {
  const beltPerMinute = options.beltPerMinute ?? BELT_ITEMS_PER_MINUTE;
  const branches = denominators.map((d) =>
    buildBranchPlan(fuel, d, beltPerMinute),
  );
  const totalWatt = branches.reduce((sum, b) => sum + b.watt, 0);
  const delivered = branches.reduce((sum, b) => sum + b.itemsPerMinute, 0);
  const totalLossPerMinute = branches.length * LOSS_ITEMS_PER_MINUTE;
  return {
    fuelId: fuel.id,
    branches,
    totalWatt,
    deviceCost: branches.reduce((sum, b) => sum + b.deviceCost, 0),
    totalLossPerMinute,
    lossFraction:
      delivered + totalLossPerMinute > 0
        ? totalLossPerMinute / (delivered + totalLossPerMinute)
        : 0,
    deviceLimit: options.deviceLimit ?? DEFAULT_DEVICE_LIMIT,
    lossTolerance: options.lossTolerance ?? DEFAULT_LOSS_TOLERANCE,
  };
}

interface PlanBounds {
  floorD: number;
  capD: number;
  deviceMaxD: number;
}

function planBounds(fuel: Fuel, options: OscPlanOptions): PlanBounds {
  const deviceLimit = options.deviceLimit ?? DEFAULT_DEVICE_LIMIT;
  const lossTolerance = options.lossTolerance ?? DEFAULT_LOSS_TOLERANCE;
  const beltPerMinute = options.beltPerMinute ?? BELT_ITEMS_PER_MINUTE;
  const deviceMaxD = maxDenominatorForDeviceLimit(deviceLimit);
  const lossMaxD = Math.floor(maxDenominatorForLossTolerance(lossTolerance));
  const floorD = Math.max(
    1,
    Math.floor(
      beltPerMinute / Math.max(fullSpeedPerMinute(fuel), 1e-9) + 1e-9,
    ) + 1,
  );
  return { floorD, capD: Math.min(deviceMaxD, lossMaxD), deviceMaxD };
}

/**
 * 给定支路数，求预算内每路可用的最大分母（即该路最低功率）。
 * 3 路时设备预算被均分，往往只能退回满速档——这正是"3 路一碰就超 50"的原因。
 */
export function affordableDenominator(
  fuel: Fuel,
  branches: number,
  options: OscPlanOptions = {},
): number {
  const deviceLimit = options.deviceLimit ?? DEFAULT_DEVICE_LIMIT;
  const { floorD, capD } = planBounds(fuel, options);
  let pick = 0;
  for (let d = floorD; d <= capD; d += 1) {
    const cost = deviceCostOfDenominator(d);
    if (!cost) continue;
    if (cost.total * Math.max(1, branches) > deviceLimit) continue;
    if (d > pick) pick = d;
  }
  return pick;
}

/**
 * 设备预算下可达到的最低震荡总功率（按路算再求和）。
 *
 * 枚举支路数 k = 1..maxBranches，每路取预算允许的最大分母，
 * 在全部 k 里取总功率最小者（并列时取支路更少的）。
 */
export function minTotalWattPlan(
  fuel: Fuel,
  options: OscPlanOptions = {},
): OscPoolPlan | null {
  const maxBranches = Math.max(1, options.maxBranches ?? DEFAULT_MAX_BRANCHES);
  let best: OscPoolPlan | null = null;

  for (let k = 1; k <= maxBranches; k += 1) {
    const d = affordableDenominator(fuel, k, options);
    if (!d) continue;
    const plan = buildPoolPlan(
      fuel,
      Array.from({ length: k }, () => d),
      options,
    );
    const better =
      !best ||
      plan.totalWatt < best.totalWatt - 1e-9 ||
      (Math.abs(plan.totalWatt - best.totalWatt) <= 1e-9 &&
        plan.branches.length < best.branches.length);
    if (better) best = plan;
  }
  return best;
}

/** 某支路数下的方案上限：每路按满速计 */
export function maxTotalWattForBranches(fuel: Fuel, branches: number): number {
  return fuel.power * Math.max(0, branches);
}

/** 单支震荡所需的最小设备容量（低于它就只能满速） */
export function minDeviceCostForOscillation(
  fuel: Fuel,
  options: OscPlanOptions = {},
): number {
  const { floorD, capD } = planBounds(fuel, options);
  let minCost = Number.POSITIVE_INFINITY;
  for (let d = floorD; d <= Math.max(capD, floorD); d += 1) {
    const cost = deviceCostOfDenominator(d);
    if (cost && cost.total < minCost) minCost = cost.total;
  }
  return minCost;
}
