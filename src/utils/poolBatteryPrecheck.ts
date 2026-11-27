/**
 * 第 3 步：自定义震荡热能池的蓄电预检（纯函数，不依赖 FactoryDesigner，侧栏与 worker 共用）。
 *
 * 池的零头支路是间歇供电：每 cycle = 2·D 秒投 1 个，燃烧 onDuration = min(burnTime, cycle) 秒，
 * 剩下 T_off = cycle − onDuration 秒这条支路完全不出力。
 * 方案的 waste 按平均功率算（平均功率里已含池的零头平均功率 remW），
 * 所以 T_off 期间电网实际缺口 ≈ remW − waste，只能由蓄电池可用电量兜底：
 *
 *   E = capacity × (1 − MIN_BATTERY_CUTOFF%)
 *   (remW − waste) × T_off ≤ E   ⇔   waste ≥ remW − E / T_off = W_need
 *
 * 例：武陵高容池 0.5/分 → 向下取档 1/64，T_off = 128 − 40 = 88s，remW = 2000W，
 *     E = 100000 × 95% = 95000J，W_need ≈ 2000 − 95000/88 ≈ 920.5W。
 *
 * 多池保守估计：remW 相加、T_off 取最大值（等价于假设所有池同时熄火、且都熄火最久）。
 * 真实相位错开时缺口更小，所以这个估计只会多剔除、不会漏剔除。
 *
 * 整体 fail-open：任何异常都返回 null，调用方按「无预检」处理，绝不因预检本身出错而丢解。
 */
import type { CalcParams, SolutionResult } from "../types/calc";
import { MIN_BATTERY_CUTOFF, type SudokuDecisionMatrix } from "../types/matrix";
import { CONSTANTS, resolveFuel } from "./constants";
import { buildSudokuDecisionMatrix } from "./decisionMatrix";
import { normalizeDeviceLimit, poolPowerForRate } from "./oscBudget";

/** 剔除阈值在 W_need 之上再留的裕量（W）：吸收电池初始相位与仿真取整误差 */
export const POOL_SURPLUS_MARGIN_W = 20;

export interface PoolBatteryNeed {
  /** 所有带零头的池的零头平均功率之和（W） */
  remW: number;
  /** 最长的熄火时长（s） */
  tOff: number;
  /** 蓄电池可用电量（J）= 容量 × (1 − 下限%) */
  usableEnergy: number;
  /** 最低富余功率（W）；≤ 0 表示电池足够兜底，不需要富余 */
  wNeed: number;
  /** 参与估计的池数 */
  poolCount: number;
}

export interface PoolPrecheckReport extends PoolBatteryNeed {
  /** 实际剔除阈值 = wNeed + POOL_SURPLUS_MARGIN_W */
  requiredWaste: number;
  /** 预检前候选解数量 */
  total: number;
  /** 被剔除的数量（含下面的 unsimulated） */
  removed: number;
  /** 其中因热能池那一路未真正参与仿真 / 周期不是池进料周期整数倍而剔除的数量 */
  unsimulated?: number;
  /** 候选非空但全部被剔除 */
  allRemoved: boolean;
}

