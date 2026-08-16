/**
 * 计算参数与结果类型定义
 */
import type { Fuel } from "../utils/constants";

/** 侧边栏/计算器使用的完整参数 */
export interface CalcParams {
  targetPower: number;
  minBatteryPercent: number;
  maxWaste: number;
  primaryFuelId: string;
  secondaryFuelId: string;
  inputSourceId?: string;
  /** 物品准入口限速档位（个/分钟）。null/undefined = 不限速（遗留字段，求解不再读取） */
  inputRateLimitPerMin?: 0 | 6 | 12 | 18 | 24 | 30 | null;
  /**
   * 排除物品准入口限速器（侧栏开关）。
   * - false / undefined（默认关）：启用限速求解（分支 k/5 自动枚举）
   * - true（开）：排除/忽略限速，恢复满速普通分流
   */
  excludeItemGateLimiter?: boolean;
  maxBranches?: number;
  phaseOffsetBranch1?: number;
  phaseOffsetBranch2?: number;
  phaseOffsetBranch3?: number;
  excludeBelt?: boolean;
  fuelOverrides?: Record<string, { power?: number; burnTime?: number }>;
  [key: string]: unknown;
}

/** 单分支配置 */
export interface OscillatingBranch {
  denominator: number;
  phaseOffsetCells: number;
  power: number;
  blueprint?: (Record<string, unknown> | null)[][];
  /** 准入口限速（个/分钟）；null = 不限速 */
  limiterSpeed?: number | null;
  /** 是否需要前置准入口限速器 */
  requiresLimiter?: boolean;
  /** 限速后本地分流分母（2^a·3^b） */
  localDenominator?: number;
  /** 分支物品到达间隔（s） */
  branchInterval?: number;
  splitterCount?: { split2: number; split3: number; total: number };
  description?: string;
  [key: string]: unknown;
}

/** 计算器 solve() 返回的单条方案 */
export interface SolutionResult {
  baseConfig: { totalPower: number; generators: number; belts: number };
  baseFuel: Fuel;
  oscillating: OscillatingBranch[] | null;
  oscillatingFuel: Fuel | null;
  fuel: Fuel;
  isPrimary: boolean;
  inputInterval: number;
  inputSourceId: string;
  /** 生效的准入口限速（个/分钟）；null = 未限速 */
  rateLimitPerMin?: number | null;
  /** 是否处于准入口限速状态 */
  isRateLimited?: boolean;
  excludeBelt: boolean;
  avgPower: number;
  waste: number;
  variance: number;
  period: number;
  minBattery: number;
  minBatteryPercent: number;
  branchCount: number;
  totalSplitters: number;
  batteryLog: number[];
  powerLog: number[];
  burnStateLog: number[][];
  preciseBatteryLog: number[];
  precisePowerLog: number[];
  preciseBurnStateLog: number[][];
  fuelConsumption: {
    base: {
      fuel: Fuel;
      perSecond: number;
      perMinute: number;
      perHour: number;
      perDay: number;
    };
    oscillating: {
      fuel: Fuel | null;
      perSecond: number;
      perMinute: number;
      perHour: number;
      perDay: number;
    };
  };
  [key: string]: unknown;
}
