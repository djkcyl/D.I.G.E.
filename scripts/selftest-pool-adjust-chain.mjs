/**
 * 预检剔光后的调整链自测（放宽冗余上限 → 降投料 → 升投料）。
 * Prefer: pnpm exec tsx scripts/selftest-pool-adjust-chain.mjs
 *
 * 求解 / 预检全部用假回调，不跑真求解器：
 * - 第 1 档有解 / 第 2 档才有解 / 基准 ≥ 2000 跳过第 1 档 / 基准 ≥ 3000 直接降投料
 * - 降到 0 有解且没调预检；多池时降到 0 仍预检
 * - 只有升档有解（requiredActualRatePerMin）
 * - 全部无解：trace 完整（1 + 2 + 5 + 10 = 18 次）
 * - 超时 { timedOut, lastStep }、回调抛错 fail-open、普通无解不进链
 * - comparePoolAdjust 排序、真建盘时格子上挂 poolAdjust / wasteRelax、十分位无漂移
 */
import assert from "node:assert/strict";
import {
  comparePoolAdjust,
  effectiveMaxWaste,
  MAX_WASTE_RELAX_TIERS_W,
  planPoolAdjustSteps,
  poolUpMaxTenths,
  solveWithPoolAdjustChain,
  toRateTenths,
} from "../src/utils/poolAdjustChain.ts";
import { POOL_FEED_MAX_TENTHS } from "../src/utils/poolFeedSplit.ts";

const POOL = {
  id: "p1",
  fuelId: "wulingHigh",
  enabled: true,
  deviceLimit: 48,
  maxPerMin: 0.5,
};
const mkParams = (over = {}, poolOver = {}, extraPools = []) => ({
  targetPower: 5965,
  minBatteryPercent: 5,
  maxWaste: 1000,
  primaryFuelId: "x",
  secondaryFuelId: "none",
  oscPools: [{ ...POOL, ...poolOver }, ...extraPools],
  ...over,
});
const sol = (waste, tag) => ({
  waste,
  branchCount: 1,
  totalSplitters: 2,
  variance: 0,
  oscillating: [{}],
  tag,
});
const fakeBuild = (kept) => ({
  matrix: [],
  defaultSelection: null,
  solutions: [...kept],
});
const steps = (r) =>
  r.trace.map((a) => `${a.kind}:${a.maxWaste}:${a.rateTenths}`);

/** 假世界：feasible(ctx) 决定预检是否放行，emptyAt(ctx) 决定求解器是否本来就无候选 */
function world({
  feasible = () => false,
  emptyAt = () => false,
  throwSolveAt = 0,
  throwPrecheckAt = 0,
  clockStep = 0,
  build = fakeBuild,
} = {}) {
  const calls = { solve: [], precheck: [] };
  let clock = 0;
  const deps = {
    now: () => clock,
    build,
    solve(p, ctx) {
      calls.solve.push({
        ...ctx,
        maxWasteParam: p.maxWaste,
        pool: p.oscPools?.[0] ? { ...p.oscPools[0] } : null,
      });
      clock += clockStep;
      if (throwSolveAt === calls.solve.length) throw new Error("boom-solve");
      if (emptyAt(ctx)) return { candidates: [], secondaryId: null };
      return {
        candidates: [sol(300, ctx.kind), sol(800, ctx.kind)],
        secondaryId: null,
      };
    },
    precheck(_p, candidates) {
      const ctx = calls.solve[calls.solve.length - 1];
      calls.precheck.push(ctx);
      if (throwPrecheckAt === calls.precheck.length) {
        throw new Error("boom-precheck");
      }
      const ok = feasible(ctx);
      return {
        kept: ok ? candidates : [],
        report: { allRemoved: !ok && candidates.length > 0 },
      };
    },
  };
  return { deps, calls };
}

// ── 0. 常量与十分位 ───────────────────────────────────────────────
assert.deepEqual([...MAX_WASTE_RELAX_TIERS_W], [2000, 3000]);
assert.equal(POOL_FEED_MAX_TENTHS, 15);
assert.equal(poolUpMaxTenths(mkParams(), 0), 15, "wulingHigh 40s → 1.5/min");
assert.equal(poolUpMaxTenths(mkParams({}, { fuelId: "none" }), 0), 0);
assert.equal(poolUpMaxTenths(mkParams(), 9), 0, "missing pool");
assert.equal(effectiveMaxWaste(mkParams()), 1200, "base = max(1200, 1000)");
assert.equal(effectiveMaxWaste(mkParams({ maxWaste: 2500 })), 2500);
assert.equal(toRateTenths(0.3), 3);
assert.equal(toRateTenths(0.15), 2);
assert.equal(toRateTenths(-1), 0);
assert.equal(toRateTenths("abc"), 0);
assert.equal(planPoolAdjustSteps(1200, 5, 15).length, 2 + 5 + 10);
assert.equal(planPoolAdjustSteps(1200, 15, 15).length, 2 + 15 + 0);
assert.equal(
  planPoolAdjustSteps(1200, 5, 0).length,
  2 + 5 + 0,
  "no fuel → no up",
);
console.log("  ✓ constants / tenths / plan size");