export function computePoolBatteryNeed(
  params: CalcParams,
): PoolBatteryNeed | null {
  try {
    let remW = 0;
    let tOff = 0;
    let poolCount = 0;
    for (const cfg of params.oscPools ?? []) {
      // 过滤口径与 FactoryDesigner 构造函数一致
      if (!cfg || cfg.enabled === false) continue;
      if (!cfg.fuelId || cfg.fuelId === "none") continue;
      const fuel = resolveFuel(cfg.fuelId, params.fuelOverrides);
      if (!fuel) continue;
      const perMin = Number(cfg.maxPerMin) || 0;
      if (!(perMin > 0)) continue;
      const rated = poolPowerForRate(fuel, perMin, {
        deviceLimit: normalizeDeviceLimit(cfg.deviceLimit),
      });
      const d = rated.remainderDenominator;
      if (d == null || !(d > 0) || !(rated.remainderWatt > 0)) continue;
      // 与 FactoryDesigner.poolSegments 同口径：cycle = 2·D，onDuration = min(burnTime, cycle)
      const cycle = 2 * d;
      const off = cycle - Math.min(fuel.burnTime, cycle);
      if (!(off > 0)) continue;
      remW += rated.remainderWatt;
      tOff = Math.max(tOff, off);
      poolCount += 1;
    }
    if (poolCount === 0 || !(tOff > 0)) return null;
    const usableEnergy =
      CONSTANTS.BATTERY_CAPACITY * (1 - MIN_BATTERY_CUTOFF / 100);
    const wNeed = remW - usableEnergy / tOff;
    if (!Number.isFinite(wNeed)) return null;
    return { remW, tOff, usableEnergy, wNeed, poolCount };
  } catch {
    return null;
  }
}

/** 侧栏展示用：至少需要的富余（W，向上取整，含裕量）；不需要时返回 null */
export function poolSurplusHintWatt(
  need: PoolBatteryNeed | null,
): number | null {
  if (!need || !(need.wNeed > 0)) return null;
  return Math.ceil(need.wNeed + POOL_SURPLUS_MARGIN_W);
}

/**
 * 每个会进仿真的池零头支路的进料周期（s）= 2·D。
 * 口径与 FactoryDesigner.poolBranches 一致：remainderDenominator > 0 且 remainderWatt > 0。
 */
export function computePoolFeedCycles(params: CalcParams): number[] {
  try {
    const cycles: number[] = [];
    for (const cfg of params.oscPools ?? []) {
      if (!cfg || cfg.enabled === false) continue;
      if (!cfg.fuelId || cfg.fuelId === "none") continue;
      const fuel = resolveFuel(cfg.fuelId, params.fuelOverrides);
      if (!fuel) continue;
      const perMin = Number(cfg.maxPerMin) || 0;
      if (!(perMin > 0)) continue;
      const rated = poolPowerForRate(fuel, perMin, {
        deviceLimit: normalizeDeviceLimit(cfg.deviceLimit),
      });
      const d = rated.remainderDenominator;
      if (d == null || !(d > 0) || !(rated.remainderWatt > 0)) continue;
      cycles.push(2 * d);
    }
    return cycles;
  } catch {
    return [];
  }
}

export interface PoolSimShape {
  period?: number;
  branchCount?: number;
  burnStateLog?: unknown[];
}

/**
 * 热能池那一路是否真的参与了电量仿真：
 * 1. period 必须是每个池进料周期的整数倍（只看系统分支的周期，例如 90s 对 128s，说明池没进仿真）；
 * 2. burnStateLog 的行数 ≥ 系统分支数 + 池分支数（每条进入 oscillatingBranches 的支路各占一行）。
 * 不满足的方案，其 minBattery 是把池当恒定功率算出来的，不能算可行。
 * 没有 period 字段的对象（自测桩）不做判断。
 */
export function isPoolBranchSimulated(
  sol: PoolSimShape,
  cycles: number[],
): boolean {
  if (cycles.length === 0) return true;
  const period = sol.period;
  if (typeof period !== "number") return true;
  if (!(period > 0) || !Number.isFinite(period)) return false;
  for (const c of cycles) {
    const k = period / c;
    const n = Math.round(k);
    if (n < 1 || Math.abs(k - n) > 1e-6) return false;
  }
  if (Array.isArray(sol.burnStateLog)) {
    const branches = Number(sol.branchCount) || 0;
    if (sol.burnStateLog.length < branches + cycles.length) return false;
  }
  return true;
}

/**
 * 按预检剔除不可行的解：
 * - 热能池那一路没有真正参与仿真的解（见 isPoolBranchSimulated）；
 * - waste 不足以让电池撑过池熄火的解。
 * fail-open：出错时原样返回、report 为 null。
 */
