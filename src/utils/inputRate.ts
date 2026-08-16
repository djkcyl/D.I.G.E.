import {
  analyzeSplitterComplexity,
  DEFAULT_INPUT_SOURCE_ID,
  getOscillatingPower,
  INPUT_SOURCES,
  type Fuel,
} from "./constants";

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
  /** s（0 速时为 Infinity） */
  interval: number;
  /** 个/min */
  perMin: number;
  /** 是否相对源上限发生了限速 */
  isLimited: boolean;
}

export interface BranchLimiterPlan {
  /** 准入口限速（个/min）；null = 不限速（源满速） */
  limiterSpeed: number | null;
  /** 是否需要前置准入口限速器 */
  requiresLimiter: boolean;
  /** 限速比例 k（1..5），满速时为 sourceMax/6 */
  limiterK: number;
  /** 限速后的本地分流分母（仅 2^a·3^b） */
  localDenominator: number;
  /**
   * 展示/仿真用等效分母（相对源满速母带）：
   *   D = localD * (sourceMaxPerMin / effectivePerMin) = localD * 5 / k  （仓库满速 30）
   */
  denominator: number;
  /** 分支物品到达间隔（s） */
  branchInterval: number;
  power: number;
  splitterCount: { split2: number; split3: number; total: number };
  /** 硬件成本：分流器数 +（限速器 ? 1 : 0） */
  hardwareCost: number;
  description: string;
}

/**
 * 根据输入源与可选准入口限速，计算有效母带速率/间隔。
 * - limitPerMin == null：不限速，使用源上限
 * - 非法档位：回退到源上限
 * - 合法档位：clamp 到 [0, 源上限]
 */
export function getEffectiveInput(
  sourceId: string = DEFAULT_INPUT_SOURCE_ID,
  limitPerMin?: number | null
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

function buildDescription(
  requiresLimiter: boolean,
  limiterSpeed: number | null,
  limiterK: number,
  split2: number,
  split3: number
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
  sourceId: string = DEFAULT_INPUT_SOURCE_ID
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
  excludeItemGateLimiter: boolean = false
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
      const branchInterval = effective.interval * localD;
      // D_display = localD * sourceMax / effective  （= localD * 5/k 当满速 30）
      const denominator =
        effective.perMin > 0
          ? (localD * sourceMaxPerMin) / effective.perMin
          : Infinity;

      // 校验：branchInterval ≈ sourceInterval * denominator
      // （浮点允许误差）

      const hardwareCost = c.total + (requiresLimiter ? 1 : 0);

      raw.push({
        limiterSpeed,
        requiresLimiter,
        limiterK,
        localDenominator: localD,
        denominator,
        branchInterval,
        power,
        splitterCount: { split2: c.twoWay, split3: c.threeWay, total: c.total },
        hardwareCost,
        description: buildDescription(
          requiresLimiter,
          limiterSpeed,
          limiterK,
          c.twoWay,
          c.threeWay
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
