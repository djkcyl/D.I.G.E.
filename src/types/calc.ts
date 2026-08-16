/**
 * 计算参数与结果类型定义
 */
import type { Fuel, FuelName } from "../utils/constants";

/** 手动常驻单行定义 */
export interface ManualBaseLine {
  /** 唯一标识（如 line_1） */
  id: string;
  /** 燃料 ID（对应 FUELS key） */
  fuelId: string;
  /** 热能池台数 */
  count: number;
}

/** 统一物料 BOM 归集条目 */
export interface UnifiedFuelBOMItem {
  fuelId: string;
  fuelName: FuelName;
  basePoolCount: number;
  baseRatePerMin: number;
  /** 震荡侧等效满载发生器估算台数（展示用） */
  oscGeneratorCount: number;
  oscRatePerMin: number;
  totalRatePerMin: number;
  totalRatePerHour: number;
  totalRatePerDay: number;
  /** 相对「震荡侧满载台数」的每日节省量（个/天）；常驻满载部分为 0 */
  savedRatePerDay: number;
  /** 综合节电率 (%)：相对 (base+osc满载台数) 满载消耗 */
  savedPercent: number;
}

/** 常驻供电明细（流程图 / UI） */
export interface BasePowerDetails {
  corePower: number;
  manualLines: Array<{
    fuel: Fuel;
    count: number;
    power: number;
  }>;
  autoBaseCount: number;
  autoBaseFuel?: Fuel;
  totalBasePower: number;
}

/** 震荡分支多燃料策略模式（显式枚举，含 legacy） */
export type MultiFuelMode =
  | "auto"
  | "legacy"
  | "mixed"
  | "primaryOnly"
  | "secondaryOnly";

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
  /** 用户手动配置的多燃料常驻行（本阶段不进分享 URL） */
  manualBaseLines?: ManualBaseLine[];
  /**
   * 是否启用自动整除补齐常驻。
   * - undefined 且无 manualBaseLines：旧默认 floor 逻辑（向后兼容）
   * - true：对剩余缺口用主燃料 floor 补齐
   * - false：不自动补齐
   */
  autoPlanBasePools?: boolean;
  /**
   * 震荡分支多燃料策略。
   * - 缺省 / undefined：按 'auto'（智能混编）处理
   * - auto：主 + 副 + 混合联合竞争
   * - legacy：主/副各自单燃料枚举，不混合
   * - mixed / primaryOnly / secondaryOnly：见 UI 文案
   */
  multiFuelMode?: MultiFuelMode;
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
  /** 分支所属燃料 ID；缺省 fallback 到方案 oscillatingFuel/fuel.id */
  fuelId?: string;
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
  /** 全网统一物料 BOM（增量） */
  fuelBOM?: UnifiedFuelBOMItem[];
  /** 常驻明细拆分（增量） */
  baseDetails?: BasePowerDetails;
  /** 是否为多燃料混合震荡方案 */
  isMixed?: boolean;
  [key: string]: unknown;
}
