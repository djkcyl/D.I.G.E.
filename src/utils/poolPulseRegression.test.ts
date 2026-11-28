/**
 * 回归：四号谷地 5965 / 主燃料高容谷地 / 高容武陵池 0.5/分（1/64 零头、0 满带）/ 蓄电池 100 kJ。
 *
 * 游戏实测推翻过旧解「1 路·十瓦级 5988.9 W、最低 77%、周期 01:30」：
 * 池零头每 128 s 到一颗，按 6400 W 烧 40 s、熄火 88 s（平均 2000 W）。
 * 熄火段净流出 ≈ 2465 × 88 − 1100 × 40 ≈ 173 kJ > 100 kJ，该 1 路方案必须判为不可行。
 * 旧实现把池画成 2000 W 脉冲且未进 LCM（period = 90），电量曲线等价于「池恒定 2000 W」。
 *
 *   pnpm exec tsx --test src/utils/poolPulseRegression.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { CalcParams, SolutionResult } from "../types/calc";
import { DEFAULT_PARAMS } from "./defaultParams";
import { FactoryDesigner } from "./FactoryDesigner";

const TARGET = 5965;
const CAPACITY = 100000;
const POOL_CYCLE = 128; // 1/64 零头：2 × 64 s
const POOL_BURN = 40;
const POOL_PULSE = 6400; // 高容武陵电池额定功率
const POOL_AVG = 2000; // 6400 × 40 / 128
const LCM = 5760; // lcm(90, 128)

const CASE = {
  targetPower: TARGET,
  factoryRegion: "valley",
  primaryFuelId: "valleyHigh",
  secondaryFuelId: "none",
  batteryCapacity: CAPACITY,
  oscPools: [
    {
      id: "p1",
      fuelId: "wulingHigh",
      enabled: true,
      deviceLimit: 48,
      maxPerMin: 0.5,
    },
  ],
};

const makeDesigner = () =>
  new FactoryDesigner({ ...DEFAULT_PARAMS, ...CASE } as unknown as CalcParams);

/** 独立手算：基础 3500 W + 1 路 1/45（1100 W 每 90 s 烧 40 s）+ 池，两个 LCM 周期取第二个的最低电量 */
function handSimMinBattery(poolAt: (t: number) => number): number {
  let battery = CAPACITY;
  let minBattery = CAPACITY;
  for (let lap = 0; lap < 2; lap++) {
    for (let t = 0; t < LCM; t++) {
      const gen = 3500 + (t % 90 < 40 ? 1100 : 0) + poolAt(t);
      battery = Math.min(CAPACITY, battery + gen - TARGET);
      if (lap === 1) minBattery = Math.min(minBattery, battery);
    }
  }
  return minBattery;
}

const pulsePool = (t: number) => (t % POOL_CYCLE < POOL_BURN ? POOL_PULSE : 0);
const averagedPool = () => POOL_AVG;

describe("池零头脉冲回归：5965 / 高容武陵 0.5/分 / 100 kJ", () => {
  it("池零头按 6400 W 脉冲建模，平均功率仍是 2000 W", () => {
    const d = makeDesigner();
    assert.equal(d.poolBandWatt, 0, "0 条满带");
    assert.equal(d.poolBranches.length, 1);
    const [branch] = d.poolBranches;
    assert.equal(branch.denominator, 64);
    assert.equal(branch.branchInterval, POOL_CYCLE);
    assert.equal(branch.power, POOL_PULSE, "分支功率必须是瞬时功率而非平均值");
    assert.ok(Math.abs(d.poolPower - POOL_AVG) < 1e-6, "池平均功率 2000 W");
    const segAvg = d.poolSegments.reduce(
      (sum, seg) =>
        sum +
        seg.constant +
        (seg.cycle > 0 ? (seg.pulseWatt * seg.onDuration) / seg.cycle : 0),
      0,
    );
    assert.ok(
      Math.abs(segAvg - POOL_AVG) < 1e-6,
      `poolSegments 均值 ${segAvg}`,
    );
  });

  it("手算对照：1/45 单路方案按脉冲必然耗尽，按池恒定 2000 W 才会误判可行", () => {
    assert.ok(handSimMinBattery(pulsePool) <= 0, "脉冲模型 minBattery ≤ 0");
    assert.ok(handSimMinBattery(averagedPool) > 0, "平均模型（旧 bug）> 0");
  });

  it("不再给出 1 路 5988.9 W 方案，决策盘 1 路·十瓦级格为空", () => {
    const candidates = makeDesigner().solveCandidates();
    const bad = candidates.filter(
      (s) =>
        (s.branchCount ?? 0) <= 1 && Math.abs(s.avgPower - 5988.888889) < 1,
    );
    assert.deepEqual(
      bad.map((s) => ({
        bc: s.branchCount,
        period: s.period,
        minB: s.minBattery,
      })),
      [],
    );
    const matrix = makeDesigner().solve().matrix as unknown as Array<
      Array<SolutionResult | null>
    >;
    assert.equal(matrix[0][0] ?? null, null, "1 路·十瓦级格必须为空");
  });

  it("所有候选：周期是 128 的倍数、电池不耗尽、池曲线均值 2000 W", () => {
    const candidates = makeDesigner().solveCandidates();
    for (const s of candidates) {
      const tag = `bc=${s.branchCount} avg=${s.avgPower.toFixed(1)} period=${s.period}`;
      assert.equal(s.period % POOL_CYCLE, 0, `${tag}：池零头必须进入 LCM 周期`);
      assert.ok(s.minBattery > 0, `${tag}：minBattery=${s.minBattery}`);
      const log = s.poolPowerLog;
      if (Array.isArray(log) && log.length === s.period) {
        const mean = log.reduce((a, b) => a + b, 0) / log.length;
        assert.ok(Math.abs(mean - POOL_AVG) < 1e-6, `${tag}：池均值 ${mean}`);
        assert.equal(Math.max(...log), POOL_PULSE, `${tag}：池峰值应为 6400 W`);
      }
      assertPoolLogOnSecondAxis(s, pulsePool, tag);
    }
  });

  it("solutions 里没有 minBattery > 0 的 1 路·十瓦级解（游戏实测 00:00:39 后耗尽）", () => {
    const result = makeDesigner().solve() as unknown as {
      solutions?: SolutionResult[];
    };
    const fake = (result.solutions ?? []).filter(
      (s) =>
        (s.branchCount ?? 0) <= 1 &&
        s.avgPower - TARGET >= 0 &&
        s.avgPower - TARGET <= 100 &&
        s.minBattery > 0,
    );
    assert.deepEqual(
      fake.map((s) => ({
        avg: s.avgPower,
        minB: s.minBattery,
        period: s.period,
      })),
      [],
    );
  });
});

