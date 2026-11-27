/**
 * 自定义震荡热能池投料拆分（纯函数，不依赖 FactoryDesigner）。
 *
 * 一句话定位：把用户填的「投料量（个/分）」拆成「常驻满速台数 + 震荡零头」，
 * 供求解器 / UI 决定哪部分走常驻满速、哪部分走震荡支路。
 *
 * 口径：
 * - 单台满速投料 = 60 / burnTime 个/分（与 oscBudget.fullSpeedPerMinute 同口径），
 *   40s 电池（谷地/武陵全系）= 1.5，源矿（8s）= 7.5；
 * - 投料量一律先四舍五入到整数十分位（tenths）再算，避免 0.1 步进的浮点误差；
 * - 用户可填范围 0 ~ 1.5 个/分，超出按 1.5 截断并标记 clamped；
 * - 0 / 负数 / 非数字 / 燃料无效 → 不建池（active = false）。
 */
import type { ManualBaseLine } from "../types/calc";
import { type Fuel, resolveFuel } from "./constants";

/** 投料量上限（十分位整数）：1.5 个/分 */
export const POOL_FEED_MAX_TENTHS = 15;
/** 投料量上限（个/分） */
export const POOL_FEED_MAX_PER_MIN = POOL_FEED_MAX_TENTHS / 10;

/** 1 分钟 = 60 s，换成十分位口径 = 600 */
const TENTH_SECONDS_PER_MINUTE = 600;

export interface PoolFeedSplit {
  fuelId: string;
  /** 是否建池：投料量 > 0 且燃料有效 */
  active: boolean;
  /** 申请量超过上限被截断（按十分位四舍五入后判断） */
  clamped: boolean;
  /** 实际采用的投料量（十分位整数，0 ~ 15） */
  rateTenths: number;
  /** 实际采用的投料量（个/分）= rateTenths / 10 */
  ratePerMin: number;
  /** 单台满速投料（个/分）= 60 / burnTime；燃料无效时为 0 */
  fullSpeedPerMin: number;
  /** 常驻满速热能池台数 */
  residentCount: number;
  /** 常驻部分总投料（个/分）= residentCount × fullSpeedPerMin */
  residentPerMin: number;
  /** 震荡零头（十分位）；burnTime 能整除 600 时为整数 */
  remainderTenths: number;
  /** 震荡零头（个/分） */
  remainderPerMin: number;
  /** 零头 > 0 才需要震荡支路；正好是满速整数倍时为 false */
  needsOscillation: boolean;
}

/** 任意输入 → 十分位整数（≥ 0）；toFixed 先消掉 1.45*10=14.4999… 这类误差再取整 */
export function toFeedTenths(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.max(0, Math.round(Number((n * 10).toFixed(6))));
}

function emptySplit(
  fuelId: string,
  clamped: boolean,
  rateTenths: number,
  fullSpeedPerMin: number,
): PoolFeedSplit {
  return {
    fuelId,
    active: false,
    clamped,
    rateTenths,
    ratePerMin: rateTenths / 10,
    fullSpeedPerMin,
    residentCount: 0,
    residentPerMin: 0,
    remainderTenths: 0,
    remainderPerMin: 0,
    needsOscillation: false,
  };
}

/** 按已解析的燃料拆分（自定义燃料 / 覆盖 burnTime 时用） */
export function splitPoolFeedForFuel(
  fuel: Fuel | null | undefined,
  ratePerMin: unknown,
): PoolFeedSplit {
  const requestedTenths = toFeedTenths(ratePerMin);
  const clamped = requestedTenths > POOL_FEED_MAX_TENTHS;
  const rateTenths = Math.min(requestedTenths, POOL_FEED_MAX_TENTHS);
  const fuelId = fuel?.id ?? "none";
  const burnTime = Number(fuel?.burnTime);

  if (!fuel || !Number.isFinite(burnTime) || burnTime <= 0) {
    return emptySplit(fuelId, clamped, rateTenths, 0);
  }
  const fullSpeedPerMin = 60 / burnTime;
  if (rateTenths === 0) {
    return emptySplit(fuelId, clamped, 0, fullSpeedPerMin);
  }

  // 整数口径：投料 rateTenths/10 个/分 ≥ k 台满速 ⇔ rateTenths·burnTime ≥ k·600
  const feedTenthSeconds = rateTenths * burnTime;
  const residentCount = Math.floor(
    (feedTenthSeconds + 1e-9) / TENTH_SECONDS_PER_MINUTE,
  );
  const remainderTenthSeconds = Math.max(
    0,
    feedTenthSeconds - residentCount * TENTH_SECONDS_PER_MINUTE,
  );
  const remainderTenths = remainderTenthSeconds / burnTime;
  const remainderPerMin = remainderTenthSeconds / (10 * burnTime);

  return {
    fuelId,
    active: true,
    clamped,
    rateTenths,
    ratePerMin: rateTenths / 10,
    fullSpeedPerMin,
    residentCount,
    residentPerMin: residentCount * fullSpeedPerMin,
    remainderTenths,
    remainderPerMin,
    needsOscillation: remainderTenthSeconds > 1e-9,
  };
}

/**
 * 按燃料 ID 拆分投料量。
 * @example splitPoolFeed("valleyLow", 1.5) → residentCount 1, remainderPerMin 0
 * @example splitPoolFeed("valleyLow", 1.4) → residentCount 0, remainderPerMin 1.4
 */
export function splitPoolFeed(
  fuelId: string,
  ratePerMin: unknown,
  fuelOverrides?: Record<string, { power?: number; burnTime?: number }>,
): PoolFeedSplit {
  const fuel =
    fuelId && fuelId !== "none"
      ? resolveFuel(fuelId, fuelOverrides)
      : undefined;
  const out = splitPoolFeedForFuel(fuel, ratePerMin);
  return fuel ? out : { ...out, fuelId: fuelId || "none" };
}

/**
 * 常驻部分转成 manualBaseLines 同构的一行（{ id, fuelId, count }），
 * 方便直接拼进 params.manualBaseLines；没有常驻台数时返回 null。
 */
export function toResidentBaseLine(
  split: PoolFeedSplit,
  id: string,
): ManualBaseLine | null {
  if (!split.active || split.residentCount <= 0) return null;
  return { id, fuelId: split.fuelId, count: split.residentCount };
}
