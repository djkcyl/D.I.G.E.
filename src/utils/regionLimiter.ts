import type { FactoryRegion } from "../types/calc";
import { isCustomFuel } from "./constants";

export type { FactoryRegion };

/** 默认建设地区：自由建造（不施加跨区限速限制） */
export const DEFAULT_FACTORY_REGION: FactoryRegion = "free";

const FACTORY_REGIONS = new Set<FactoryRegion>(["free", "valley", "wuling"]);

/** 四号谷地可使用准入口限速的燃料（武陵电池除外；源矿通用） */
const VALLEY_LIMITER_FUELS = new Set([
  "ore",
  "valleyLow",
  "valleyMid",
  "valleyHigh",
]);

const WULING_BATTERY_FUELS = new Set(["wulingLow", "wulingMid"]);

/**
 * 将未知输入规范为有效建设地区。
 * 非法值回落为默认 free，避免调用方直接透传空值。
 */
export function normalizeFactoryRegion(value: unknown): FactoryRegion {
  if (
    typeof value === "string" &&
    FACTORY_REGIONS.has(value as FactoryRegion)
  ) {
    return value as FactoryRegion;
  }
  return DEFAULT_FACTORY_REGION;
}

/**
 * 判断某燃料在指定建设地区是否允许使用物品准入口限速器。
 *
 * 规则：
 * - free / wuling：全部允许
 * - valley：仅 ore 与谷地电池；武陵电池禁用限速（仅满速分流）
 * - 自定义燃料：始终允许
 */
export function isFuelLimiterSupported(
  fuelId: string,
  region: FactoryRegion | string = DEFAULT_FACTORY_REGION
): boolean {
  const resolvedRegion = normalizeFactoryRegion(region);
  if (resolvedRegion === "free" || resolvedRegion === "wuling") {
    return true;
  }
  if (!fuelId || fuelId === "none") {
    return true;
  }
  if (isCustomFuel(fuelId)) {
    return true;
  }
  if (resolvedRegion === "valley") {
    return VALLEY_LIMITER_FUELS.has(fuelId);
  }
  return true;
}

/**
 * UI：是否应对武陵电池显示跨区限速提示。
 * free / valley 下选择武陵电池时提示；wuling 不提示。
 */
export function shouldShowWulingCrossRegionLimiterHint(
  fuelId: string,
  region: FactoryRegion | string = DEFAULT_FACTORY_REGION
): boolean {
  if (!fuelId || fuelId === "none") {
    return false;
  }
  if (normalizeFactoryRegion(region) === "wuling") {
    return false;
  }
  return WULING_BATTERY_FUELS.has(fuelId);
}
