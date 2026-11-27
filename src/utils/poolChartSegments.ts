/**
 * 图表层用的自定义震荡池分段 + 日志步长。
 *
 * 口径与 FactoryDesigner.poolSegments 完全一致（splitPoolFeed → poolPowerForRate →
 * normalizeDeviceLimit），图表层不自己推公式：
 * - 亮灯段高度 = pulseWatt（燃料瞬时功率，例如高容武陵 6400 W）；
 * - 标题 / 摘要 / 图例判断 = averageWatt（poolPowerForRate().watt，例如 1/64 时 2000 W）。
 */
import type { CalcParams } from "../types/calc";
import { resolveFuel } from "./constants";
import { normalizeDeviceLimit, poolPowerForRate } from "./oscBudget";
import { splitPoolFeed } from "./poolFeedSplit";

export interface PoolSegment {
  /** 满速带恒定功率（W） */
  constant: number;
  /** 余量支路燃烧时的瞬时功率（燃料额定功率，W）：亮灯段高度 */
  pulseWatt: number;
  /** 震荡周期（秒）= 2·D；0 = 没有震荡支路 */
  cycle: number;
  /** 每个周期内的燃烧时长（秒）= min(burnTime, cycle) */
  onDuration: number;
  /** 该池平均功率（W）= poolPowerForRate().watt（满速带 + 余量均值）：标题/摘要用 */
  averageWatt: number;
}

export type PoolSegments = PoolSegment[];

/** 由参数里的 oscPools 生成分段（与仿真同口径；含 fuelOverrides、1.5/分截断、设备上限规范化） */
export function buildPoolSegments(
  params: Pick<CalcParams, "oscPools" | "fuelOverrides"> | null | undefined,
): PoolSegments {
  const out: PoolSegments = [];
  for (const pool of params?.oscPools ?? []) {
    if (!pool || pool.enabled === false) continue;
    if (!pool.fuelId || pool.fuelId === "none") continue;
    const fuel = resolveFuel(pool.fuelId, params?.fuelOverrides);
    if (!fuel) continue;
    const feed = splitPoolFeed(
      pool.fuelId,
      pool.maxPerMin,
      params?.fuelOverrides,
    );
    if (!feed.active) continue;
    const rated = poolPowerForRate(fuel, feed.ratePerMin, {
      deviceLimit: normalizeDeviceLimit(pool.deviceLimit),
    });
    const cycle =
      rated.remainderDenominator != null ? 2 * rated.remainderDenominator : 0;
    out.push({
      constant: rated.bands.watt,
      pulseWatt: fuel.power,
      cycle,
      onDuration: cycle > 0 ? Math.min(fuel.burnTime, cycle) : 0,
      averageWatt: rated.watt,
    });
  }
  return out;
}

/** 第 seconds 秒的池瞬时功率（满速带恒定 + 余量方波） */
export function poolWattAt(
  segments: PoolSegments | null | undefined,
  seconds: number,
): number {
  if (!segments || segments.length === 0) return 0;
  return segments.reduce((sum, seg) => {
    const on =
      seg.cycle > 0 && seconds % seg.cycle < seg.onDuration ? seg.pulseWatt : 0;
    return sum + seg.constant + on;
  }, 0);
}

/** 全部池的平均功率之和（W） */
export function poolAverageWatt(
  segments: PoolSegments | null | undefined,
): number {
  return segments?.reduce((sum, seg) => sum + seg.averageWatt, 0) ?? 0;
}

/**
 * 每个日志点代表的秒数：优先用仿真给出的 logSecondsPerPoint；
 * 缺省时按仿真 sampleStep 同规则兜底（period < 2000 → 1，否则 ceil(period/500)），
 * 不能直接当 1，否则 5760 s 周期会被画成 480 s。
 */
export function resolveLogSecondsPerPoint(
  solution: { logSecondsPerPoint?: unknown; period?: unknown } | null | undefined,
): number {
  const step = Number(solution?.logSecondsPerPoint);
  if (Number.isFinite(step) && step > 0) return step;
  const period = Number(solution?.period);
  if (!Number.isFinite(period) || period < 2000) return 1;
  return Math.max(1, Math.ceil(period / 500));
}
