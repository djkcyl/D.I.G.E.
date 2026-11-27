import {
  analyzeSplitterComplexity,
  CONSTANTS,
  DEFAULT_INPUT_SOURCE_ID,
  type Fuel,
  getOscillatingPower,
  INPUT_SOURCES,
} from "./constants";
import { deviceCostOfDenominator } from "./oscBudget";

/** 游戏物品准入口限速档位（个/分钟） */
export const GAME_LIMIT_STEPS = [0, 6, 12, 18, 24, 30] as const;
export type GameLimitStep = (typeof GAME_LIMIT_STEPS)[number];

/**
 * 限速器比例系数 k ∈ {1,2,3,4,5}：
 *   limiterSpeed = k * 6  个/分钟
 *   相对满速 30 的比例 = k/5
 *   例：k=1 → 6/min → 1/5（不是 1/6）
 */
export const LIMITER_K_VALUES = [1, 2, 3, 4, 5] as const;
export type LimiterK = (typeof LIMITER_K_VALUES)[number];

export interface EffectiveInput {
  /** 个/s */
  speed: number;
  /**
   * **平均**间隔 s（= 1/speed；0 速时为 Infinity）。
   * ⚠ 限速时准入口是 n-of-5 成串放行，实际格位间隔不均匀；这里只是均值，
   *   仿真到达序列请用 branchArrivalTimes()。
   */
  interval: number;
  /** 个/min */
  perMin: number;
  /** 是否相对源上限发生了限速 */
  isLimited: boolean;
}

export interface BranchLimiterPlan {
  /**
   * 准入口限速（个/min）；null = 不限速（源满速）。
   * 限流分支每 5 格放行 n = limiterSpeed/6 个（gateSlotPattern），仿真必须透传它。
   */
  limiterSpeed: number | null;
  /** 是否需要前置准入口限速器 */
  requiresLimiter: boolean;
  /** 限速比例 k（1..5），满速时为 sourceMax/6 */
  limiterK: number;
  /** 限速后的本地分流分母（仅 2^a·3^b）；仿真用它拆分流树（splitPathOfDenominator） */
  localDenominator: number;
  /**
   * 等效分母 D = localD·5/k（一般式 localD·sourceMaxPerMin/effectivePerMin），
   * **只用于均值和展示，不能用于仿真**。
   * 准入口是 n-of-5 成串放行（docs/architecture.md「三之一」），到达时刻请用 branchArrivalTimes()。
   */
  denominator: number;
  /**
   * 分支物品**平均**到达间隔（s）= 有效母带平均间隔 × localD。
   * 用于平均功率 / BOM / oscillatingFuelPerSec / 损耗估算。
   * ⚠ 限速分支的实际间隔不均匀（成串 + 长空档），不能拿它 `t += branchInterval` 生成到达序列。
   */
  branchInterval: number;
  /**
   * 分支物品**最大**到达间隔（s），由 gateSlotPattern / branchArrivalTimes 推出（见 branchMaxInterval）：
   *   n∤L 时 = branchInterval + (10−2n)(n−s)/n，s = L mod n；n | L 或不限速时 = branchInterval。
   * 供 sim-builder 做「热能池会不会烧空」类判据。
   */
  maxBranchInterval: number;
  power: number;
  splitterCount: { split2: number; split3: number; total: number };
  /** 硬件成本：分流器数 +（限速器 ? 1 : 0） */
  hardwareCost: number;
  /** 设备容量占用（取货口/存货口/热能池/分流器，按游戏实体计） */
  deviceCost: number;
  /** 每 30 分钟吞 1 个物品造成的相对损耗（0~1） */
  lossFraction: number;
  description: string;
}

/**
 * 根据输入源与可选准入口限速，计算有效母带速率/间隔。
 * - limitPerMin == null：不限速，使用源上限
 * - 非法档位：回退到源上限
 * - 合法档位：clamp 到 [0, 源上限]
 * 返回的 interval 是**平均**间隔（mean），不是逐格间隔。
 */
