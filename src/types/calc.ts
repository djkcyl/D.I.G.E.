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
  /** 自定义震荡热能池的满速带台数（满速，不产生节省） */
  poolBandCount?: number;
  /** 自定义震荡热能池的余量震荡投料（个/分） */
  poolOscRatePerMin?: number;
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

/**
 * 厂址 / 建设地区（准入口限速与燃料兼容性）。
 * - free：不施加跨区限制（默认，兼容旧链接）
 * - valley：四号谷地 — 武陵电池不可用准入口限速
 * - wuling：武陵 — 向下兼容，全部燃料可限速
 */
export type FactoryRegion = "free" | "valley" | "wuling";

/** 自定义震荡池（单燃料 + 设备预算），可定义多条 */
export interface OscPoolConfig {
  /** 唯一 id（用于子标签与拖动排序） */
  id: string;
  /** 震荡池电池；none = 空槽（开关关闭时保留配置） */
  fuelId: string;
  /** 开关：关闭只是不参与计算，不清空配置 */
  enabled?: boolean;
  /** 该池可用的设备容量上限（二分器 3、三分器 5、取货口 1、存货口 1~2、热能池 1） */
  deviceLimit: number;
  /** 投料量上限（个/分钟）；满速带 + 余量由程序折算 */
  maxPerMin?: number;
  /** 兼容旧字段：期望瓦数（会被折算成投料量上限） */
  targetWatt?: number;
}

/** 侧边栏/计算器使用的完整参数 */
export interface CalcParams {
  targetPower: number;
  minBatteryPercent: number;
  maxWaste: number;
  primaryFuelId: string;
  secondaryFuelId: string;
  inputSourceId?: string;
  /**
   * 建设地区；缺省 / undefined → free（不限制）。
   * 影响「该燃料分支是否允许准入口限速枚举」。
   */
  factoryRegion?: FactoryRegion;
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
  phaseOffsetBranch4?: number;
  excludeBelt?: boolean;
  fuelOverrides?: Record<string, { power?: number; burnTime?: number }>;
  /** 用户手动配置的多燃料常驻行（本阶段不进分享 URL） */
  manualBaseLines?: ManualBaseLine[];
  /** 自定义震荡池（单燃料 + 设备预算） */
  oscPools?: OscPoolConfig[];
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
  /** 自定义震荡热能池的逐秒功率（与 powerLog 等长） */
  poolPowerLog?: number[];
  precisePowerLog: number[];
  preciseBurnStateLog: number[][];
  /** 每个日志点代表的秒数（仿真 sampleStep：period < 2000 为 1，否则 ceil(period/500)） */
  logSecondsPerPoint?: number;
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
  /** 调度链放宽了冗余上限：base = 原搜索窗，used = 实际出解用的上限（W） */
  wasteRelax?: WasteRelaxInfo;
  /** 调度链调整了自定义池投料量 */
  poolAdjust?: PoolAdjustInfo;
  /** 调度链每一步尝试的记录 */
  poolAdjustTrace?: PoolAdjustTraceStep[];
  /** 调度链因共用求解 deadline 到期而提前停止 */
  timedOut?: boolean;
  /** 调度链采用那次预检给出的最低富余（W，向上取整） */
  requiredSurplusW?: number;
  /** 自定义池实际投料拆分：满速常驻台数 + 震荡零头；没有启用池时不写 */
  poolFeedSplit?: PoolFeedSplitInfo[];
  /**
   * 方案 B：自定义池满速带（未钳制）≥ 目标 + 冗余上限的纯常驻解。
   * 物理成立但配置不优；UI 显示黄色警告条。peakW = 方案均值，overPercent = 超出目标的百分比。
   */
  poolOverSupply?: { peakW: number; targetW: number; overPercent: number };
  [key: string]: unknown;
}

/** 自定义池实际拆分记录（个/分）；供 UI 和回归核对，不是截断告警 */
export interface PoolFeedSplitInfo {
  /** 在 params.oscPools 里的下标 */
  index: number;
  id: string;
  fuelId: string;
  requestedPerMin: number;
  fullSpeedPerMin: number;
  /** 满速常驻热能池台数 */
  residentCount: number;
  /** 申请投料的零头；实际震荡吸附另按 oscBudget 的档位计算 */
  remainderPerMin: number;
  /** 满速带 + 零头支路的设备占用及当前预算 */
  deviceCost: number;
  deviceLimit: number;
}

/** 冗余上限放宽信息（W） */
export interface WasteRelaxInfo {
  base: number;
  used: number;
}

export type PoolAdjustDirection = "none" | "down" | "up";

/** 自定义池投料调整信息（个/分） */
export interface PoolAdjustInfo {
  direction: PoolAdjustDirection;
  fromPerMin: number;
  toPerMin: number;
  /** 要达到原需求实际需要的投料量（个/分），可选 */
  requiredActualRatePerMin?: number;
}

export type PoolAdjustTraceKind = "wasteRelax" | "down" | "up";

/** 调度链单步记录：before / after = 预检前后候选数 */
export interface PoolAdjustTraceStep {
  kind: PoolAdjustTraceKind;
  maxWaste: number;
  ratePerMin: number;
  before: number;
  after: number;
}