/** poolPowerLog[i] 对应第 i × logSecondsPerPoint 秒 */
function assertPoolLogOnSecondAxis(
  s: SolutionResult,
  at: (seconds: number) => number,
  tag: string,
): void {
  const log = s.poolPowerLog;
  if (!Array.isArray(log)) return;
  const step = s.logSecondsPerPoint ?? 1;
  for (let i = 0; i < log.length; i++) {
    assert.equal(
      log[i],
      at(i * step),
      `${tag}：poolPowerLog[${i}]（${i * step} s）`,
    );
  }
}

describe("poolPowerLog 时间轴：下标 × logSecondsPerPoint 秒", () => {
  it("5980 谷地（period 5760、step 12）：[3]=6400（36 s），[4]=0（48 s）", () => {
    const d = new FactoryDesigner({
      ...DEFAULT_PARAMS,
      ...CASE,
      targetPower: 5980,
      secondaryFuelId: "wulingMid",
    } as unknown as CalcParams);
    const long = d
      .solveCandidates()
      .filter((s) => s.period === LCM && Array.isArray(s.poolPowerLog));
    assert.ok(long.length > 0, "应至少有一个 period=5760 的带池候选");
    for (const s of long) {
      const log = s.poolPowerLog as number[];
      assert.equal(s.logSecondsPerPoint, 12);
      assert.equal(log.length, LCM / 12);
      assert.equal(log[3], POOL_PULSE, "36 s 仍在燃烧段");
      assert.equal(log[4], 0, "48 s 已熄火");
      assertPoolLogOnSecondAxis(s, pulsePool, `5980 bc=${s.branchCount}`);
    }
  });
});

describe("正向用例：9415 武陵 / 中容武陵主燃料 / 高容武陵池 1.5/分满速 / 设备上限 48", () => {
  it("有解，池为 6400 W 常驻直线（无零头、不进 LCM）", () => {
    const d = new FactoryDesigner({
      ...DEFAULT_PARAMS,
      targetPower: 9415,
      factoryRegion: "wuling",
      primaryFuelId: "wulingMid",
      secondaryFuelId: "none",
      oscPools: [
        {
          id: "p1",
          fuelId: "wulingHigh",
          enabled: true,
          deviceLimit: 48,
          maxPerMin: 1.5,
        },
      ],
    } as unknown as CalcParams);
    assert.equal(d.poolBandWatt, POOL_PULSE, "1 条满带 = 6400 W");
    assert.equal(d.poolBranches.length, 0, "满速无零头分支");
    assert.ok(Math.abs(d.poolPower - POOL_PULSE) < 1e-6);
    const candidates = d.solveCandidates();
    assert.ok(candidates.length > 0, "9415 武陵应有解");
    for (const s of candidates) {
      const tag = `9415 bc=${s.branchCount} period=${s.period}`;
      assert.ok(s.minBattery > 0, `${tag}：minBattery=${s.minBattery}`);
      const log = s.poolPowerLog;
      if (Array.isArray(log)) {
        assert.ok(log.length > 0);
        assert.ok(
          log.every((w) => w === POOL_PULSE),
          `${tag}：池曲线应恒为 6400 W`,
        );
      }
    }
  });
});