export function getEffectiveInput(
  sourceId: string = DEFAULT_INPUT_SOURCE_ID,
  limitPerMin?: number | null,
): EffectiveInput {
  const src = INPUT_SOURCES[sourceId] ?? INPUT_SOURCES[DEFAULT_INPUT_SOURCE_ID];
  const maxPerMin = src.speed * 60;

  let effectivePerMin: number;
  if (limitPerMin == null) {
    effectivePerMin = maxPerMin;
  } else {
    const clamped = Math.min(Math.max(0, limitPerMin), maxPerMin);
    effectivePerMin = (GAME_LIMIT_STEPS as readonly number[]).includes(clamped)
      ? clamped
      : maxPerMin;
  }

  const speed = effectivePerMin / 60;
  // mean interval：限速时只代表均值（n-of-5 成串放行）
  const interval = speed > 0 ? 1 / speed : Infinity;

  return {
    speed,
    interval,
    perMin: effectivePerMin,
    isLimited: limitPerMin != null && effectivePerMin < maxPerMin - 1e-9,
  };
}

/**
 * 安全求母带吞吐（个/s）。inputInterval 为 Infinity 或 <=0 时返回 0，避免除零。
 */
export function getBeltThroughput(inputInterval: number): number {
  if (
    inputInterval === Infinity ||
    inputInterval <= 0 ||
    !Number.isFinite(inputInterval)
  ) {
    return 0;
  }
  return 1 / inputInterval;
}

/**
 * 分支**平均**到达间隔（s）。优先用 branchInterval；缺字段时按「该支路有效母带平均间隔 × localD」兜底：
 *   限流分支 = (60 / limiterSpeed) × localD；不限速分支 = unlimitedInterval × localD。
 * ⚠ 不能用 unlimitedInterval × localD 兜底限流分支（间隔被算短 5/k 倍，燃料速率被高估 5/k 倍）。
 * 缺 localDenominator、或限流分支缺 limiterSpeed 时直接抛错，不再拿等效分母 D 猜。
 */
export function resolveMeanBranchInterval(
  branch: {
    branchInterval?: number;
    localDenominator?: number;
    limiterSpeed?: number | null;
    requiresLimiter?: boolean;
  },
  unlimitedInterval: number,
): number {
  const bi = branch.branchInterval;
  if (bi != null && Number.isFinite(bi) && bi > 0) return bi;
  const localD = branch.localDenominator;
  if (!(localD != null && Number.isFinite(localD) && localD >= 1)) {
    throw new Error(
      `branch 缺 branchInterval 且缺 localDenominator（limiterSpeed=${String(branch.limiterSpeed)}），无法求平均间隔`,
    );
  }
  if (branch.requiresLimiter || branch.limiterSpeed != null) {
    const ls = Number(branch.limiterSpeed);
    if (!(ls > 0) || !Number.isFinite(ls)) {
      throw new Error(
        `限流分支缺合法 limiterSpeed（localD=${localD}），无法求平均间隔`,
      );
    }
    return (60 / ls) * localD;
  }
  return unlimitedInterval * localD;
}

function buildDescription(
  requiresLimiter: boolean,
  limiterSpeed: number | null,
  limiterK: number,
  split2: number,
  split3: number,
): string {
  const parts: string[] = [];
  if (requiresLimiter && limiterSpeed != null) {
    // 相对满速 30：比例 = k/5（限速 6 → 1/5，不是 1/6）
    const ratioLabel =
      Math.abs(limiterK - Math.round(limiterK)) < 1e-9
        ? `${Math.round(limiterK)}/5`
        : `${limiterK}/5`;
    parts.push(`准入口限速: ${limiterSpeed}/min [${ratioLabel}]`);
  }
  if (split2 > 0) parts.push(`${split2}个二分器`);
  if (split3 > 0) parts.push(`${split3}个三分器`);
  if (parts.length === 0) return "直通";
  return parts.join(" + ");
}

/** 格式化展示分母（接近整数则取整） */
export function formatDenominator(d: number): string {
  if (!Number.isFinite(d) || d <= 0) return "?";
  const rounded = Math.round(d);
  if (Math.abs(d - rounded) < 1e-6) return String(rounded);
  // 尝试有理数 p/q 简写（分母不太大）
  for (let q = 2; q <= 60; q += 1) {
    const p = d * q;
    const pr = Math.round(p);
    if (Math.abs(p - pr) < 1e-6) return `${pr}/${q}`;
  }
  return d.toFixed(2);
}

/**
 * 求解器可用的限速 k 候选（相对源满速）。
 * 返回 limitPerMin：null 表示源满速不限；其余为 k*6 且严格小于源上限。
 */
