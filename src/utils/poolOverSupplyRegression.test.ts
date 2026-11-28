/**
 * 回归（方案 B）：自定义池满速带额定功率 ≥ 目标 + 冗余上限的纯常驻解，
 * 物理成立（恒定供给、蓄电池不掉电）→ 放出并标记 poolOverSupply（配置不优），不混进通用无解。
 * 其它 waste > 上限的候选照常过滤；真无解时诊断给出 poolExceedsTarget。
 *
 *   pnpm exec tsx src/utils/poolOverSupplyRegression.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { CalcParams } from "../types/calc";
import { DEFAULT_PARAMS } from "./defaultParams";
import { FactoryDesigner } from "./FactoryDesigner";
import { diagnoseNoSolution } from "./failureDiagnose";
import { filterByPoolBattery } from "./poolBatteryPrecheck";

const t = (key: string, vars?: Record<string, string | number>) =>
  vars ? `${key}${JSON.stringify(vars)}` : key;

const mkParams = (
  targetPower: number,
  fuelId: string,
  maxPerMin: number,
  extra: Record<string, unknown> = {},
): CalcParams =>
  ({
    ...DEFAULT_PARAMS,
    factoryRegion: "valley",
    primaryFuelId: "valleyHigh",
    secondaryFuelId: "none",
    targetPower,
    oscPools: [{ id: "p1", fuelId, enabled: true, deviceLimit: 48, maxPerMin }],
    ...extra,
  }) as unknown as CalcParams;

const solveAll = (p: CalcParams) => {
  const candidates = new FactoryDesigner(p).solveCandidates();
  const matrix = new FactoryDesigner(p).solve();
  return { candidates, solutions: matrix.solutions };
};

describe("方案 B：池满速带超出目标的纯常驻解", () => {
  it("wulingHigh 1.5/分 @ 4000 → 1 解，waste ≈ 2600，电池 > 50%，overPercent ≈ 65", () => {
    const p = mkParams(4000, "wulingHigh", 1.5);
    const { candidates, solutions } = solveAll(p);
    assert.equal(candidates.length, 1);
    assert.equal(solutions.length, 1);
    const [sol] = solutions;
    assert.ok(Math.abs(sol.waste - 2600) < 1, `waste=${sol.waste}`);
    assert.ok(Math.abs(sol.avgPower - 6600) < 1, `avg=${sol.avgPower}`);
    assert.ok(sol.minBatteryPercent > 50, `minB%=${sol.minBatteryPercent}`);
    assert.ok(sol.poolOverSupply, "必须挂 poolOverSupply");
    assert.ok(Math.abs(sol.poolOverSupply.overPercent - 65) < 0.5);
    assert.equal(sol.poolOverSupply.targetW, 4000);
    assert.ok(Math.abs(sol.poolOverSupply.peakW - 6600) < 1);
    // 池蓄电预检（主流程不改）不剔除它
    const { kept } = filterByPoolBattery(p, candidates);
    assert.equal(kept.length, 1);
  });

  it("valleyHigh 8/分 @ 7500 → 5 条常驻 + 0.5 零头能正常出解，不再套用旧的截断后 8 解", () => {
    const designer = new FactoryDesigner(mkParams(7500, "valleyHigh", 8));
    assert.equal(designer.poolBandWatt, 5500);
    assert.ok(designer.poolPower > designer.poolBandWatt);
    const { solutions } = designer.solve();
    assert.ok(solutions.length > 0);
    for (const s of solutions) {
      assert.equal(s.poolOverSupply, undefined);
      assert.equal(s.poolFeedSplit?.[0].residentCount, 5);
    }
  });

  it("valley 5965 / 主 valleyHigh / 池 wulingHigh 0.5/分 → 仍为 1 解", () => {
    const { solutions } = solveAll(
      mkParams(5965, "wulingHigh", 0.5, { batteryCapacity: 100000 }),
    );
    assert.equal(solutions.length, 1);
    assert.equal(solutions[0].poolOverSupply, undefined);
  });

  it("普通超限候选照常过滤：wulingHigh 1.5/分 @ 5300（6400 < 5300 + 1200）→ 无解 + poolExceedsTarget", () => {
    const p = mkParams(5300, "wulingHigh", 1.5);
    const { candidates, solutions } = solveAll(p);
    assert.equal(candidates.length, 0);
    assert.equal(solutions.length, 0);
    const diag = diagnoseNoSolution(p, t, null);
    assert.ok(
      diag.primaryHint.startsWith("diagPoolExceedsTarget"),
      diag.primaryHint,
    );
    assert.equal(diag.surplusW, 1100, "surplusW = 6400 − 5300");
  });

  it("wulingHigh 2.0/分 @ 70000：保留 1 条常驻 + 0.5 零头，方案挂 poolFeedSplit", () => {
    const p = mkParams(70000, "wulingHigh", 2.0);
    const designer = new FactoryDesigner(p);
    assert.equal(designer.poolBandWatt, 6400);
    assert.equal(designer.poolBranches.length, 1);
    assert.ok(Math.abs(designer.poolPower - 8400) < 1e-6);
    const { solutions } = solveAll(p);
    assert.ok(solutions.length > 0);
    for (const s of solutions) {
      assert.equal(s.poolOverSupply, undefined);
      const feed = s.poolFeedSplit?.[0];
      assert.ok(feed, "方案必须携带实际拆分明细");
      assert.equal(feed.residentCount, 1);
      assert.ok(Math.abs(feed.remainderPerMin - 0.5) < 1e-9);
      assert.equal(feed.requestedPerMin, 2);
    }
  });

  it("valleyHigh 4.4/分：构造器保留 2 条满速常驻 + 1.4 零头，不再截成 1 条", () => {
    const designer = new FactoryDesigner(mkParams(12000, "valleyHigh", 4.4));
    assert.equal(designer.poolBandWatt, 2200);
    assert.equal(designer.poolBranches.length, 1);
    assert.ok(designer.poolPower > designer.poolBandWatt);
    const [feed] = designer.poolFeedSplit;
    assert.equal(feed.requestedPerMin, 4.4);
    assert.equal(feed.fullSpeedPerMin, 1.5);
    assert.equal(feed.residentCount, 2);
    assert.ok(Math.abs(feed.remainderPerMin - 1.4) < 1e-9);
    assert.equal(feed.deviceLimit, 48);
    assert.ok(feed.deviceCost > 0);
  });
});
