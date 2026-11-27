/**
 * 独立电池仿真器（仅供 selftest 交叉验证求解器使用）。
 *
 * 只读方案的结构字段，自己重建逐秒功率曲线：
 *   - 不调用 FactoryDesigner/_simulate()/PowerCycleSimulator；
 *   - 不读方案里的 batteryLog / powerLog / poolPowerLog / precise* 日志。
 *
 * 起算假设（与游戏机制对应）：
 *   1. t=0 时蓄电池满电（capacity）。每秒 battery += supply − targetPower，
 *      超过容量钳位到 capacity（溢出浪费）；低于 0 视为停机。
 *   2. supply 由以下部分叠加：
 *      a) 基础常驻：solution.baseConfig.totalPower，恒定；
 *      b) 系统震荡分支（solution.oscillating）：第 k 份燃料到达时刻
 *         = phaseOffsetCells × BELT_INTERVAL + k × branchInterval；
 *         热能池忙时排队：开始 = max(到达, 上一份结束)，燃烧 burnTime 秒，
 *         燃烧期间按燃料额定功率 fuel.power 供电（不用 branch.power 均值）；
 *      c) 自定义池满速带：bands.watt，恒定；
 *      d) 自定义池余量分支：间隔 2 × remainderDenominator、相位 0，
 *         同 b) 按额定功率脉冲供电（不用均值）。
 *      燃烧区间按与每个 1 秒格子的真实重叠时长计入（不对起止时刻取整）。
 *   3. 周期 = 所有脉冲分支间隔的最小公倍数（毫秒精度）；
 *      预热 = max(周期 × N, 最大相位偏移 + 周期)，N = 周期 > 1200s ? 1 : 2；
 *      预热结束后在一个完整周期内逐秒积分，统计最低电量与平均功率。
 *      最低电量的初值取满电（与求解器口径一致：检查窗口内最小值与容量取小）。
 */
import { GAME_CONFIG } from "../../src/config/game.ts";
import { resolveFuel } from "../../src/utils/constants.ts";

const BELT_INTERVAL = GAME_CONFIG.grid.beltInterval;
const LONG_PERIOD = GAME_CONFIG.solver.maxSimulationDuration;
const WARMUP_CYCLES = 2;

function gcd(a, b) {
  let x = a;
  let y = b;
  while (y) {
    const r = x % y;
    x = y;
    y = r;
  }
  return x;
}

function lcmSeconds(intervals) {
  let periodMs = 0;
  for (const iv of intervals) {
    const ms = Math.round(iv * 1000);
    periodMs = periodMs === 0 ? ms : (periodMs / gcd(periodMs, ms)) * ms;
  }
  return periodMs / 1000;
}

function fuelOf(id, overrides) {
  if (!id) return null;
  return resolveFuel(id, overrides) ?? null;
}

/**
 * @param {object} solution 求解器输出的单个方案（矩阵格子）
 * @param {object} opts
 * @param {number} opts.targetPower 用户输入的真实目标功率（未扣池）
 * @param {number} [opts.capacity=100000] 蓄电池容量（J）
 * @param {number} [opts.minPercent=5] 停机判定阈值（%）
 * @param {Array<{fuel: object, bandWatt: number, remainderDenominator: number|null}>} [opts.pools]
 *   自定义池的结构字段（来自 poolPowerForRate 的 bands / remainderDenominator）
 * @param {object} [opts.fuelOverrides]
 * @returns {{minBatteryPercent: number, avgPower: number, failedAt: number|null, period: number}}
 */
export function simulateSolution(
  solution,
  {
    targetPower,
    capacity = 100000,
    minPercent = 5,
    pools = [],
    fuelOverrides,
  } = {},
) {
  let constant = Number(solution?.baseConfig?.totalPower) || 0;
  const pulses = [];
  const defaultFuelId = solution?.oscillatingFuel?.id ?? solution?.fuel?.id;
  const fallbackInterval = Number(solution?.inputInterval) || BELT_INTERVAL;

  for (const b of solution?.oscillating ?? []) {
    const fuel = b.fuel ?? fuelOf(b.fuelId ?? defaultFuelId, fuelOverrides);
    if (!fuel) throw new Error(`batterySim: 无法解析分支燃料 ${b.fuelId}`);
    const interval =
      Number.isFinite(b.branchInterval) && b.branchInterval > 0
        ? b.branchInterval
        : b.denominator * fallbackInterval;
    const cells = Math.max(0, Math.round(Number(b.phaseOffsetCells) || 0));
    pulses.push({
      interval,
      offset: cells * BELT_INTERVAL,
      burnTime: fuel.burnTime,
      power: fuel.power,
    });
  }

  for (const pool of pools) {
    constant += Number(pool.bandWatt) || 0;
    const d = pool.remainderDenominator;
    if (d != null && d > 0) {
      pulses.push({
        interval: 2 * d,
        offset: 0,
        burnTime: pool.fuel.burnTime,
        power: pool.fuel.power,
      });
    }
  }

  const period =
    pulses.length > 0 ? lcmSeconds(pulses.map((p) => p.interval)) : 1;
  const cycles = period > LONG_PERIOD ? 1 : WARMUP_CYCLES;
  const maxOffset = pulses.reduce((m, p) => Math.max(m, p.offset), 0);
  const warmup = Math.max(period * cycles, maxOffset + period);
  const total = warmup + period;
  const size = Math.ceil(total);
  const timeline = new Float64Array(size);

  for (const p of pulses) {
    let lastEnd = 0;
    for (let k = 0; ; k += 1) {
      const arrive = p.offset + k * p.interval;
      if (arrive >= total) break;
      const start = Math.max(arrive, lastEnd);
      const end = start + p.burnTime;
      lastEnd = end;
      const stop = Math.min(Math.ceil(end), size);
      for (let i = Math.floor(start); i < stop; i += 1) {
        const overlap = Math.min(end, i + 1) - Math.max(start, i);
        if (overlap > 0) timeline[i] += p.power * overlap;
      }
    }
  }

  const minRequired = (capacity * minPercent) / 100;
  const checkStart = Math.floor(warmup);
  const checkEnd = Math.floor(total);
  let battery = capacity;
  let failedAt = null;

  for (let t = 0; t < checkStart; t += 1) {
    battery = Math.min(
      capacity,
      battery + constant + timeline[t] - targetPower,
    );
    if (battery < 0 && failedAt == null) failedAt = t;
  }

  let minBattery = capacity;
  let sum = 0;
  for (let t = checkStart; t < checkEnd; t += 1) {
    const supply = constant + timeline[t];
    sum += supply;
    battery = Math.min(capacity, battery + supply - targetPower);
    if (battery < minBattery) minBattery = battery;
    if (battery < minRequired && failedAt == null) failedAt = t;
  }

  const samples = Math.max(1, checkEnd - checkStart);
  return {
    minBatteryPercent: (minBattery / capacity) * 100,
    avgPower: sum / samples,
    failedAt,
    period,
  };
}
