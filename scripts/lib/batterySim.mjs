/**
 * 独立电池仿真器（仅供 selftest 交叉验证求解器使用）。
 *
 * 只读方案的结构字段，自己重建逐秒功率曲线：
 *   - 不调用 FactoryDesigner/_simulate()/PowerCycleSimulator；
 *   - 不读方案里的 batteryLog / powerLog / poolPowerLog / precise* 日志。
 *
 * 起算假设（与游戏机制对应，见 docs/architecture.md「三之一」）：
 *   1. t=0 时蓄电池满电（capacity）。每秒 battery += supply − targetPower，
 *      超过容量钳位到 capacity（溢出浪费）；低于 0 视为停机。
 *   2. supply 由以下部分叠加：
 *      a) 基础常驻：solution.baseConfig.totalPower，恒定；
 *      b) 系统震荡分支（solution.oscillating）：
 *         - 带准入口（requiresLimiter && limiterSpeed = 6k，k<5）：格位级到达模型——
 *           母带每 BELT_INTERVAL 一个格位，按 5 格周期放行前 k 格（gateSlotPattern），
 *           放行的物品按分流树轮转，本支路取第 j ≡ leaf (mod localDenominator) 个
 *           （branchArrivalTimes）；
 *         - 不带准入口：均匀到达，第 m 份 = phaseOffsetCells × BELT_INTERVAL + m × branchInterval；
 *         热能池忙时排队：开始 = max(到达, 上一份结束)，燃烧 burnTime 秒，
 *         燃烧期间按燃料额定功率 fuel.power 供电（不用 branch.power 均值）；
 *      c) 自定义池满速带：bands.watt，恒定；
 *      d) 自定义池余量分支：间隔 2 × remainderDenominator、相位 0（不经准入口），
 *         同 b) 按额定功率脉冲供电。
 *      燃烧区间按与每个 1 秒格子的真实重叠时长计入（不对起止时刻取整）。
 *   3. 周期 = 所有脉冲分支到达序列周期的最小公倍数（毫秒精度）；
 *      准入口支路的序列周期 = 10s × L / gcd(L, k)（把 10s 限流周期算进去）。
 *      预热 = max(周期 × N, 最大相位偏移 + 周期)，N = 周期 > 1200s ? 1 : 2；
 *      预热结束后在一个完整周期内逐秒积分，统计最低电量与平均功率。
 *      最低电量的初值取满电（与求解器口径一致：检查窗口内最小值与容量取小）。
 *   opts.arrivalModel = "uniform" 可退回旧的均匀模型，仅用于新旧对比。
 */
import { GAME_CONFIG } from "../../src/config/game.ts";
import { POOL_INPUT_BUFFER, resolveFuel } from "../../src/utils/constants.ts";

/** 热能池入口缓存格数：统一来自 src/utils/constants.ts，这里转导出供 selftest 使用。 */
export { POOL_INPUT_BUFFER };

const BELT_INTERVAL = GAME_CONFIG.grid.beltInterval;
const LONG_PERIOD = GAME_CONFIG.solver.maxSimulationDuration;
const WARMUP_CYCLES = 2;
export const GATE_CYCLE_SLOTS = 5;
const GATE_STEP_PER_MIN = 6;

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

// ---------------------------------------------------------------------------
// 准入口格位模型（本地实现）。
// TODO(core-wire)：src/utils/inputRate.ts 导出 gateSlotPattern / branchArrivalTimes 后，
// 改为从那里 import 并删除下面的本地实现（selftest-gate-burst 同步改引用）。
// ---------------------------------------------------------------------------

function normalizeK(k) {
  return Math.max(0, Math.min(GATE_CYCLE_SLOTS, Math.round(Number(k) || 0)));
}

/** 准入口 6k/分 的单周期（5 格）放行序列：前 k 格放行，后 5−k 格空。 */
export function gateSlotPattern(k) {
  const n = normalizeK(k);
  return Array.from({ length: GATE_CYCLE_SLOTS }, (_, i) => i < n);
}

/**
 * 单支路到达时刻：母带逐格 → 准入口按 n-of-5 放行 → 分流树轮转，
 * 本支路拿放行序号 j ≡ leaf (mod localDenominator) 的物品。
 * @returns {number[]} 升序到达时刻（秒），只含 < horizon 的
 */
export function branchArrivalTimes({
  k,
  localDenominator,
  leaf = 0,
  offset = 0,
  horizon,
  beltInterval = BELT_INTERVAL,
}) {
  const pattern = gateSlotPattern(k);
  const L = Math.max(1, Math.round(Number(localDenominator) || 1));
  const target = ((Math.round(leaf) % L) + L) % L;
  const out = [];
  if (!pattern.some(Boolean)) return out;
  let j = 0;
  for (let s = 0; ; s += 1) {
    const t = offset + s * beltInterval;
    if (t >= horizon) break;
    if (!pattern[s % GATE_CYCLE_SLOTS]) continue;
    if (j % L === target) out.push(t);
    j += 1;
  }
  return out;
}

/** 准入口支路到达序列的重复周期：5 格周期 × L / gcd(L, k)。 */
export function gatedBranchPeriod(
  k,
  localDenominator,
  beltInterval = BELT_INTERVAL,
) {
  const n = normalizeK(k);
  const L = Math.max(1, Math.round(Number(localDenominator) || 1));
  if (n === 0) return Infinity;
  return (GATE_CYCLE_SLOTS * beltInterval * L) / gcd(L, n);
}

/**
 * 单台热能池（排队）在到达序列下的断烧段长度列表。
 * 只统计 [from, to] 内的断烧段。
 */