export function filterByPoolBattery<T extends { waste: number } & PoolSimShape>(
  params: CalcParams,
  candidates: T[],
): { kept: T[]; report: PoolPrecheckReport | null } {
  try {
    const cycles = computePoolFeedCycles(params);
    const simulated = candidates.filter((s) =>
      isPoolBranchSimulated(s, cycles),
    );
    const unsimulated = candidates.length - simulated.length;
    const need = computePoolBatteryNeed(params);
    if (!need || !(need.wNeed > 0)) {
      if (unsimulated === 0) return { kept: candidates, report: null };
      const usableEnergy =
        CONSTANTS.BATTERY_CAPACITY * (1 - MIN_BATTERY_CUTOFF / 100);
      return {
        kept: simulated,
        report: {
          remW: need?.remW ?? 0,
          tOff: need?.tOff ?? 0,
          usableEnergy: need?.usableEnergy ?? usableEnergy,
          wNeed: need?.wNeed ?? 0,
          poolCount: need?.poolCount ?? cycles.length,
          requiredWaste: 0,
          total: candidates.length,
          removed: unsimulated,
          unsimulated,
          allRemoved: candidates.length > 0 && simulated.length === 0,
        },
      };
    }
    const requiredWaste = need.wNeed + POOL_SURPLUS_MARGIN_W;
    const kept = simulated.filter(
      (s) => Number.isFinite(s.waste) && s.waste >= requiredWaste,
    );
    return {
      kept,
      report: {
        ...need,
        requiredWaste,
        total: candidates.length,
        removed: candidates.length - kept.length,
        unsimulated,
        allRemoved: candidates.length > 0 && kept.length === 0,
      },
    };
  } catch {
    return { kept: candidates, report: null };
  }
}

/**
 * worker 入口：在完整候选集上预检后再建 3×3 矩阵。
 * 全部被剔除时返回空矩阵 + report.allRemoved=true，App 据此给出「至少需要 X W 富余」的原因。
 * fail-open：预检出错时按原候选集建矩阵。
 */
export function solveWithPoolPrecheck(
  params: CalcParams,
  candidates: SolutionResult[],
  secondaryId?: string | null,
): { result: SudokuDecisionMatrix; report: PoolPrecheckReport | null } {
  let kept = candidates;
  let report: PoolPrecheckReport | null = null;
  try {
    const filtered = filterByPoolBattery(params, candidates);
    kept = filtered.kept;
    report = filtered.report;
  } catch {
    kept = candidates;
    report = null;
  }
  return { result: buildSudokuDecisionMatrix(kept, secondaryId), report };
}

// ── 外层降档：无解时逐步降低自定义池投料量 ─────────────────────────────

/** 每次降档的投料量（个/分） */
export const POOL_DOWNGRADE_STEP = 0.1;
/** 降档最多求解次数（防止超大投料量时求解次数失控） */
export const POOL_DOWNGRADE_MAX_ATTEMPTS = 400;

type PoolCfg = NonNullable<CalcParams["oscPools"]>[number];
type PoolFuel = NonNullable<ReturnType<typeof resolveFuel>>;

/**
 * - full：按申请量求解成功，未降档
 * - downgraded：降档后求解成功（含降到 0）
 * - exhausted：降到 0（或达到尝试上限）仍无解
 * - inactive：池未参与计算（关闭 / 空槽 / 燃料无效 / 投料量 ≤ 0）
 */
export type PoolUsageReason = "full" | "downgraded" | "exhausted" | "inactive";

export interface PoolUsageEntry {
  id: string;
  fuelId: string;
  /** 申请投料量（个/分）；未参与计算的池为 0 */
  requested: number;
  /** 实际采用的投料量上限（个/分） */
  used: number;
  /** requested − used */
  unused: number;
  reason: PoolUsageReason;
}

export interface PoolUsage {
  /** 所有参与计算的池的申请量之和 */
  requested: number;
  used: number;
  unused: number;
  reason: PoolUsageReason;
  /** 每个池的明细（与 params.oscPools 同序） */
  pools: PoolUsageEntry[];
}

