/**
 * 自定义震荡热能池「电池预检把候选剔光」之后的调整链（纯函数）。
 *
 * 一句话定位：预检剔光导致无解时，按「放宽冗余上限 → 降投料 → 升投料」依次重试，
 * 任一步有解就停。求解 / 预检 / 建盘全部回调注入（写法参照 solveWithPoolDowngrade），
 * 本模块不导入 FactoryDesigner，也不改 poolBatteryPrecheck。
 *
 * 规则：
 * 1. 只在「有启用的自定义池」且「候选非空、被预检全部剔除」时进入；候选本来为空直接返回。
 * 2. 放宽冗余上限：投料保持原值；基准 = max(GAME_CONFIG.solver.maxWaste, params.maxWaste)；
 *    档位是绝对值 MAX_WASTE_RELAX_TIERS_W，基准 ≥ 某档则跳过该档。
 * 3. 降投料：冗余上限回到基准，从原值每次 −0.1/分 直到 0；降到 0 = 不用这个池，
 *    （没有别的启用池时）跳过预检直接普通求解。
 * 4. 升投料：冗余上限为基准，从原值每次 +0.1/分 直到目标池燃料的 1 台满速
 *    （splitPoolFeedForFuel().fullSpeedPerMin；40s 电池 = 1.5/分 → 1 台满速常驻、零头 0）。
 * 5. 投料一律经 poolFeedSplit.toFeedTenths 换成整数十分位（tenths）后整数步进，
 *    避免 0.1 累加的浮点漂移。
 * 6. 整条链共用一个 deadline（每次求解前检查），超时返回 { timedOut: true, lastStep }；
 *    链内任何回调抛错 → fail-open，退回原结果。
 */
import { GAME_CONFIG } from "../config/game";
import type { CalcParams, OscPoolConfig, SolutionResult } from "../types/calc";
import type { SudokuDecisionMatrix } from "../types/matrix";
import { resolveFuel } from "./constants";
import { buildSudokuDecisionMatrix, compareSolutions } from "./decisionMatrix";
import type { PoolPrecheckReport } from "./poolBatteryPrecheck";
import {
  POOL_FEED_MAX_TENTHS,
  splitPoolFeedForFuel,
  toFeedTenths,
} from "./poolFeedSplit";
import { SOLVE_TIMEOUT_MS } from "./solveTimeout";

/** 放宽冗余上限的绝对档位（W） */
export const MAX_WASTE_RELAX_TIERS_W: readonly number[] = [2000, 3000];
/**
 * 整条链默认预算（ms）。取 App 侧 SOLVE_TIMEOUT_MS 的 80%，
 * 保证链先于 App terminate worker 停下并把 timedOut 带回去。
 */
export const POOL_ADJUST_BUDGET_MS = Math.floor(SOLVE_TIMEOUT_MS * 0.8);

export type PoolAdjustDirection = "none" | "down" | "up";
export type PoolAdjustAttemptKind = "initial" | "wasteRelax" | "down" | "up";

/** 一次求解尝试（诊断弹窗逐行列出） */
export interface PoolAdjustAttempt {
  /** 第几次求解（从 1 开始，含 initial） */
  index: number;
  kind: PoolAdjustAttemptKind;
  /** 本次求解使用的冗余上限（W） */
  maxWaste: number;
  /** 目标池投料量（个/分）= rateTenths / 10 */
  ratePerMin: number;
  rateTenths: number;
  /** 预检前候选数（求解器原始候选） */
  candidatesBefore: number;
  /** 预检后候选数；未跑预检时等于 candidatesBefore */
  candidatesAfter: number;
  /** 本次是否跑了预检（降到 0 且无其他启用池时跳过） */
  prechecked: boolean;
  /** 建盘后可展示的方案数（> 0 即视为可行） */
  solutions: number;
  /** 自链开始起累计耗时（ms） */
  elapsedMs: number;
}

export interface PoolAdjustInfo {
  direction: PoolAdjustDirection;
  fromPerMin: number;
  toPerMin: number;
  /** 仅 up：UI 显示「需要实际产出 ≥ X/分 才成立」 */
  requiredActualRatePerMin?: number;
}

export interface WasteRelaxInfo {
  /** 求解器实际生效的基准上限（W） */
  base: number;
  /** 找到解时使用的档位（W） */
  used: number;
}

export interface PoolAdjustSolveContext {
  kind: PoolAdjustAttemptKind;
  /** 本次应生效的冗余上限（W）；params.maxWaste 也已同步写入 */
  maxWaste: number;
  rateTenths: number;
  /** 目标池在 params.oscPools 中的下标；-1 = 无目标池 */
  poolIndex: number;
}