// ── 1. 第 1 档就有解 ──────────────────────────────────────────────
{
  const { deps, calls } = world({ feasible: (c) => c.maxWaste >= 2000 });
  const r = solveWithPoolAdjustChain(mkParams(), deps);
  assert.deepEqual(steps(r), ["initial:1200:5", "wasteRelax:2000:5"]);
  assert.equal(r.triggered, true);
  assert.deepEqual(r.wasteRelax, { base: 1200, used: 2000 });
  assert.deepEqual(r.poolAdjust, {
    direction: "none",
    fromPerMin: 0.5,
    toPerMin: 0.5,
  });
  assert.equal(r.result.solutions.length, 2);
  assert.equal(r.result.solutions[0].poolAdjust.direction, "none");
  assert.equal(r.result.solutions[0].wasteRelax.used, 2000);
  assert.equal(calls.solve[1].maxWasteParam, 2000, "params.maxWaste synced");
  assert.equal(calls.solve[1].pool.maxPerMin, 0.5, "rate kept");
  assert.equal(r.trace[1].candidatesBefore, 2);
  assert.equal(r.trace[1].candidatesAfter, 2);
  console.log("  ✓ tier 1 (2000W) solves");
}

// ── 2. 第 2 档才有解 ──────────────────────────────────────────────
{
  const { deps } = world({ feasible: (c) => c.maxWaste >= 3000 });
  const r = solveWithPoolAdjustChain(mkParams(), deps);
  assert.deepEqual(steps(r), [
    "initial:1200:5",
    "wasteRelax:2000:5",
    "wasteRelax:3000:5",
  ]);
  assert.deepEqual(r.wasteRelax, { base: 1200, used: 3000 });
  assert.equal(r.poolAdjust.direction, "none");
  assert.equal(r.trace[1].candidatesAfter, 0);
  console.log("  ✓ tier 2 (3000W) solves");
}

// ── 3. 基准 ≥ 2000 跳过第 1 档；基准 ≥ 3000 直接降投料 ─────────────
{
  const { deps } = world({ feasible: (c) => c.maxWaste >= 3000 });
  const r = solveWithPoolAdjustChain(mkParams({ maxWaste: 2500 }), deps);
  assert.deepEqual(steps(r), ["initial:2500:5", "wasteRelax:3000:5"]);
  assert.deepEqual(r.wasteRelax, { base: 2500, used: 3000 });

  const w2 = world({ feasible: (c) => c.rateTenths <= 3 });
  const r2 = solveWithPoolAdjustChain(mkParams({ maxWaste: 3000 }), w2.deps);
  assert.deepEqual(steps(r2), ["initial:3000:5", "down:3000:4", "down:3000:3"]);
  assert.equal(r2.wasteRelax, undefined);
  assert.deepEqual(r2.poolAdjust, {
    direction: "down",
    fromPerMin: 0.5,
    toPerMin: 0.3,
  });
  console.log("  ✓ base ≥ tier skips that tier");
}

// ── 4. 降到 0 有解，且没调预检 ────────────────────────────────────
{
  const { deps, calls } = world();
  const r = solveWithPoolAdjustChain(mkParams(), deps);
  assert.deepEqual(steps(r), [
    "initial:1200:5",
    "wasteRelax:2000:5",
    "wasteRelax:3000:5",
    "down:1200:4",
    "down:1200:3",
    "down:1200:2",
    "down:1200:1",
    "down:1200:0",
  ]);
  const last = r.trace.at(-1);
  assert.equal(last.prechecked, false);
  assert.equal(last.candidatesBefore, 2);
  assert.equal(last.candidatesAfter, 2);
  assert.equal(calls.precheck.length, 7, "initial + 2 tiers + 4 downs");
  assert.ok(
    calls.precheck.every((c) => c.rateTenths > 0),
    "precheck never called at rate 0",
  );
  const zero = calls.solve.at(-1).pool;
  assert.equal(zero.maxPerMin, 0);
  assert.equal(zero.enabled, false, "rate 0 = pool disabled");
  assert.deepEqual(r.poolAdjust, {
    direction: "down",
    fromPerMin: 0.5,
    toPerMin: 0,
  });
  assert.deepEqual(
    r.trace.filter((a) => a.kind === "down").map((a) => a.ratePerMin),
    [0.4, 0.3, 0.2, 0.1, 0],
    "tenths → no float drift",
  );
  console.log("  ✓ down to 0 solves without precheck");
}