export function getSolverLimitCandidates(
  sourceId: string = DEFAULT_INPUT_SOURCE_ID,
): Array<{ k: number; limitPerMin: number | null }> {
  const src = INPUT_SOURCES[sourceId] ?? INPUT_SOURCES[DEFAULT_INPUT_SOURCE_ID];
  const maxPerMin = src.speed * 60;
  const out: Array<{ k: number; limitPerMin: number | null }> = [];

  // 满速（不限）优先
  out.push({ k: maxPerMin / 6, limitPerMin: null });

  for (const k of LIMITER_K_VALUES) {
    const speed = k * 6;
    if (speed > 0 && speed < maxPerMin - 1e-9) {
      out.push({ k, limitPerMin: speed });
    }
  }
  return out;
}

/**
 * 为给定燃料与输入源，生成「准入口限速 × 本地分流分母」分支候选。
 *
 * 数学（仓库满速 30/min）：
 *   R_branch = R_in × k / (5 · 2^a · 3^b),  k ∈ {1,2,3,4,5}
 *   展示分母 D = 5·2^a·3^b / k
 *   限速 6 ⇒ k=1 ⇒ 比例 1/5（不是 1/6）
 *
 * 同一功率保留硬件成本更低的方案；同分优先不限速。
 */
export function buildBranchLimiterOptions(
  fuel: Fuel,
  sourceId: string,
  validDenominators: number[],
  /**
   * 排除物品准入口限速器：
   * false（默认关）= 启用限速求解（k/5 枚举）；
   * true（开）= 忽略限速，仅源满速普通分流。
   */
  excludeItemGateLimiter: boolean = false,
): BranchLimiterPlan[] {
  const src = INPUT_SOURCES[sourceId] ?? INPUT_SOURCES[DEFAULT_INPUT_SOURCE_ID];
  const sourceMaxPerMin = src.speed * 60;
  const sourceInterval = src.interval;
  // false=限速求解；true=排除/满速
  const limitCandidates = excludeItemGateLimiter
    ? [{ k: sourceMaxPerMin / 6, limitPerMin: null as number | null }]
    : getSolverLimitCandidates(sourceId);

  type Raw = BranchLimiterPlan & { sortKey: string };
  const raw: Raw[] = [];

  for (const cand of limitCandidates) {
    const effective = getEffectiveInput(sourceId, cand.limitPerMin);
    if (!Number.isFinite(effective.interval) || effective.interval <= 0)
      continue;

    const requiresLimiter = effective.isLimited;
    const limiterSpeed = requiresLimiter ? effective.perMin : null;
    // k：effectivePerMin / 6（仓库下与 cand.k 一致；封装机满速 k=1）
    const limiterK = effective.perMin > 0 ? effective.perMin / 6 : cand.k;

    for (const localD of validDenominators) {
      const power = getOscillatingPower(fuel, localD, effective.interval);
      // 只要震荡分支（严格小于满载）
      if (!(power < fuel.power - 1e-9) || !(power > 0)) continue;

      const c = analyzeSplitterComplexity(localD);
      // 平均间隔（mean）；保留给 BOM / oscillatingFuelPerSec / 剪枝
      const branchInterval = effective.interval * localD;
      // 最大间隔：限流分支按 n-of-5 成串放行推出；不限速母带均匀，max = mean
      const maxBranchInterval =
        requiresLimiter && limiterSpeed != null
          ? branchMaxInterval(limiterSpeed / 6, localD)
          : branchInterval;
      // D_display = localD * sourceMax / effective  （= localD * 5/k 当满速 30）
      const denominator =
        effective.perMin > 0
          ? (localD * sourceMaxPerMin) / effective.perMin
          : Infinity;

      // 校验：branchInterval ≈ sourceInterval * denominator
      // （浮点允许误差）

      const hardwareCost = c.total + (requiresLimiter ? 1 : 0);
      const deviceCost =
        deviceCostOfDenominator(localD, requiresLimiter)?.total ?? hardwareCost;
      // 每 30 分钟丢 1 个：相对损耗 = branchInterval / 1800（分支间隔越长损耗越大）
      const lossFraction =
        Number.isFinite(branchInterval) && branchInterval > 0
          ? branchInterval / 1800
          : 1;

      raw.push({
        limiterSpeed,
        requiresLimiter,
        limiterK,
        localDenominator: localD,
        denominator,
        branchInterval,
        maxBranchInterval,
        power,
        splitterCount: { split2: c.twoWay, split3: c.threeWay, total: c.total },
        hardwareCost,
        deviceCost,
        lossFraction,
        description: buildDescription(
          requiresLimiter,
          limiterSpeed,
          limiterK,
          c.twoWay,
          c.threeWay,
        ),
        sortKey: power.toFixed(4),
      });
    }
  }

  // 同功率：更低硬件成本优先；同分优先不限速；再优先更高限速档、更小本地分母
  const bestByPower = new Map<string, Raw>();
  for (const opt of raw) {
    const prev = bestByPower.get(opt.sortKey);
    if (!prev) {
      bestByPower.set(opt.sortKey, opt);
      continue;
    }

    let take = false;
    if (opt.hardwareCost < prev.hardwareCost) {
      take = true;
    } else if (opt.hardwareCost === prev.hardwareCost) {
      if (opt.requiresLimiter !== prev.requiresLimiter) {
        take = !opt.requiresLimiter; // 优先不限速
      } else if (
        (opt.limiterSpeed ?? sourceMaxPerMin) !==
        (prev.limiterSpeed ?? sourceMaxPerMin)
      ) {
        take =
          (opt.limiterSpeed ?? sourceMaxPerMin) >
          (prev.limiterSpeed ?? sourceMaxPerMin);
      } else if (opt.localDenominator !== prev.localDenominator) {
        take = opt.localDenominator < prev.localDenominator;
      }
    }
    if (take) bestByPower.set(opt.sortKey, opt);
  }

  void sourceInterval;

  return Array.from(bestByPower.values())
    .map(({ sortKey: _s, ...rest }) => rest)
    .sort((a, b) => a.power - b.power);
}