export interface PoolDowngradeSolveOutput {
  candidates: SolutionResult[];
  secondaryId?: string | null;
}

export interface PoolDowngradeResult {
  result: SudokuDecisionMatrix;
  report: PoolPrecheckReport | null;
  poolUsage: PoolUsage | null;
  /** 实际求解次数 */
  attempts: number;
}

export interface ActivePool {
  index: number;
  fuel: PoolFuel;
  deviceLimit: number;
  requested: number;
}

const roundQty = (v: number) => Math.round(v * 1000) / 1000;

/** 降一档：先吸附到 0.1 网格再减 0.1，最低 0（1.8→1.7，1.85→1.8，0.05→0） */
export function stepDownPoolRate(value: number): number {
  if (!(value > 0)) return 0;
  const tenths = Math.ceil(value * 10 - 1e-6) - 1;
  return Math.max(0, tenths / 10);
}

/** 过滤口径与 FactoryDesigner 构造函数一致；同燃料的多个池各自独立，不合并 */
function collectActivePools(
  params: CalcParams,
  pools: PoolCfg[],
): ActivePool[] {
  const out: ActivePool[] = [];
  pools.forEach((cfg, index) => {
    if (!cfg || cfg.enabled === false) return;
    if (!cfg.fuelId || cfg.fuelId === "none") return;
    const fuel = resolveFuel(cfg.fuelId, params.fuelOverrides);
    if (!fuel) return;
    const perMin = Number(cfg.maxPerMin) || 0;
    if (!(perMin > 0)) return;
    out.push({
      index,
      fuel,
      deviceLimit: normalizeDeviceLimit(cfg.deviceLimit),
      requested: perMin,
    });
  });
  return out;
}

/** 当前投料量下功率最大的池（并列取靠前的）；全部为 0 时返回 −1 */
function pickLargestPool(active: ActivePool[], current: number[]): number {
  let best = -1;
  let bestWatt = -1;
  active.forEach((a, k) => {
    const rate = current[k];
    if (!(rate > 0)) return;
    let watt = 0;
    try {
      watt = poolPowerForRate(a.fuel, rate, {
        deviceLimit: a.deviceLimit,
      }).watt;
    } catch {
      watt = 0;
    }
    if (!Number.isFinite(watt)) watt = 0;
    if (watt > bestWatt) {
      bestWatt = watt;
      best = k;
    }
  });
  return best;
}

function withPoolRates(
  params: CalcParams,
  pools: PoolCfg[],
  active: ActivePool[],
  current: number[],
): CalcParams {
  const next = pools.map((cfg) => (cfg ? { ...cfg } : cfg));
  active.forEach((a, k) => {
    next[a.index] = { ...next[a.index], maxPerMin: current[k] };
  });
  return { ...params, oscPools: next };
}

export function buildPoolUsage(
  pools: PoolCfg[],
  active: ActivePool[],
  current: number[],
  exhausted: boolean,
): PoolUsage {
  const entries: PoolUsageEntry[] = pools.map((cfg, index) => {
    const id = String(cfg?.id ?? index);
    const fuelId = String(cfg?.fuelId ?? "none");
    const k = active.findIndex((a) => a.index === index);
    if (k < 0) {
      return {
        id,
        fuelId,
        requested: 0,
        used: 0,
        unused: 0,
        reason: "inactive",
      };
    }
    const requested = roundQty(active[k].requested);
    const used = exhausted ? 0 : roundQty(current[k]);
    const unused = roundQty(Math.max(0, requested - used));
    const reason: PoolUsageReason = exhausted
      ? "exhausted"
      : unused > 1e-9
        ? "downgraded"
        : "full";
    return { id, fuelId, requested, used, unused, reason };
  });
  const live = entries.filter((e) => e.reason !== "inactive");
  const requested = roundQty(live.reduce((s, e) => s + e.requested, 0));
  const used = roundQty(live.reduce((s, e) => s + e.used, 0));
  const reason: PoolUsageReason =
    live.length === 0
      ? "inactive"
      : exhausted
        ? "exhausted"
        : live.some((e) => e.reason === "downgraded")
          ? "downgraded"
          : "full";
  return {
    requested,
    used,
    unused: roundQty(Math.max(0, requested - used)),
    reason,
    pools: entries,
  };
}

