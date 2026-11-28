/**
 * 游戏数值与共享口径配置（单一来源）。
 *
 * 把「跨模块共享」的数字集中在这里，避免 constants / oscBudget / shareParams /
 * types/matrix 各自维护一份。改口径只改本文件：
 *
 * - `solver`：求解窗口与仿真上限
 * - `grid`：基地与传送带的基础模型
 * - `device`：设备容量口径（分流器、端口、热能池）
 * - `share`：分享码容量上限
 *
 * 注意：`share.slots` 与 `share.poolRateScale` 属于**协议常量**，
 * 改动会让历史分享码失效，只能追加新字段，不能改旧值。
 */

export const GAME_CONFIG = {
  /** 求解器内部口径 */
  solver: {
    /** 允许功率浪费上限（W） */
    maxWaste: 1200,
    /** 蓄电底线（%） */
    minBatteryPercent: 5,
    /** 内部最多枚举的震荡支路数 */
    maxBranches: 4,
    /** 仿真周期硬上限（s），防止长周期 OOM */
    maxSimulationDuration: 1200,
    /** 单支投料间隔上限（s），超过视为跑不动 */
    maxBranchInterval: 600,
  },

  /** 基地与传送带模型 */
  grid: {
    /** 基地自带发电（W） */
    basePower: 200,
    /** 传送带速度（个/s） */
    beltSpeed: 0.5,
    /** 传送带间隔（s） */
    beltInterval: 2,
    /** 蓄电池容量（J） */
    batteryCapacity: 100000,
    /** 单个取货口产出（个/分钟） */
    portItemsPerMinute: 30,
  },

  /** 设备容量口径：整个方案合计可用 48 格 */
  device: {
    budget: 48,
    cost: {
      split3: 5,
      split2: 3,
      merger: 1,
      pickup: 1,
      storage: 1,
      generator: 1,
      limiter: 1,
    },
    /** 用三分器的支路需要 2 个存货口，全二分器 1 个就够 */
    storagePortsWithThree: 2,
    storagePortsBinaryOnly: 1,
  },

  /** 分享码协议容量（改动会破坏兼容，只允许追加） */
  share: {
    /** 最多携带的自定义震荡池条数 */
    poolSlots: 4,
    /** 最多携带的手动常驻行数 */
    baseSlots: 4,
    /** 池投料量编码倍率（0.1 个/分精度） */
    poolRateScale: 10,
    /** 池投料量编码上限（10 bit） */
    poolRateMax: 1023,
  },
} as const;

export type GameConfig = typeof GAME_CONFIG;