// ─── 准入口成串放行（游戏特性，见 docs/architecture.md「三之一」）──────────────

/** 准入口限流周期的格位数：5 格 = 5 × BELT_INTERVAL = 10s */
export const GATE_CYCLE_SLOTS = 5;

function gcdInt(a: number, b: number): number {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y !== 0) {
    const t = x % y;
    x = y;
    y = t;
  }
  return x;
}

function lcmInt(a: number, b: number): number {
  return (a / gcdInt(a, b)) * b;
}

/**
 * 准入口一个限流周期（5 格）的放行序列：前 n 个格位放行，后 5−n 个格位空。
 * k = 档位 / 6：6/分 → 1 → ■□□□□；12/分 → 2 → ■■□□□；…；30/分 → 5 满速。
 * 非整数 / 越界的 k 四舍五入后夹到 [0, 5]。
 */
export function gateSlotPattern(k: number): boolean[] {
  const n = Number.isFinite(k)
    ? Math.min(GATE_CYCLE_SLOTS, Math.max(0, Math.round(k)))
    : 0;
  return Array.from({ length: GATE_CYCLE_SLOTS }, (_, i) => i < n);
}

/** 分流树：按物品经过顺序排列的每级分流器路数（2 或 3） */
export type SplitPath = readonly number[];

/**
 * 把本地分母 2^a·3^b 拆成分流树（与 buildBranchBlueprint 一致：先三分、后二分）。
 * 含其它质因子 / 非正整数时返回 null。
 */
export function splitPathOfDenominator(
  localDenominator: number,
): number[] | null {
  if (!Number.isInteger(localDenominator) || localDenominator < 1) return null;
  const c = analyzeSplitterComplexity(localDenominator);
  if (2 ** c.twoWay * 3 ** c.threeWay !== localDenominator) return null;
  return [
    ...new Array<number>(c.threeWay).fill(3),
    ...new Array<number>(c.twoWay).fill(2),
  ];
}

function splitProduct(splitPath: SplitPath): number {
  let d = 1;
  for (const ways of splitPath) {
    if (!Number.isInteger(ways) || ways < 1) {
      throw new RangeError(`invalid splitter ways: ${ways}`);
    }
    d *= ways;
  }
  return d;
}

/**
 * 限速支路到达序列的周期（格位数）。
 * 每 5 格放行 n 个，支路取每 D 个放行物品中的 1 个（D = ∏ways），
 * lcm(D, n) 个放行物品后序列重复 ⇒ 周期 5·lcm(D,n)/n 格（恒为 5 的整数倍）。
 * n=5（满速）退化为每 D 格 1 个；n=0 返回 Infinity。
 */
export function branchGatePeriodSlots(k: number, splitPath: SplitPath): number {
  const n = gateSlotPattern(k).filter(Boolean).length;
  if (n === 0) return Number.POSITIVE_INFINITY;
  const d = splitProduct(splitPath);
  if (n === GATE_CYCLE_SLOTS) return d;
  return (GATE_CYCLE_SLOTS * lcmInt(d, n)) / n;
}