/** 把 poolUsage 挂到每个方案与决策盘格子上（格子与 solutions 可能是同一对象，重复赋值无副作用） */
function attachPoolUsage(result: SudokuDecisionMatrix, usage: PoolUsage): void {
  for (const s of result.solutions ?? []) {
    if (s && typeof s === "object") (s as SolutionResult).poolUsage = usage;
  }
  const grid = (result as { matrix?: unknown }).matrix;
  if (!Array.isArray(grid)) return;
  for (const row of grid) {
    if (!Array.isArray(row)) continue;
    for (const cell of row) {
      if (cell && typeof cell === "object") {
        (cell as Record<string, unknown>).poolUsage = usage;
      }
    }
  }
}

/**
 * 外层降档：先按申请量求解；无解时把「当前功率最大的池」降 0.1/分 再求解，
 * 直到有解或所有池降到 0。降到 0 仍无解 → 返回空结果，交给现有诊断弹窗
 * （report 取第一次求解的预检结果，保证诊断仍能给出富余提示）。
 *
 * 求解器通过回调注入，本模块不导入 FactoryDesigner。
 * fail-open：池配置解析出错时只按原参数求解一次，poolUsage 为 null。
 */
export function solveWithPoolDowngrade(
  params: CalcParams,
  solve: (p: CalcParams) => PoolDowngradeSolveOutput,
  options: { maxAttempts?: number } = {},
): PoolDowngradeResult {
  const run = (p: CalcParams) => {
    const out = solve(p);
    return solveWithPoolPrecheck(p, out.candidates ?? [], out.secondaryId);
  };

  let pools: PoolCfg[] | null = null;
  let active: ActivePool[] = [];
  try {
    pools = Array.isArray(params.oscPools) ? [...params.oscPools] : null;
    active = pools ? collectActivePools(params, pools) : [];
  } catch {
    pools = null;
    active = [];
  }

  if (!pools || active.length === 0) {
    const once = run(params);
    const poolUsage = pools ? buildPoolUsage(pools, [], [], false) : null;
    if (poolUsage && pools && pools.length > 0) {
      attachPoolUsage(once.result, poolUsage);
    }
    return { ...once, poolUsage, attempts: 1 };
  }

  const poolCfgs: PoolCfg[] = pools;
  const maxAttempts = Math.max(
    1,
    Math.floor(options.maxAttempts ?? POOL_DOWNGRADE_MAX_ATTEMPTS),
  );
  const current = active.map((a) => a.requested);
  let attempts = 0;
  let firstReport: PoolPrecheckReport | null = null;
  let exhausted = false;
  let last: ReturnType<typeof run>;

  for (;;) {
    last = run(withPoolRates(params, poolCfgs, active, current));
    attempts += 1;
    if (attempts === 1) firstReport = last.report;
    if (last.result.solutions.length > 0) break;
    const k = pickLargestPool(active, current);
    if (k < 0 || attempts >= maxAttempts) {
      exhausted = true;
      break;
    }
    current[k] = stepDownPoolRate(current[k]);
  }

  const poolUsage = buildPoolUsage(poolCfgs, active, current, exhausted);
  if (exhausted) {
    // 降到 0 仍无解：last.result 本身就是空矩阵；report 用第一次（满额）的预检结果，供诊断弹窗给富余提示
    return { result: last.result, report: firstReport, poolUsage, attempts };
  }
  attachPoolUsage(last.result, poolUsage);
  return { result: last.result, report: last.report, poolUsage, attempts };
}
