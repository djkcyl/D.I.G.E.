/**
 * poolAdjustChain 单测（node:test + tsx，0 新依赖）：
 *   pnpm exec tsx --test src/utils/poolAdjustChain.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { CalcParams, SolutionResult } from "../types/calc";
import type { SudokuDecisionMatrix } from "../types/matrix";
import {
  planPoolAdjustSteps,
  poolDownMinTenths,
  poolUpMaxTenths,
  solveWithPoolAdjustChain,
  toRateTenths,
} from "./poolAdjustChain";
import { splitPoolFeed } from "./poolFeedSplit";

const mkParams = (
  fuelId: string,
  maxPerMin: number,
  extra: Record<string, unknown> = {},
): CalcParams =>
  ({
    maxWaste: 3000,
    oscPools: [{ enabled: true, fuelId, maxPerMin }],
    ...extra,
  }) as unknown as CalcParams;

const fakeBuild = (kept: SolutionResult[]) =>
  ({ solutions: kept, matrix: [] }) as unknown as SudokuDecisionMatrix;

const successfulPrecheckAt =
  (target: number) => (p: CalcParams, candidates: SolutionResult[]) => ({
    kept: toRateTenths(p.oscPools?.[0]?.maxPerMin) === target ? candidates : [],
    report: null,
  });

describe("toRateTenths：与 toFeedTenths 同口径", () => {
  it("消掉浮点误差", () => {
    assert.equal(toRateTenths(0.1 + 0.2), 3);
    assert.equal(toRateTenths(1.45), 15);
    assert.equal(toRateTenths("1.4"), 14);
  });
  it("非法输入 → 0", () => {
    for (const v of [0, -1, Number.NaN, "abc", undefined, null]) {
      assert.equal(toRateTenths(v), 0);
    }
  });
});

describe("投料边界：当前常驻带，不是全局 1.5 上限", () => {
  it("全零头时，40s 电池仍可下降全部零头并升到 1.5", () => {
    for (const id of ["valleyLow", "valleyMid", "wulingLow", "wulingHigh"]) {
      assert.equal(poolUpMaxTenths(mkParams(id, 1), 0), 15, id);
      assert.equal(poolDownMinTenths(mkParams(id, 1), 0), 0, id);
      const s = splitPoolFeed(id, 1.5);
      assert.equal(s.residentCount, 1, id);
      assert.equal(s.needsOscillation, false, id);
    }
  });
  it("源矿 1.5 不再被截断，下一满速边界是 7.5", () => {
    assert.equal(poolUpMaxTenths(mkParams("ore", 1.5), 0), 75);
    assert.equal(poolDownMinTenths(mkParams("ore", 1.5), 0), 0);
  });
  it("4.4 保留 2 条常驻，只在 3.0～4.5 内调零头", () => {
    assert.equal(poolUpMaxTenths(mkParams("valleyLow", 4.4), 0), 45);
    assert.equal(poolDownMinTenths(mkParams("valleyLow", 4.4), 0), 30);
  });
  it("无燃料 / 无池 → 0", () => {
    assert.equal(poolUpMaxTenths(mkParams("none", 1), 0), 0);
    assert.equal(poolUpMaxTenths(mkParams("valleyLow", 1), -1), 0);
    assert.equal(poolDownMinTenths(mkParams("valleyLow", 1), 5), 0);
  });
});

describe("planPoolAdjustSteps：整数十分位升 / 降档", () => {
  it("无边界的旧零头：降档 9→0、升档 11→15", () => {
    const steps = planPoolAdjustSteps(3000, 10, 15);
    assert.deepEqual(
      steps.filter((s) => s.kind === "down").map((s) => s.tenths),
      [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
    );
    assert.deepEqual(
      steps.filter((s) => s.kind === "up").map((s) => s.tenths),
      [11, 12, 13, 14, 15],
    );
  });
  it("有多条常驻时不拆带：4.4 → 降到 3.0，升到 4.5", () => {
    const steps = planPoolAdjustSteps(3000, 44, 45, 30);
    assert.deepEqual(
      steps.filter((s) => s.kind === "down").map((s) => s.tenths),
      [43, 42, 41, 40, 39, 38, 37, 36, 35, 34, 33, 32, 31, 30],
    );
    assert.deepEqual(
      steps.filter((s) => s.kind === "up").map((s) => s.tenths),
      [45],
    );
  });
  it("基准低于档位时先放宽冗余上限", () => {
    assert.deepEqual(
      planPoolAdjustSteps(1200, 10, 15)
        .filter((s) => s.kind === "wasteRelax")
        .map((s) => s.maxWaste),
      [2000, 3000],
    );
  });
  it("区间比尝试预算更宽时，也不会跨过常驻带下边界", () => {
    const params = mkParams("valleyLow", 100);
    const steps = planPoolAdjustSteps(
      1200,
      toRateTenths(100),
      poolUpMaxTenths(params, 0),
      poolDownMinTenths(params, 0),
    );
    assert.equal(steps.length, 17);
    assert.ok(
      steps.every((step) => step.tenths >= 990 && step.tenths <= 1050),
      "100/分对应 66 条常驻，投料下边界是 99/分，不是 1.5",
    );
  });
  it("异常大输入仍最多 17 步（另加 initial），不构造无限数组", () => {
    const plans = [
      planPoolAdjustSteps(1200, 100, 15),
      planPoolAdjustSteps(1200, 5, Number.MAX_SAFE_INTEGER),
      planPoolAdjustSteps(
        1200,
        Number.MAX_SAFE_INTEGER,
        Number.MAX_SAFE_INTEGER,
      ),
    ];
    for (const plan of plans) {
      assert.equal(plan.length, 17);
      assert.ok(plan.every((step) => Number.isSafeInteger(step.tenths)));
    }
  });
});

describe("solveWithPoolAdjustChain：只调零头、保留常驻带", () => {
  it("全零头 1.0 → 只升至 1.5 成功，不越过第一台满速边界", () => {
    const cand = [{ id: "a" }] as unknown as SolutionResult[];
    const res = solveWithPoolAdjustChain(mkParams("valleyLow", 1), {
      solve: (_p, ctx) => ({ candidates: ctx.rateTenths === 0 ? [] : cand }),
      precheck: successfulPrecheckAt(15),
      build: fakeBuild,
      now: () => 0,
    });
    assert.equal(res.triggered, true);
    assert.equal(res.poolAdjust.direction, "up");
    assert.equal(res.poolAdjust.fromPerMin, 1);
    assert.equal(res.poolAdjust.toPerMin, 1.5);
    assert.equal(res.poolAdjust.requiredActualRatePerMin, 1.5);
    assert.equal(Math.max(...res.trace.map((a) => a.rateTenths)), 15);
  });

  it("4.4 → 不拆掉前 2 条常驻带，直到 4.5 成功", () => {
    const cand = [{ id: "a" }] as unknown as SolutionResult[];
    const res = solveWithPoolAdjustChain(mkParams("valleyLow", 4.4), {
      solve: () => ({ candidates: cand }),
      precheck: successfulPrecheckAt(45),
      build: fakeBuild,
      now: () => 0,
    });
    assert.equal(res.poolAdjust.direction, "up");
    assert.equal(res.poolAdjust.fromPerMin, 4.4);
    assert.equal(res.poolAdjust.toPerMin, 4.5);
    assert.ok(res.trace.every((a) => a.rateTenths >= 30));
    assert.equal(res.trace.at(-1)?.rateTenths, 45);
    assert.deepEqual(
      res.trace.filter((a) => a.kind === "down").map((a) => a.rateTenths),
      [43, 42, 41, 40, 39, 38, 37, 36, 35, 34, 33, 32, 31, 30],
    );
  });

  it("3.0 正好两台满速：直接从 3.0 向上尝试，不截回 1.5", () => {
    const cand = [{ id: "a" }] as unknown as SolutionResult[];
    const res = solveWithPoolAdjustChain(mkParams("valleyLow", 3), {
      solve: () => ({ candidates: cand }),
      precheck: () => ({ kept: [], report: null }),
      build: fakeBuild,
      now: () => 0,
    });
    assert.equal(res.exhausted, true);
    assert.equal(res.poolAdjust.fromPerMin, 3);
    assert.equal(res.trace[0].rateTenths, 30);
    assert.deepEqual(
      res.trace.filter((a) => a.kind === "down").map((a) => a.rateTenths),
      [],
    );
    assert.equal(res.trace.length, 16, "base 已足，initial + 15 次有限上调");
  });
});
