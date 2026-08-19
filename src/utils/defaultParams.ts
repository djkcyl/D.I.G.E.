import type { CalcParams } from "../types/calc";

/** 应用默认计算参数（App 初始化 / 存档归一化共用） */
export const DEFAULT_PARAMS: CalcParams = {
  /** 中期玩家常用：约 5.8kW 电网 */
  targetPower: 5800,
  minBatteryPercent: 5,
  maxWaste: 300,
  maxBranches: 3,
  phaseOffsetBranch1: 0,
  phaseOffsetBranch2: 0,
  phaseOffsetBranch3: 0,
  excludeBelt: true,
  /** 排除物品准入口限速器：false=默认关=启用限速求解；true=开=忽略限速/满速 */
  excludeItemGateLimiter: false,
  /** 中容武陵 + 高容谷地，智能混编 + 自动常驻 */
  primaryFuelId: "wulingMid",
  secondaryFuelId: "valleyHigh",
  inputSourceId: "warehouse",
  /** 默认自由建造：不施加跨区限速限制，旧链接结果不变 */
  factoryRegion: "free",
  multiFuelMode: "auto",
  autoPlanBasePools: true,
};