export interface PoolAdjustSolveOutput {
  candidates: SolutionResult[];
  secondaryId?: string | null;
}

export interface PoolAdjustPrecheckOutput {
  kept: SolutionResult[];
  report: PoolPrecheckReport | null;
}

export interface PoolAdjustDeps {
  solve: (
    params: CalcParams,
    ctx: PoolAdjustSolveContext,
  ) => PoolAdjustSolveOutput;
  /** worker 里传 filterByPoolBattery */
  precheck: (
    params: CalcParams,
    candidates: SolutionResult[],
  ) => PoolAdjustPrecheckOutput;
  /** 缺省 buildSudokuDecisionMatrix */
  build?: (
    kept: SolutionResult[],
    secondaryId?: string | null,
  ) => SudokuDecisionMatrix;
  /** 缺省 Date.now；自测注入假时钟 */
  now?: () => number;
}

export interface PoolAdjustOptions {
  /** 相对链开始的预算（ms），缺省 POOL_ADJUST_BUDGET_MS */
  timeoutMs?: number;
  /** 绝对截止时间（now() 口径）；给了就优先于 timeoutMs */
  deadline?: number;
  /** 指定调整哪个池；缺省取第一个启用池 */
  poolIndex?: number;
}

export interface PoolAdjustChainResult {
  result: SudokuDecisionMatrix;
  /** 采用那次尝试的预检报告；未找到解时为初次求解的报告（供诊断给富余提示） */
  report: PoolPrecheckReport | null;
  wasteRelax?: WasteRelaxInfo;
  poolAdjust: PoolAdjustInfo;
  trace: PoolAdjustAttempt[];
  /** 是否进入了调整链 */
  triggered: boolean;
  /** 链全部走完仍无解 */
  exhausted?: boolean;
  timedOut?: boolean;
  /** 超时时最后完成的一次尝试 */
  lastStep?: PoolAdjustAttempt | null;
  /** fail-open 时的错误信息 */
  error?: string;
}

// ── 工具函数 ──────────────────────────────────────────────────────

/** 投料量 → 整数十分位（≤0 / 非法 → 0）；与 poolFeedSplit 同口径 */
export function toRateTenths(value: unknown): number {
  return toFeedTenths(value);
}

const tenthsToRate = (t: number) => t / 10;

/**
 * 限幅**已经折算成十分位**的档位（不是把个/分再换算一次）。
 * 在构造步骤数组前收敛，避免异常大输入产生超长数组。
 */
function clampAdjustTenths(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(POOL_FEED_MAX_TENTHS, Math.round(n));
}

/** 求解器实际生效的冗余上限 = max(1200, params.maxWaste) */
export function effectiveMaxWaste(params: CalcParams): number {
  const user = Number(params?.maxWaste);
  return Math.max(
    GAME_CONFIG.solver.maxWaste,
    Number.isFinite(user) ? user : 0,
  );
}

/**
 * 升投料上限（十分位）= 目标池燃料的单台满速投料（splitPoolFeedForFuel().fullSpeedPerMin，
 * 燃料按 params.fuelOverrides 解析，与求解器同口径）。40s 电池 → 15（1.5/分，needsOscillation=false）。
 * 满速不是整十分位时退一档，保证不越过 1 台满速；再受 poolFeedSplit 的输入上限约束。
 * 燃料无效 → 0（不生成升档）。
 */
export function poolUpMaxTenths(params: CalcParams, poolIndex: number): number {
  const cfg = poolIndex >= 0 ? params?.oscPools?.[poolIndex] : undefined;
  if (!cfg?.fuelId || cfg.fuelId === "none") return 0;
  const fuel = resolveFuel(cfg.fuelId, params.fuelOverrides);
  const { fullSpeedPerMin } = splitPoolFeedForFuel(fuel, 0);
  if (!(fullSpeedPerMin > 0)) return 0;
  let t = toFeedTenths(fullSpeedPerMin);
  if (t > 0 && t / 10 > fullSpeedPerMin + 1e-9) t -= 1;
  return Math.min(t, POOL_FEED_MAX_TENTHS);
}

function isPoolActive(cfg: OscPoolConfig | null | undefined): boolean {
  if (!cfg || cfg.enabled === false) return false;
  if (!cfg.fuelId || cfg.fuelId === "none") return false;
  return toRateTenths(cfg.maxPerMin) > 0;
}

/** 调整目标：第一个启用的池；没有返回 -1 */
export function findAdjustTargetPool(params: CalcParams): number {
  const pools = Array.isArray(params?.oscPools) ? params.oscPools : [];
  return pools.findIndex((cfg) => isPoolActive(cfg));
}

