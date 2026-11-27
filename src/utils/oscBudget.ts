/**
 * 震荡池预算与设备容量模型。
 *
 * 术语：
 * - 分母 D：震荡支路相对母带的分流分母，只取 2^a·3^b；
 * - 设备容量：游戏里每个实体设备占 1 格，分流器按类型占 3/5，出货口/存货口各 1；
 * - 投料速率：母带满速 30 个/分，分母 D 的支路拿到 30/D 个/分，单台热能池最多吃 60/燃烧时长 个/分。
 *
 * 边界口径（口径 B：可运行下限）：
 * 1. 设备容量上限（默认 48，整方案合计）限制分母不可能无限大；
 * 2. 历史上曾存在「每 30 分钟吞 1 个物品」的下线降速问题（官方已修复），
 *    这里保留 5% 损耗容忍仅作为保守下限，避免给出速率低到没有实践意义的支路。
 *
 * 游戏数值统一来自 `src/config/game.ts`。
 */

import { GAME_CONFIG } from "../config/game";
import type { Fuel } from "./constants";

/** 母带满速：仓库/封装机模型里震荡枚举使用的基准（个/分钟） */
export const BELT_ITEMS_PER_MINUTE = GAME_CONFIG.grid.portItemsPerMinute;

/** 传送带吞物品 bug：每 30 分钟丢 1 个 */
export const ITEM_LOSS_PER_WINDOW = 1;
export const ITEM_LOSS_WINDOW_MINUTES = 30;

/** 默认可接受损耗比例（超过就认为实战不可用） */
export const DEFAULT_LOSS_TOLERANCE = 0.05;

/** 设备容量占用（按游戏实体计；存货口是每支路 2 个，全二分器时可只 1 个） */
export const DEVICE_COST = {
  /** 三分器按 5 格设备容量计 */
  split3: GAME_CONFIG.device.cost.split3,
  /** 二分器按 3 格 */
  split2: GAME_CONFIG.device.cost.split2,
  merger: GAME_CONFIG.device.cost.merger,
  /** 取货口 */
  pickup: GAME_CONFIG.device.cost.pickup,
  /** 单个存货口 */
  storage: GAME_CONFIG.device.cost.storage,
  /** 热能池 */
  generator: GAME_CONFIG.device.cost.generator,
  limiter: GAME_CONFIG.device.cost.limiter,
} as const;

/** 单支路需要的存货口数量：用到三分器要 2 个，全是二分器 1 个就够 */
export function storagePortsFor(split3: number): number {
  return split3 > 0
    ? GAME_CONFIG.device.storagePortsWithThree
    : GAME_CONFIG.device.storagePortsBinaryOnly;
}

/** 整方案默认可用的震荡系统设备容量 */
export const DEFAULT_DEVICE_LIMIT = GAME_CONFIG.device.budget;

/**
 * 规范化热能池设备上限：
 * - 0 / 负数 / 空值 / NaN → 按默认值 DEFAULT_DEVICE_LIMIT（48）处理，避免池被静默判成放不下；
 * - 其余取整后限制在 1..DEFAULT_DEVICE_LIMIT。
 */
export function normalizeDeviceLimit(value: unknown): number {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_DEVICE_LIMIT;
  return Math.min(DEFAULT_DEVICE_LIMIT, Math.max(1, n));
}

/** 单台满速耗料（个/分钟）：40s 电池 = 1.5 */
export function fullSpeedPerMinute(fuel: Fuel): number {
  if (!(fuel.burnTime > 0)) return 0;
  return 60 / fuel.burnTime;
}

/** 分母 D 支路的投料速率（个/分钟） */
export function branchItemsPerMinute(
  denominator: number,
  beltPerMinute: number = BELT_ITEMS_PER_MINUTE,
): number {
  if (!(denominator > 0)) return 0;
  return beltPerMinute / denominator;
}

/** 分母 D 支路的持续功率（W） */
export function branchWatt(
  fuel: Fuel,
  denominator: number,
  beltPerMinute: number = BELT_ITEMS_PER_MINUTE,
): number {
  const rate = Math.min(
    branchItemsPerMinute(denominator, beltPerMinute),
    fullSpeedPerMinute(fuel),
  );
  return (fuel.power * fuel.burnTime * rate) / 60;
}

/** 支路被吞物品的相对损耗（0~1）；分母越大越严重 */
export function branchLossFraction(
  fuel: Fuel,
  denominator: number,
  beltPerMinute: number = BELT_ITEMS_PER_MINUTE,
): number {
  const rate = Math.min(
    branchItemsPerMinute(denominator, beltPerMinute),
    fullSpeedPerMinute(fuel),
  );
  if (!(rate > 0)) return 1;
  return ITEM_LOSS_PER_WINDOW / ITEM_LOSS_WINDOW_MINUTES / rate;
}