/**
 * 限速支路的到达时刻（s，相对母带第 0 格），[0, duration) 内升序。
 * 1. 母带每 slotInterval 一格；第 s 格处于限流周期的 (s + phaseSlots) mod 5 位，
 *    落在前 n 位才放行（phaseSlots ∈ 0..4，其余取模）；
 * 2. 放行物品依次进入分流树，每级分流器轮转（第 i 个物品走第 i mod ways 路）；
 * 3. 本支路约定为每级第 0 路，即第 0、D、2D… 个放行物品。
 */
export function branchArrivalTimes(
  k: number,
  splitPath: SplitPath,
  phaseSlots: number,
  duration: number,
  slotInterval: number = CONSTANTS.BELT_INTERVAL,
): number[] {
  if (!(duration > 0) || !(slotInterval > 0)) return [];
  const pattern = gateSlotPattern(k);
  if (!pattern.some(Boolean)) return [];
  const d = splitProduct(splitPath);
  const p0 = Number.isFinite(phaseSlots) ? Math.round(phaseSlots) : 0;
  const phase = ((p0 % GATE_CYCLE_SLOTS) + GATE_CYCLE_SLOTS) % GATE_CYCLE_SLOTS;
  const out: number[] = [];
  let passed = 0;
  for (let s = 0; s * slotInterval < duration; s += 1) {
    if (!pattern[(s + phase) % GATE_CYCLE_SLOTS]) continue;
    if (passed % d === 0) out.push(s * slotInterval);
    passed += 1;
  }
  return out;
}

/**
 * 放行窗口起点对齐方式（已确认）：'per-gate' —— 每个准入口各自计时，
 * 第一个格位就是该支路的相位起点；phaseOffsetCells 只做整体平移。
 */
export type GateWindowAlign = "per-gate";
export const GATE_WINDOW_ALIGN: GateWindowAlign = "per-gate";

/**
 * 限速支路的最大到达间隔（s），闭式解。
 * 推导：第 p 个放行物品位于第 ⌊p/n⌋ 个周期的第 (p mod n) 格；支路取 p → p+L，
 *   L = qn + s。若 (p mod n)+s < n，间隔 5q+s 格；否则跨一次空档，间隔 5(q+1)+s−n 格。
 *   s>0 时后者必然出现（p mod n 取遍 gcd(L,n) 的倍数，最大 n−g ≥ n−s），故
 *   max − mean = slot·(5−n)(n−s)/n，slot=2s 时即 (10−2n)(n−s)/n。
 * 与相位无关（相位只平移起点，稳态间隔集合不变）。
 * n=5 或 n | L ⇒ 间隔恒等，返回均值；n=0 返回 Infinity。
 */
export function branchMaxInterval(
  k: number,
  localDenominator: number,
  slotInterval: number = CONSTANTS.BELT_INTERVAL,
): number {
  const n = gateSlotPattern(k).filter(Boolean).length;
  if (n === 0 || !(localDenominator >= 1)) return Number.POSITIVE_INFINITY;
  const L = Math.round(localDenominator);
  const mean = (GATE_CYCLE_SLOTS * slotInterval * L) / n;
  if (n === GATE_CYCLE_SLOTS) return mean;
  const s = L % n;
  if (s === 0) return mean;
  return mean + (slotInterval * (GATE_CYCLE_SLOTS - n) * (n - s)) / n;
}

/**
 * 校验用：直接从 branchArrivalTimes 数出最大间隔（取两个完整周期的稳态差分）。
 * 应与 branchMaxInterval(k, ∏splitPath) 相等，供单测对拍。
 */
export function branchMaxIntervalFromArrivals(
  k: number,
  splitPath: SplitPath,
  phaseSlots: number = 0,
  slotInterval: number = CONSTANTS.BELT_INTERVAL,
): number {
  const period = branchGatePeriodSlots(k, splitPath);
  if (!Number.isFinite(period)) return Number.POSITIVE_INFINITY;
  const duration = (3 * period + GATE_CYCLE_SLOTS) * slotInterval;
  const t = branchArrivalTimes(k, splitPath, phaseSlots, duration, slotInterval);
  let max = 0;
  for (let i = 1; i < t.length; i += 1) max = Math.max(max, t[i] - t[i - 1]);
  return max;
}