function hasOtherActivePool(params: CalcParams, poolIndex: number): boolean {
  const pools = Array.isArray(params?.oscPools) ? params.oscPools : [];
  return pools.some((cfg, i) => i !== poolIndex && isPoolActive(cfg));
}

function withPoolRate(
  params: CalcParams,
  poolIndex: number,
  tenths: number,
  maxWaste: number,
): CalcParams {
  const pools = (params.oscPools ?? []).map((cfg) => (cfg ? { ...cfg } : cfg));
  const cfg = pools[poolIndex];
  pools[poolIndex] =
    tenths > 0
      ? { ...cfg, maxPerMin: tenthsToRate(tenths) }
      : { ...cfg, maxPerMin: 0, enabled: false };
  return { ...params, maxWaste, oscPools: pools };
}

/** 把调整信息挂到方案与决策盘格子上（同一对象重复赋值无副作用） */
function attachAdjust(
  result: SudokuDecisionMatrix,
  poolAdjust: PoolAdjustInfo,
  wasteRelax: WasteRelaxInfo | undefined,
): void {
  const tag = (s: unknown) => {
    if (!s || typeof s !== "object") return;
    const rec = s as Record<string, unknown>;
    rec.poolAdjust = poolAdjust;
    if (wasteRelax) rec.wasteRelax = wasteRelax;
  };
  for (const s of result.solutions ?? []) tag(s);
  const grid = (result as { matrix?: unknown }).matrix;
  if (!Array.isArray(grid)) return;
  for (const row of grid) {
    if (Array.isArray(row)) for (const cell of row) tag(cell);
  }
}

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));

// ── 排序 ──────────────────────────────────────────────────────────

const DIRECTION_RANK: Record<PoolAdjustDirection, number> = {
  none: 0,
  down: 1,
  up: 2,
};

/** none（含只放宽冗余上限）= 0，down = 1，up = 2；缺省按 none */
export function poolAdjustRank(
  info: Pick<PoolAdjustInfo, "direction"> | null | undefined,
): number {
  const d = info?.direction;
  return d && d in DIRECTION_RANK ? DIRECTION_RANK[d] : 0;
}

/** 原投料 > 降投料 > 升投料；同类按 compareSolutions */
export function comparePoolAdjust(
  a: SolutionResult,
  b: SolutionResult,
  secondaryId?: string | null,
): number {
  const ra = poolAdjustRank(a?.poolAdjust as PoolAdjustInfo | undefined);
  const rb = poolAdjustRank(b?.poolAdjust as PoolAdjustInfo | undefined);
  if (ra !== rb) return ra - rb;
  return compareSolutions(a, b, secondaryId);
}

// ── 主流程 ────────────────────────────────────────────────────────

interface PlannedStep {
  kind: Exclude<PoolAdjustAttemptKind, "initial">;
  maxWaste: number;
  tenths: number;
}

/**
 * 生成链上的全部步骤（顺序即尝试顺序）。
 * 档位全部是整数十分位步进；upMaxTenths 由 poolUpMaxTenths 给出，不写死。
 * 即使外部直接传入越界档位，也先截到全局上限，保证计划最多 17 步（不含 initial）。
 */
export function planPoolAdjustSteps(
  base: number,
  fromTenths: number,
  upMaxTenths: number,
): PlannedStep[] {
  const from = clampAdjustTenths(fromTenths);
  const upMax = clampAdjustTenths(upMaxTenths);
  const steps: PlannedStep[] = [];
  for (const tier of MAX_WASTE_RELAX_TIERS_W) {
    if (base < tier) {
      steps.push({ kind: "wasteRelax", maxWaste: tier, tenths: from });
    }
  }
  for (let t = from - 1; t >= 0; t -= 1) {
    steps.push({ kind: "down", maxWaste: base, tenths: t });
  }
  for (let t = from + 1; t <= upMax; t += 1) {
    steps.push({ kind: "up", maxWaste: base, tenths: t });
  }
  return steps;
}

/**
 * 初次求解 + 预检；预检剔光时走调整链。
 * 初次求解本身抛错照常抛出（与 worker 现有 error 分支一致）；初次预检抛错按 fail-open 保留原候选。
 */