export interface DeviceCost {
  two: number;
  three: number;
  /** 出货口 + 存货口 */
  ports: number;
  limiter: number;
  total: number;
}

/** 把分母拆成 2^a·3^b 并算设备占用；非 2^a3^b 返回 null */
export function deviceCostOfDenominator(
  denominator: number,
  requiresLimiter = false,
): DeviceCost | null {
  if (!Number.isInteger(denominator) || denominator <= 0) return null;
  let d = denominator;
  let two = 0;
  let three = 0;
  while (d % 2 === 0) {
    two += 1;
    d /= 2;
  }
  while (d % 3 === 0) {
    three += 1;
    d /= 3;
  }
  if (d !== 1) return null;
  const ports =
    DEVICE_COST.pickup +
    storagePortsFor(three) * DEVICE_COST.storage +
    DEVICE_COST.generator;
  const limiter = requiresLimiter ? DEVICE_COST.limiter : 0;
  return {
    two,
    three,
    ports,
    limiter,
    total:
      two * DEVICE_COST.split2 + three * DEVICE_COST.split3 + ports + limiter,
  };
}

/**
 * 单支路设备占用：
 *   取货口 1 + 存货口（三分器 2 个 / 全二分器 1 个，各 1）+ 热能池 1
 *   + 二分器 × 3 + 三分器 × 5 + 汇流器 × 1（限速器再 +1）。
 * 例：1 取货口 + 2 存货口 + 1 热能池 + 3 二分 + 3 三分 = 2 + 1 + 1 + 9 + 15 = 28。
 */
export function branchDeviceCount(
  split2: number,
  split3: number,
  mergers = 0,
  requiresLimiter = false,
): number {
  return (
    DEVICE_COST.pickup +
    storagePortsFor(split3) * DEVICE_COST.storage +
    DEVICE_COST.generator +
    split2 * DEVICE_COST.split2 +
    split3 * DEVICE_COST.split3 +
    mergers * DEVICE_COST.merger +
    (requiresLimiter ? DEVICE_COST.limiter : 0)
  );
}

/** 设备上限内可达的最大 2^a·3^b 分母 */
export function maxDenominatorForDeviceLimit(deviceLimit: number): number {
  let best = 0;
  for (let a = 0; a < 24; a += 1) {
    for (let b = 0; b < 16; b += 1) {
      const cost =
        a * DEVICE_COST.split2 +
        b * DEVICE_COST.split3 +
        DEVICE_COST.pickup +
        storagePortsFor(b) * DEVICE_COST.storage +
        DEVICE_COST.generator;
      if (cost > deviceLimit) continue;
      const d = 2 ** a * 3 ** b;
      // 分母再大也没有实际意义，且避免超过安全整数
      if (d > 1_000_000) continue;
      if (d > best) best = d;
    }
  }
  return best;
}

/** 损耗容忍下允许的最大分母（按 30/D 速率计） */
export function maxDenominatorForLossTolerance(
  tolerance: number,
  lossPerWindow: number = ITEM_LOSS_PER_WINDOW,
  windowMinutes: number = ITEM_LOSS_WINDOW_MINUTES,
): number {
  if (!(tolerance > 0)) return Infinity;
  // 损失率 = (loss/window) / (30/D) = D * loss / (window * 30)
  return (tolerance * windowMinutes * BELT_ITEMS_PER_MINUTE) / lossPerWindow;
}

export interface SingleBranchRange {
  fuelId: string;
  /** 单支最高：满速（常驻）功率 */
  maxWatt: number;
  /** 单支最低：可运行下限功率 */
  minWatt: number;
  /** 最低瓦数对应的分母（2^a·3^b） */
  minDenominator: number;
  /** 该分母的设备占用 */
  minDeviceCost: number;
  /** 下限是被谁卡住的 */
  limitedBy: "loss" | "device";
  /** 最低瓦数下的损耗比例 */
  minLossFraction: number;
  /** 设备上限内理论最大分母（仅参考，可能被损耗卡住） */
  deviceMaxDenominator: number;
  lossTolerance: number;
  deviceLimit: number;
}

/**
 * 单支震荡区间（口径 B）：
 * - 上限 = 燃料额定功率（母带速率 ≥ 满速耗料）；
 * - 下限 = 设备容量与「每 30 分钟吞 1 个」损耗双约束下，可用的最大分母对应的功率。
 */
