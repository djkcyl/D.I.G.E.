/**
 * 客户端无解诊断（纯 UI 层启发式，不触碰求解内核）
 */
import type { CalcParams } from "../types/calc";
import { CONSTANTS, resolveFuel } from "./constants";
import {
  computePoolBatteryNeed,
  type PoolPrecheckReport,
} from "./poolBatteryPrecheck";

export interface DiagnosisResult {
  /** 第 8 步：弹窗标题覆盖（如「计算超时」）；缺省为「未找到解决方案」 */
  title?: string;
  primaryHint: string;
  secondaryHints: string[];
}

type TranslateFn = (
  key: string,
  vars?: Record<string, string | number>,
) => string;

/** 估算当前常驻功率（对齐 M1 calculateBasePower 语义，不含震荡） */
export function estimateBasePower(params: CalcParams): number {
  const corePower = CONSTANTS.BASE_POWER;
  const overrides = params.fuelOverrides;
  const lines = Array.isArray(params.manualBaseLines)
    ? params.manualBaseLines
    : [];

  let manualPower = 0;
  let hasManual = false;
  for (const line of lines) {
    if (!line || typeof line !== "object") continue;
    const fuel = resolveFuel(String(line.fuelId || ""), overrides);
    if (!fuel || !Number.isFinite(fuel.power) || fuel.power <= 0) continue;
    const count = Math.max(0, Math.floor(Number(line.count) || 0));
    if (count <= 0) continue;
    hasManual = true;
    manualPower += count * fuel.power;
  }

  const isLegacyDefault = !hasManual && params.autoPlanBasePools === undefined;
  const enableAuto = params.autoPlanBasePools === true || isLegacyDefault;

  let autoPower = 0;
  if (enableAuto) {
    const primary = resolveFuel(params.primaryFuelId || "wulingLow", overrides);
    const remaining = params.targetPower - corePower - manualPower;
    if (primary && primary.power > 0 && remaining > 0) {
      autoPower = Math.floor(remaining / primary.power) * primary.power;
    }
  }

  return corePower + manualPower + autoPower;
}

function maxOscFuelPower(params: CalcParams): number {
  const overrides = params.fuelOverrides;
  const primary = resolveFuel(params.primaryFuelId || "wulingLow", overrides);
  const secondaryId = params.secondaryFuelId;
  const secondary =
    secondaryId && secondaryId !== "none"
      ? resolveFuel(secondaryId, overrides)
      : undefined;
  const p = primary?.power && primary.power > 0 ? primary.power : 0;
  const s = secondary?.power && secondary.power > 0 ? secondary.power : 0;
  return Math.max(p, s, 0);
}

function hasManualBase(params: CalcParams): boolean {
  return (
    Array.isArray(params.manualBaseLines) &&
    params.manualBaseLines.some(
      (l) => l && Math.max(0, Math.floor(Number(l.count) || 0)) > 0,
    )
  );
}

function isAutoBaseEnabled(params: CalcParams, hasManual: boolean): boolean {
  if (params.autoPlanBasePools === true) return true;
  if (params.autoPlanBasePools === false) return false;
  // undefined: legacy default = auto floor when no manual lines
  return !hasManual;
}

function uniqueHints(hints: string[]): string[] {
  const seen = new Set<string>();
  return hints.filter((h) => {
    if (!h || seen.has(h)) return false;
    seen.add(h);
    return true;
  });
}

/**
 * 无解诊断：场景 A 功率缺口过大；场景 B 约束/配置偏紧。
 */
export function diagnoseNoSolution(
  params: CalcParams,
  t: TranslateFn,
  /** 第 3 步：worker 回传的池蓄电预检结果；null/undefined = 未触发或预检出错 */
  precheck?: PoolPrecheckReport | null,
): DiagnosisResult {
  // 场景 D（第 3 步）：候选解本来有，但富余都不够让蓄电池兜住池零头的熄火段，被预检全部剔除
  if (precheck?.allRemoved) {
    return {
      primaryHint: t("diagPoolSurplusNeeded", {
        need: Math.ceil(precheck.requiredWaste),
        toff: Math.round(precheck.tOff),
        remW: Math.round(precheck.remW),
      }),
      secondaryHints: uniqueHints([
        t("diagPoolBatteryDrain"),
        t("diagCheckDecisionMatrix"),
        t("diagAddManualBase"),
      ]),
    };
  }

  const maxBranches = 4;
  const basePower = estimateBasePower(params);
  const gapPower = Math.max(0, params.targetPower - basePower);
  const unitPower = maxOscFuelPower(params);
  const maxCap = maxBranches * unitPower;
  const manual = hasManualBase(params);
  const autoOn = isAutoBaseEnabled(params, manual);
  const hasSecondary =
    Boolean(params.secondaryFuelId) && params.secondaryFuelId !== "none";

  // 场景 A：缺口超过分支理论最大补齐
  if (unitPower > 0 && gapPower > maxCap + 1e-6) {
    const primaryHint = t("diagGapTooLarge", {
      gap: Math.round(gapPower),
      branches: maxBranches,
      maxCap: Math.round(maxCap),
    });
    const secondaryHints: string[] = [];
    if (!autoOn) {
      secondaryHints.push(t("diagEnableAutoBase"));
    }
    secondaryHints.push(t("diagAddManualBase"));
    secondaryHints.push(t("diagUpgradeFuel"));
    return { primaryHint, secondaryHints: uniqueHints(secondaryHints) };
  }

  // 场景 C：自定义震荡热能池的零头确实有熄火段，且蓄电池可用电量兜不住（wNeed > 0）。
  // 只「开了池」不算：整档无零头、熄火段为 0、或电池够兜底时都落到场景 B，避免把别的无解原因误判成掉电。
  let poolDrainsBattery = false;
  try {
    const need = computePoolBatteryNeed(params);
    poolDrainsBattery = Boolean(need && need.wNeed > 0);
  } catch {
    poolDrainsBattery = false;
  }
  if (poolDrainsBattery) {
    return {
      primaryHint: t("diagPoolBatteryDrain"),
      secondaryHints: uniqueHints([
        t("diagCheckDecisionMatrix"),
        t("diagAddManualBase"),
        t("diagEnableAutoBase"),
      ]),
    };
  }

  // 场景 B：综合约束
  const secondaryHints: string[] = [];
  secondaryHints.push(t("diagCheckDecisionMatrix"));
  if (!hasSecondary) {
    secondaryHints.push(t("diagTrySecondaryFuel"));
  }
  if (!manual && !autoOn) {
    secondaryHints.push(t("diagEnableAutoBase"));
    secondaryHints.push(t("diagAddManualBase"));
  }

  if (secondaryHints.length === 0) {
    return {
      primaryHint: t("diagGeneralFailure"),
      secondaryHints: [t("errorSuggestion")],
    };
  }

  return {
    primaryHint: t("diagGeneralFailure"),
    secondaryHints: uniqueHints(secondaryHints),
  };
}