// 多池：降到 0 时别的池还在，仍需预检
{
  const { deps } = world({ emptyAt: () => false });
  const r = solveWithPoolAdjustChain(
    mkParams({}, {}, [{ ...POOL, id: "p2" }]),
    deps,
  );
  const zero = r.trace.find((a) => a.kind === "down" && a.rateTenths === 0);
  assert.equal(zero.prechecked, true, "other active pool → still precheck");
  assert.equal(r.exhausted, true);
  console.log("  ✓ multi-pool: rate 0 still prechecked");
}

// ── 5. 只有升档有解 ───────────────────────────────────────────────
{
  const { deps } = world({
    feasible: (c) => c.rateTenths >= 8,
    emptyAt: (c) => c.rateTenths === 0,
  });
  const r = solveWithPoolAdjustChain(mkParams(), deps);
  assert.equal(r.trace.length, 1 + 2 + 5 + 3);
  assert.equal(steps(r).at(-1), "up:1200:8");
  assert.deepEqual(r.poolAdjust, {
    direction: "up",
    fromPerMin: 0.5,
    toPerMin: 0.8,
    requiredActualRatePerMin: 0.8,
  });
  assert.deepEqual(
    r.trace.filter((a) => a.kind === "up").map((a) => a.ratePerMin),
    [0.6, 0.7, 0.8],
  );
  assert.equal(r.result.solutions[0].poolAdjust.requiredActualRatePerMin, 0.8);
  console.log("  ✓ only raising rate solves (requiredActualRatePerMin)");
}

// ── 6. 全部无解：trace 完整 ───────────────────────────────────────
{
  const { deps } = world({ emptyAt: (c) => c.rateTenths === 0 });
  const r = solveWithPoolAdjustChain(mkParams(), deps);
  const expected = [
    "initial:1200:5",
    "wasteRelax:2000:5",
    "wasteRelax:3000:5",
    ...[4, 3, 2, 1, 0].map((t) => `down:1200:${t}`),
    ...[6, 7, 8, 9, 10, 11, 12, 13, 14, 15].map((t) => `up:1200:${t}`),
  ];
  assert.deepEqual(steps(r), expected);
  assert.equal(r.trace.length, 18);
  assert.deepEqual(
    r.trace.map((a) => a.index),
    expected.map((_, i) => i + 1),
  );
  assert.equal(r.exhausted, true);
  assert.equal(r.triggered, true);
  assert.equal(r.result.solutions.length, 0, "falls back to original");
  assert.deepEqual(r.poolAdjust, {
    direction: "none",
    fromPerMin: 0.5,
    toPerMin: 0.5,
  });
  for (const a of r.trace) {
    assert.equal(a.candidatesAfter, 0, `${a.kind}:${a.rateTenths} after`);
    assert.equal(a.candidatesBefore, a.rateTenths === 0 ? 0 : 2);
    assert.equal(typeof a.maxWaste, "number");
    assert.equal(typeof a.elapsedMs, "number");
  }
  // 起点 1.5：没有升档步骤
  const w2 = world({ emptyAt: (c) => c.rateTenths === 0 });
  const r2 = solveWithPoolAdjustChain(
    mkParams({}, { maxPerMin: 1.5 }),
    w2.deps,
  );
  assert.equal(r2.trace.length, 1 + 2 + 15);
  assert.ok(r2.trace.every((a) => a.kind !== "up"));
  console.log("  ✓ all fail → full trace (18 attempts)");
}

// ── 7. 超时 ──────────────────────────────────────────────────────
{
  const { deps, calls } = world({ clockStep: 100 });
  const r = solveWithPoolAdjustChain(mkParams(), deps, { timeoutMs: 250 });
  assert.equal(r.timedOut, true);
  assert.equal(r.triggered, true);
  assert.equal(r.trace.length, 3, "stops before the 4th solve");
  assert.equal(calls.solve.length, 3);
  assert.equal(r.lastStep, r.trace.at(-1));
  assert.equal(r.lastStep.kind, "wasteRelax");
  assert.equal(r.lastStep.maxWaste, 3000);
  assert.equal(r.result.solutions.length, 0, "original result kept");
  assert.equal(r.poolAdjust.direction, "none");

  // 绝对 deadline：链还没开始就到点
  const w2 = world({ clockStep: 100 });
  const r2 = solveWithPoolAdjustChain(mkParams(), w2.deps, { deadline: 50 });
  assert.equal(r2.timedOut, true);
  assert.equal(r2.trace.length, 1);
  assert.equal(r2.lastStep.kind, "initial");
  console.log("  ✓ shared deadline → { timedOut, lastStep }");
}