export function singleBranchRange(
  fuel: Fuel,
  options: {
    deviceLimit?: number;
    lossTolerance?: number;
    beltPerMinute?: number;
  } = {},
): SingleBranchRange {
  const deviceLimit = normalizeDeviceLimit(options.deviceLimit);
  const lossTolerance = options.lossTolerance ?? DEFAULT_LOSS_TOLERANCE;
  const beltPerMinute = options.beltPerMinute ?? BELT_ITEMS_PER_MINUTE;

  const deviceMaxD = maxDenominatorForDeviceLimit(deviceLimit);
  const lossMaxD = maxDenominatorForLossTolerance(lossTolerance);

  // 震荡的下边界：母带速率必须低于满速耗料（D 越大速率越低）
  const oscillationFloor = Math.max(
    1,
    Math.floor(
      beltPerMinute / Math.max(fullSpeedPerMinute(fuel), 1e-9) + 1e-9,
    ) + 1,
  );

  const hardMax = Math.min(deviceMaxD, Math.floor(lossMaxD));
  let bestD = 0;
  let bestCost = 0;
  for (let d = oscillationFloor; d <= hardMax; d += 1) {
    const cost = deviceCostOfDenominator(d);
    if (!cost || cost.total > deviceLimit) continue;
    // 取最大的合法分母 → 最低功率
    if (d > bestD) {
      bestD = d;
      bestCost = cost.total;
    }
  }
  if (bestD === 0) {
    // 设备上限连最小震荡档位都放不下：该燃料做不了震荡，只能满速
    return {
      fuelId: fuel.id,
      maxWatt: fuel.power,
      minWatt: fuel.power,
      minDenominator: 0,
      minDeviceCost: 0,
      limitedBy: "device",
      minLossFraction: 0,
      deviceMaxDenominator: deviceMaxD,
      lossTolerance,
      deviceLimit,
    };
  }

  const limitedBy: "loss" | "device" =
    deviceMaxD <= Math.floor(lossMaxD) ? "device" : "loss";

  return {
    fuelId: fuel.id,
    maxWatt: fuel.power,
    minWatt: branchWatt(fuel, bestD, beltPerMinute),
    minDenominator: bestD,
    minDeviceCost: bestCost,
    limitedBy,
    minLossFraction: branchLossFraction(fuel, bestD, beltPerMinute),
    deviceMaxDenominator: deviceMaxD,
    lossTolerance,
    deviceLimit,
  };
}

/** 瓦数 → 投料速率（个/分钟） */ export function wattToPerMinute(
  fuel: Fuel,
  watt: number,
): number {
  const perItemWh = (fuel.power * fuel.burnTime) / 60; // 每个电池折算的 W·分
  if (!(perItemWh > 0)) return 0;
  return watt / perItemWh;
}

/** 投料速率（个/分钟）→ 瓦数 */
export function perMinuteToWatt(fuel: Fuel, perMinute: number): number {
  return (fuel.power * fuel.burnTime * perMinute) / 60;
}

export interface DenominatorMatch {
  denominator: number;
  watt: number;
  deviceCost: number;
  lossFraction: number;
  /** 与目标瓦数的偏差（W） */
  deltaWatt: number;
}

/**
 * 把期望瓦数吸附到最近的 2^a·3^b 档位（默认吸附更接近的一侧）。
 * 只在「设备上限 + 损耗容忍」允许的区间内选。
 */
export function matchDenominator(
  fuel: Fuel,
  watt: number,
  options: {
    deviceLimit?: number;
    lossTolerance?: number;
    beltPerMinute?: number;
    mode?: "nearest" | "down";
  } = {},
): DenominatorMatch | null {
  const range = singleBranchRange(fuel, options);
  const beltPerMinute = options.beltPerMinute ?? BELT_ITEMS_PER_MINUTE;
  const mode = options.mode ?? "nearest";
  const costLimit = normalizeDeviceLimit(options.deviceLimit);

  let best: DenominatorMatch | null = null;
  for (let d = 1; d <= range.deviceMaxDenominator; d += 1) {
    const cost = deviceCostOfDenominator(d);
    if (!cost || cost.total > costLimit) continue;
    const w = branchWatt(fuel, d, beltPerMinute);
    if (w <= 0) continue;
    if (mode === "down" && w > watt + 1e-9) continue;
    const delta = w - watt;
    if (
      !best ||
      Math.abs(delta) < Math.abs(best.deltaWatt) ||
      (Math.abs(delta) === Math.abs(best.deltaWatt) && w > best.watt)
    ) {
      best = {
        denominator: d,
        watt: w,
        deviceCost: cost.total,
        lossFraction: branchLossFraction(fuel, d, beltPerMinute),
        deltaWatt: delta,
      };
    }
  }
  return best;
}

/* ───────── 自定义震荡热能池：满速带 + 余量震荡 ───────── */