export function idleGaps(arrivals, burnTime, from = -Infinity, to = Infinity) {
  const gaps = [];
  let lastEnd = null;
  for (const a of arrivals) {
    if (lastEnd != null && a > lastEnd + 1e-9 && lastEnd >= from && a <= to) {
      gaps.push(Math.round((a - lastEnd) * 1e6) / 1e6);
    }
    const start = lastEnd == null ? a : Math.max(a, lastEnd);
    lastEnd = start + burnTime;
  }
  return gaps;
}

/**
 * 单台热能池入口排队统计（排队模型：开始 = max(到达, 上一份结束)）。
 * queued = 已到达件数 − 已开始燃烧件数（不含正在燃烧的那份），只在到达时刻增长。
 * @returns {{peak: number, overflowAt: number|null}} overflowAt：首次 queued > buffer 的到达时刻
 */
export function queueStats(arrivals, burnTime, buffer = POOL_INPUT_BUFFER) {
  const starts = [];
  let lastEnd = 0;
  let started = 0;
  let peak = 0;
  let overflowAt = null;
  arrivals.forEach((a, i) => {
    const s = Math.max(a, lastEnd);
    lastEnd = s + burnTime;
    starts.push(s);
    while (started < starts.length && starts[started] <= a + 1e-9) started += 1;
    const queued = i + 1 - started;
    if (queued > peak) peak = queued;
    if (queued > buffer && overflowAt == null) overflowAt = a;
  });
  return { peak, overflowAt };
}

function limiterKOf(branch) {
  if (!branch?.requiresLimiter) return null;
  const speed = Number(branch.limiterSpeed);
  if (!Number.isFinite(speed) || speed <= 0) return null;
  const k = speed / GATE_STEP_PER_MIN;
  if (Math.abs(k - Math.round(k)) > 1e-9) return null;
  return Math.round(k) < GATE_CYCLE_SLOTS ? Math.round(k) : null;
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
 * @param {"slot"|"uniform"} [opts.arrivalModel="slot"]
 * @returns {{minBatteryPercent: number, avgPower: number, failedAt: number|null, period: number, arrivalModel: string}}
 */
export function simulateSolution(
  solution,
  {
    targetPower,
    capacity = 100000,
    minPercent = 5,
    pools = [],
    fuelOverrides,
    arrivalModel = "slot",
    buffer = POOL_INPUT_BUFFER,
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
    const offset = cells * BELT_INTERVAL;
    const k = limiterKOf(b);
    const L = Number(b.localDenominator);
    if (arrivalModel === "slot" && k != null && Number.isFinite(L) && L > 0) {
      pulses.push({
        kind: "gated",
        k,
        localDenominator: L,
        period: gatedBranchPeriod(k, L),
        offset,
        burnTime: fuel.burnTime,
        power: fuel.power,
      });
    } else {
      pulses.push({
        kind: "uniform",
        interval,
        period: interval,
        offset,
        burnTime: fuel.burnTime,
        power: fuel.power,
      });
    }
  }

  for (const pool of pools) {
    constant += Number(pool.bandWatt) || 0;
    const d = pool.remainderDenominator;
    if (d != null && d > 0) {
      pulses.push({
        kind: "uniform",
        interval: 2 * d,
        period: 2 * d,
        offset: 0,
        burnTime: pool.fuel.burnTime,
        power: pool.fuel.power,
      });
    }
  }

  const period =
    pulses.length > 0 ? lcmSeconds(pulses.map((p) => p.period)) : 1;
  const cycles = period > LONG_PERIOD ? 1 : WARMUP_CYCLES;
  const maxOffset = pulses.reduce((m, p) => Math.max(m, p.offset), 0);
  const warmup = Math.max(period * cycles, maxOffset + period);
  const total = warmup + period;
  const size = Math.ceil(total);
  const timeline = new Float64Array(size);

  let queuePeak = 0;
  let overflowAt = null;
  let overflowKind = null;
  for (const p of pulses) {
    let arrivals;
    if (p.kind === "gated") {
      arrivals = branchArrivalTimes({
        k: p.k,
        localDenominator: p.localDenominator,
        offset: p.offset,
        horizon: total,
      });
    } else {
      arrivals = [];
      for (let m = 0; ; m += 1) {
        const arrive = p.offset + m * p.interval;
        if (arrive >= total) break;
        arrivals.push(arrive);
      }
    }
    // 池入口排队：瞬时排队超过入口缓存，或一个周期内到达量 × 燃烧时长 > 周期
    // （长期必然堵满，短仿真窗口里未必堆到上限），都判方案无效。
    const q = queueStats(arrivals, p.burnTime, buffer);
    if (q.peak > queuePeak) queuePeak = q.peak;
    const inCycle = arrivals.filter(
      (a) => a >= warmup - 1e-9 && a < total - 1e-9,
    ).length;
    const diverges = inCycle * p.burnTime > period + 1e-6;
    const at = q.overflowAt ?? (diverges ? warmup : null);
    if (at != null && (overflowAt == null || at < overflowAt)) {
      overflowAt = at;
      overflowKind = q.overflowAt != null ? "buffer" : "rate";
    }
    let lastEnd = 0;
    for (const arrive of arrivals) {
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
  // 堵带也算失败：并入 failedAt，只看 failedAt 的老调用方同样不会放行
  const valid = overflowAt == null;
  if (!valid) {
    const t = Math.floor(overflowAt);
    failedAt = failedAt == null ? t : Math.min(failedAt, t);
  }
  return {
    minBatteryPercent: (minBattery / capacity) * 100,
    avgPower: sum / samples,
    failedAt,
    period,
    arrivalModel,
    queuePeak,
    valid,
    invalidReason: valid ? null : `pool_buffer_overflow:${overflowKind}`,
  };
}