// ── 8. 回调抛错 fail-open ────────────────────────────────────────
{
  const { deps } = world({ throwSolveAt: 3 });
  const r = solveWithPoolAdjustChain(mkParams(), deps);
  assert.equal(r.triggered, true);
  assert.match(r.error, /boom-solve/);
  assert.equal(r.trace.length, 2);
  assert.equal(r.result.solutions.length, 0);
  assert.equal(r.poolAdjust.direction, "none");

  const w2 = world({ throwPrecheckAt: 2 });
  const r2 = solveWithPoolAdjustChain(mkParams(), w2.deps);
  assert.match(r2.error, /boom-precheck/);
  assert.equal(r2.trace.length, 1);

  // 初次预检抛错：按 solveWithPoolPrecheck 口径保留原候选，不进链
  const w3 = world({ throwPrecheckAt: 1 });
  const r3 = solveWithPoolAdjustChain(mkParams(), w3.deps);
  assert.equal(r3.triggered, false);
  assert.equal(r3.result.solutions.length, 2);
  assert.equal(r3.report, null);

  // 建盘抛错也 fail-open
  let n = 0;
  const w4 = world({
    build: (kept) => {
      n += 1;
      if (n === 2) throw new Error("boom-build");
      return fakeBuild(kept);
    },
  });
  const r4 = solveWithPoolAdjustChain(mkParams(), w4.deps);
  assert.match(r4.error, /boom-build/);
  console.log("  ✓ callback throws → fail-open to original");
}

// ── 9. 普通无解 / 未启用池 / 预检未剔光：不进链 ────────────────────
{
  const { deps, calls } = world({ emptyAt: () => true });
  const r = solveWithPoolAdjustChain(mkParams(), deps);
  assert.equal(r.triggered, false);
  assert.equal(calls.solve.length, 1);
  assert.equal(r.trace.length, 1);

  const w2 = world();
  const r2 = solveWithPoolAdjustChain(
    mkParams({}, { enabled: false }),
    w2.deps,
  );
  assert.equal(r2.triggered, false, "pool disabled");
  assert.equal(w2.calls.solve.length, 1);

  const w3 = world();
  const r3 = solveWithPoolAdjustChain(
    mkParams({}, { fuelId: "none" }),
    w3.deps,
  );
  assert.equal(r3.triggered, false, "empty slot");

  const w4 = world({ feasible: () => true });
  const r4 = solveWithPoolAdjustChain(mkParams(), w4.deps);
  assert.equal(r4.triggered, false, "precheck kept something");
  assert.equal(r4.result.solutions.length, 2);
  assert.equal(r4.result.solutions[0].poolAdjust, undefined);
  console.log("  ✓ plain no-solution / no pool / not pruned → chain skipped");
}

// ── 10. comparePoolAdjust ───────────────────────────────────────
{
  const tagged = (waste, direction) => ({
    ...sol(waste, `${direction ?? "untagged"}-${waste}`),
    ...(direction ? { poolAdjust: { direction } } : {}),
  });
  const list = [
    tagged(10, "up"),
    tagged(900, "none"),
    tagged(50, "down"),
    tagged(100, "none"),
    tagged(200, undefined),
    tagged(5, "down"),
  ];
  const sorted = [...list].sort((a, b) => comparePoolAdjust(a, b, null));
  assert.deepEqual(
    sorted.map((s) => s.tag),
    ["none-100", "untagged-200", "none-900", "down-5", "down-50", "up-10"],
  );
  console.log("  ✓ comparePoolAdjust: none > down > up, then compareSolutions");
}

// ── 11. 真建盘：格子上也挂了调整信息 ─────────────────────────────
{
  const { deps } = world({
    feasible: (c) => c.maxWaste >= 2000,
    build: undefined,
  });
  delete deps.build;
  const r = solveWithPoolAdjustChain(mkParams(), deps);
  const cells = r.result.matrix.flat().filter(Boolean);
  assert.ok(cells.length > 0, "real matrix has cells");
  for (const cell of cells) {
    assert.equal(cell.poolAdjust.direction, "none");
    assert.equal(cell.wasteRelax.used, 2000);
  }
  assert.ok(r.result.defaultSelection, "default selection exists");
  console.log("  ✓ real buildSudokuDecisionMatrix cells tagged");
}

console.log("selftest-pool-adjust-chain: all passed");