/** 一个取货口每分钟出料（个） */
export const PORT_ITEMS_PER_MINUTE = 30;

export interface PoolBandPlan {
  /** 满速热能池台数 */
  generators: number;
  /** 分流器个数：3 分器串联，n 个可提供 2n+1 个出口 */
  splitters: number;
  /** 取货口个数（单口 30 个/分，最多喂 20 台） */
  ports: number;
  /** 设备占用：每个取货口 1 + n 分流器 + m 热能池（满速带不放存货口） */
  deviceCost: number;
  /** 满速带总功率 */
  watt: number;
}

/** 满速带：m 台满速热能池 + 分流树 + 取货口，不含存货口 R */
export function bandPlanFor(
  fuel: Fuel,
  generators: number,
  portPerMinute: number = PORT_ITEMS_PER_MINUTE,
): PoolBandPlan {
  const m = Math.max(0, Math.floor(generators));
  if (m === 0) {
    return { generators: 0, splitters: 0, ports: 0, deviceCost: 0, watt: 0 };
  }
  const fullRate = Math.max(fullSpeedPerMinute(fuel), 1e-9);
  const maxPerPort = Math.max(1, Math.floor(portPerMinute / fullRate)); // 40s 电池 = 20
  const ports = Math.ceil(m / maxPerPort);
  const perPort = Math.ceil(m / ports);
  const splitters = Math.max(0, Math.ceil((perPort - 1) / 2));
  return {
    generators: m,
    splitters,
    ports,
    deviceCost: ports * 1 + splitters * ports + m,
    watt: m * fuel.power,
  };
}

export interface PoolRatePower {
  /** 总功率：满速带 + 余量震荡 */
  watt: number;
  /** 满速带明细 */
  bands: PoolBandPlan;
  /** 余量投料申请量（个/分）= maxPerMin − 满速带用量 */
  remainderPerMin: number;
  /** 余量实际投料（个/分）= 带速 / remainderDenominator；向下取档，恒 ≤ remainderPerMin；无档位时为 0 */
  remainderActualPerMin: number;
  /** 余量吸附后的震荡功率 */
  remainderWatt: number;
  /** 余量吸附到的分母；null = 没有可用震荡档位 */
  remainderDenominator: number | null;
  /** 余量支路设备占用（取货口 + 存货口 + 热能池 + 分流器） */
  remainderDeviceCost: number;
  /** 总设备占用 */
  deviceCost: number;
  /** 投料上限 */
  maxPerMin: number;
}

/**
 * 把「每分钟投料上限」折算成「满速带 + 余量震荡」。
 *
 * - 每满 1.5 个/分（40s 电池）= 1 台满速热能池，计入满速带；
 * - 满速带结构：取货口 + 分流器 + 热能池，**不放存货口**；
 * - 余量按 2^a·3^b 吸附成一条震荡支路（带存货口）。
 */
export function poolPowerForRate(
  fuel: Fuel,
  maxPerMin: number,
  options: {
    deviceLimit?: number;
    lossTolerance?: number;
    beltPerMinute?: number;
  } = {},
): PoolRatePower {
  const fullRate = Math.max(fullSpeedPerMinute(fuel), 1e-9);
  const limit = Math.max(0, Number(maxPerMin) || 0);
  const generators = Math.floor(limit / fullRate + 1e-9);
  const remainderPerMin = Math.max(0, limit - generators * fullRate);
  const bands = bandPlanFor(fuel, generators);

  let remainderWatt = 0;
  let remainderDenominator: number | null = null;
  let remainderDeviceCost = 0;
  let remainderActualPerMin = 0;
  if (remainderPerMin > 1e-9) {
    const wished = perMinuteToWatt(fuel, remainderPerMin);
    // 第 1 步：零头向下取档，保证实际投料 belt/D ≤ 申请的零头（即总投料 ≤ maxPerMin）。
    // 申请量低于最低可用档时 matched 为 null，零头整体不放（不再向上凑档超额投料）。
    const matched = matchDenominator(fuel, wished, {
      ...options,
      mode: "down",
    });
    if (matched) {
      remainderWatt = matched.watt;
      remainderDenominator = matched.denominator;
      remainderDeviceCost =
        deviceCostOfDenominator(matched.denominator)?.total ?? 0;
      remainderActualPerMin =
        (options.beltPerMinute ?? BELT_ITEMS_PER_MINUTE) / matched.denominator;
    }
  }

  return {
    watt: bands.watt + remainderWatt,
    bands,
    remainderPerMin,
    remainderActualPerMin,
    remainderWatt,
    remainderDenominator,
    remainderDeviceCost,
    deviceCost: bands.deviceCost + remainderDeviceCost,
    maxPerMin: limit,
  };
}