export function solveWithPoolAdjustChain(
  params: CalcParams,
  deps: PoolAdjustDeps,
  options: PoolAdjustOptions = {},
): PoolAdjustChainResult {
  const now = deps.now ?? Date.now;
  const build = deps.build ?? buildSudokuDecisionMatrix;
  const trace: PoolAdjustAttempt[] = [];
  const startedAt = now();
  const deadline = Number.isFinite(options.deadline)
    ? (options.deadline as number)
    : startedAt +
      (Number.isFinite(options.timeoutMs) && (options.timeoutMs as number) > 0
        ? (options.timeoutMs as number)
        : POOL_ADJUST_BUDGET_MS);

  const base = effectiveMaxWaste(params);
  const poolIndex = Number.isInteger(options.poolIndex)
    ? (options.poolIndex as number)
    : findAdjustTargetPool(params);
  const targetCfg = poolIndex >= 0 ? params.oscPools?.[poolIndex] : undefined;
  const fromTenths = isPoolActive(targetCfg)
    ? Math.min(POOL_FEED_MAX_TENTHS, toRateTenths(targetCfg?.maxPerMin))
    : 0;
  const fromPerMin = tenthsToRate(fromTenths);

  const runAttempt = (
    kind: PoolAdjustAttemptKind,
    p: CalcParams,
    maxWaste: number,
    tenths: number,
    doPrecheck: boolean,
    failOpenPrecheck: boolean,
  ) => {
    const out = deps.solve(p, {
      kind,
      maxWaste,
      rateTenths: tenths,
      poolIndex,
    });
    const candidates = Array.isArray(out?.candidates) ? out.candidates : [];
    let kept = candidates;
    let report: PoolPrecheckReport | null = null;
    if (doPrecheck) {
      try {
        const f = deps.precheck(p, candidates);
        kept = Array.isArray(f?.kept) ? f.kept : candidates;
        report = f?.report ?? null;
      } catch (e) {
        if (!failOpenPrecheck) throw e;
        kept = candidates;
        report = null;
      }
    }
    const result = build(kept, out?.secondaryId);
    const entry: PoolAdjustAttempt = {
      index: trace.length + 1,
      kind,
      maxWaste,
      ratePerMin: tenthsToRate(tenths),
      rateTenths: tenths,
      candidatesBefore: candidates.length,
      candidatesAfter: kept.length,
      prechecked: doPrecheck,
      solutions: result?.solutions?.length ?? 0,
      elapsedMs: now() - startedAt,
    };
    trace.push(entry);
    return { result, report, candidates, kept, entry };
  };

  const initial = runAttempt("initial", params, base, fromTenths, true, true);
  const unchanged: PoolAdjustInfo = {
    direction: "none",
    fromPerMin,
    toPerMin: fromPerMin,
  };
  const original = (
    extra: Partial<PoolAdjustChainResult>,
  ): PoolAdjustChainResult => ({
    result: initial.result,
    report: initial.report,
    poolAdjust: { ...unchanged },
    trace,
    triggered: false,
    ...extra,
  });

  const prunedAll = initial.candidates.length > 0 && initial.kept.length === 0;
  if (poolIndex < 0 || fromTenths <= 0 || !prunedAll) {
    return original({});
  }

  try {
    const steps = planPoolAdjustSteps(
      base,
      fromTenths,
      poolUpMaxTenths(params, poolIndex),
    );
    const skipPrecheckAtZero = !hasOtherActivePool(params, poolIndex);
    for (const step of steps) {
      if (now() >= deadline) {
        return original({
          triggered: true,
          timedOut: true,
          lastStep: trace[trace.length - 1] ?? null,
        });
      }
      const p = withPoolRate(params, poolIndex, step.tenths, step.maxWaste);
      const doPrecheck = !(step.tenths === 0 && skipPrecheckAtZero);
      const r = runAttempt(
        step.kind,
        p,
        step.maxWaste,
        step.tenths,
        doPrecheck,
        false,
      );
      if ((r.result?.solutions?.length ?? 0) === 0) continue;

      const toPerMin = tenthsToRate(step.tenths);
      const poolAdjust: PoolAdjustInfo =
        step.kind === "up"
          ? {
              direction: "up",
              fromPerMin,
              toPerMin,
              requiredActualRatePerMin: toPerMin,
            }
          : {
              direction: step.kind === "down" ? "down" : "none",
              fromPerMin,
              toPerMin,
            };
      const wasteRelax =
        step.kind === "wasteRelax" ? { base, used: step.maxWaste } : undefined;
      try {
        attachAdjust(r.result, poolAdjust, wasteRelax);
      } catch {
        // 挂标签失败不影响结果本身
      }
      return {
        result: r.result,
        report: r.report,
        ...(wasteRelax ? { wasteRelax } : {}),
        poolAdjust,
        trace,
        triggered: true,
      };
    }
    return original({ triggered: true, exhausted: true });
  } catch (e) {
    return original({ triggered: true, error: errorText(e) });
  }
}
