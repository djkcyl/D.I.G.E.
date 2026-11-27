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
  poolUpMaxTenths,
  solveWithPoolAdjustChain,
  toRateTenths,
} from "./poolAdjustChain";
import { POOL_FEED_MAX_TENTHS, splitPoolFeed } from "./poolFeedSplit";

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

describe("poolUpMaxTenths：取 splitPoolFeedForFuel().fullSpeedPerMin", () => {
  it("40s 电池 → 15，且 1.5 = 1 台满速、零头 0", () => {
    for (const id of ["valleyLow", "valleyMid", "wulingLow", "wulingHigh"]) {
      const t = poolUpMaxTenths(mkParams(id, 1), 0);
      assert.equal(t, 15, id);
      const s = splitPoolFeed(id, t / 10);
      assert.equal(s.residentCount, 1, id);
      assert.equal(s.needsOscillation, false, id);
    }
  });
  it("满速 > 输入上限（源矿 7.5/分）→ 受 POOL_FEED_MAX_TENTHS 截到 15", () => {
    assert.equal(poolUpMaxTenths(mkParams("ore", 1), 0), 15);
  });
  it("无燃料 / 无池 → 0", () => {
    assert.equal(poolUpMaxTenths(mkParams("none", 1), 0), 0);
    assert.equal(poolUpMaxTenths(mkParams("valleyLow", 1), -1), 0);
    assert.equal(poolUpMaxTenths(mkParams("valleyLow", 1), 5), 0);
  });
});

describe("planPoolAdjustSteps：整数十分位步进", () => {
  it("降档 9→0、升档 11→upMax，全是整数", () => {
    const steps = planPoolAdjustSteps(3000, 10, 15);
    const down = steps.filter((s) => s.kind === "down").map((s) => s.tenths);
    const up = steps.filter((s) => s.kind === "up").map((s) => s.tenths);
    assert.deepEqual(down, [9, 8, 7, 6, 5, 4, 3, 2, 1, 0]);
    assert.deepEqual(up, [11, 12, 13, 14, 15]);
    for (const s of steps) assert.ok(Number.isInteger(s.tenths));
  });
  it("upMax = 0 → 不生成升档；起点已在上限 → 不生成升档", () => {
    assert.equal(
      planPoolAdjustSteps(3000, 10, 0).filter((s) => s.kind === "up").length,
      0,
    );
    assert.equal(
      planPoolAdjustSteps(3000, 15, 15).filter((s) => s.kind === "up").length,
      0,
    );
  });
  it("基准低于档位时先放宽冗余上限", () => {
    const relax = planPoolAdjustSteps(1200, 10, 15).filter(
      (s) => s.kind === "wasteRelax",
    );
    assert.deepEqual(
      relax.map((s) => s.maxWaste),
      [2000, 3000],
    );
  });
  it("异常大起点与升档上限先生成上限内的有限计划", () => {
    const atMax = planPoolAdjustSteps(1200, POOL_FEED_MAX_TENTHS, 15);
    for (const input of [16, 100, Number.MAX_SAFE_INTEGER]) {
      assert.deepEqual(planPoolAdjustSteps(1200, input, 15), atMax);
    }
    assert.deepEqual(
      planPoolAdjustSteps(1200, 5, Number.MAX_SAFE_INTEGER),
      planPoolAdjustSteps(1200, 5, POOL_FEED_MAX_TENTHS),
    );
    assert.equal(atMax.length, 2 + POOL_FEED_MAX_TENTHS);
    assert.ok(atMax.every((step) => step.tenths <= POOL_FEED_MAX_TENTHS));
  });
});

describe("solveWithPoolAdjustChain：升投料停在 1 台满速", () => {
  it("只有 1.5 能过预检 → direction up、toPerMin 1.5，不会越过 15", () => {
    const cand = [{ id: "a" }] as unknown as SolutionResult[];
    const res = solveWithPoolAdjustChain(mkParams("valleyLow", 1), {
      // 降到 0 时求解器无候选，迫使链走到升档
      solve: (_p, ctx) => ({ candidates: ctx.rateTenths === 0 ? [] : cand }),
      precheck: (p, c) => ({
        kept: toRateTenths(p.oscPools?.[0]?.maxPerMin) === 15 ? c : [],
        report: null,
      }),
      build: (kept) =>
        ({ solutions: kept, matrix: [] }) as unknown as SudokuDecisionMatrix,
      now: () => 0,
    });
    assert.equal(res.triggered, true);
    assert.equal(res.poolAdjust.direction, "up");
    assert.equal(res.poolAdjust.fromPerMin, 1);
    assert.equal(res.poolAdjust.toPerMin, 1.5);
    assert.equal(res.poolAdjust.requiredActualRatePerMin, 1.5);
    const maxTried = Math.max(...res.trace.map((a) => a.rateTenths));
    assert.equal(maxTried, 15);
    for (const a of res.trace) {
      assert.ok(Number.isInteger(a.rateTenths));
      assert.equal(a.ratePerMin, a.rateTenths / 10);
    }
  });

  it("全程无解 → exhausted，升档止于 15", () => {
    const cand = [{ id: "a" }] as unknown as SolutionResult[];
    const res = solveWithPoolAdjustChain(mkParams("valleyLow", 1.2), {
      solve: (_p, ctx) => ({ candidates: ctx.rateTenths === 0 ? [] : cand }),
      precheck: () => ({ kept: [], report: null }),
      build: (kept) =>
        ({ solutions: kept, matrix: [] }) as unknown as SudokuDecisionMatrix,
      now: () => 0,
    });
    assert.equal(res.exhausted, true);
    const up = res.trace
      .filter((a) => a.kind === "up")
      .map((a) => a.rateTenths);
    assert.deepEqual(up, [13, 14, 15]);
  });
});
