/**
 * 第 3 步：自定义震荡热能池蓄电预检自测。
 * Prefer: pnpm exec tsx scripts/selftest-pool-precheck.mjs
 *
 * - W_need 公式：武陵高容池 0.5/分 → 1/64，T_off=88s，remW=2000W，W_need≈920.5W
 * - 截图案例（武陵地区，基础 3500 + 震荡 489 + 池 2000，目标 5965）：+23.9W 解必须被剔除、不被推荐
 * - 场景 3（谷地地区，高容谷地 + 中容武陵，池 0.5，目标 5965）：+1001.7W 解保留
 * - fail-open、多池保守估计、无解诊断文案、8 语言 i18n 键
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULT_PARAMS } from "../src/utils/defaultParams.ts";
import { FactoryDesigner } from "../src/utils/FactoryDesigner.ts";
import { diagnoseNoSolution } from "../src/utils/failureDiagnose.ts";
import {
  computePoolBatteryNeed,
  filterByPoolBattery,
  POOL_SURPLUS_MARGIN_W,
  poolSurplusHintWatt,
  solveWithPoolPrecheck,
} from "../src/utils/poolBatteryPrecheck.ts";

const pool = (fuelId, maxPerMin, id = "p1") => ({
  id,
  fuelId,
  enabled: true,
  deviceLimit: 48,
  maxPerMin,
});
const near = (a, b, eps, msg) =>
  assert.ok(Math.abs(a - b) <= eps, `${msg}: got ${a}, want ${b}±${eps}`);
const fmtW = (list) =>
  list
    .map(
      (s) =>
        `${s.branchCount}路 avg=${s.avgPower.toFixed(1)} waste=${s.waste.toFixed(1)}`,
    )
    .join("\n    ");

// ── 1. W_need 公式 ─────────────────────────────────────────────
const single = { ...DEFAULT_PARAMS, oscPools: [pool("wulingHigh", 0.5)] };
const need = computePoolBatteryNeed(single);
assert.ok(need, "precheck: wulingHigh 0.5 must produce a need");
assert.equal(need.tOff, 88, "precheck: T_off = 128 − 40");
near(need.remW, 2000, 1e-6, "precheck: remW");
near(need.usableEnergy, 95000, 1e-6, "precheck: usable energy");
near(need.wNeed, 2000 - 95000 / 88, 1e-6, "precheck: W_need");
assert.equal(
  poolSurplusHintWatt(need),
  Math.ceil(2000 - 95000 / 88 + POOL_SURPLUS_MARGIN_W),
  "precheck: sidebar hint watt",
);
console.log(
  `  ✓ W_need = ${need.wNeed.toFixed(1)}W (T_off ${need.tOff}s, remW ${need.remW}W)`,
);

// 无池 / 空槽 → 不触发
assert.equal(
  computePoolBatteryNeed(DEFAULT_PARAMS),
  null,
  "precheck: empty slot → null",
);
assert.equal(poolSurplusHintWatt(null), null);

// ── 2. 多池保守估计：remW 相加、T_off 取最大 ────────────────────
const multi = computePoolBatteryNeed({
  ...DEFAULT_PARAMS,
  oscPools: [pool("wulingHigh", 0.5, "a"), pool("wulingHigh", 0.5, "b")],
});
assert.ok(multi, "precheck: multi-pool need");
assert.equal(multi.poolCount, 2);
near(multi.remW, 2 * need.remW, 1e-6, "precheck: multi remW sum");
assert.equal(multi.tOff, need.tOff, "precheck: multi T_off max");
assert.ok(multi.wNeed > need.wNeed, "precheck: multi needs more surplus");
console.log(`  ✓ multi-pool W_need = ${multi.wNeed.toFixed(1)}W`);

// ── 3. fail-open ───────────────────────────────────────────────
const broken = {
  ...DEFAULT_PARAMS,
  oscPools: {
    [Symbol.iterator]() {
      throw new Error("boom");
    },
  },
};
assert.equal(computePoolBatteryNeed(broken), null, "precheck: throws → null");
const fake = [{ waste: 1 }, { waste: 2 }];
const fo = filterByPoolBattery(broken, fake);
assert.equal(fo.kept, fake, "precheck: fail-open keeps candidates");
assert.equal(fo.report, null);
console.log("  ✓ fail-open");

// ── 4. 截图案例：+23.9W 解必须被剔除 ────────────────────────────
const shotParams = {
  ...DEFAULT_PARAMS,
  targetPower: 5965,
  factoryRegion: "wuling",
  primaryFuelId: "valleyHigh",
  secondaryFuelId: "none",
  autoPlanBasePools: true,
  oscPools: [pool("wulingHigh", 0.5)],
};
const shotDesigner = new FactoryDesigner(shotParams);
const shotCands = shotDesigner.solveCandidates();
console.log(
  `  screenshot candidates (${shotCands.length}):\n    ${fmtW(shotCands)}`,
);
assert.ok(shotCands.length > 0, "screenshot: solver must return candidates");
// 第 2 步修正池周期仿真后，求解器自身已不再产出 +23.9W 解（截图来自旧版本，当时池脉冲没按 128s 周期进仿真）。
// 为了继续锁住「预检剔除截图方案」，按截图数值把该方案注入候选集再预检。
const shotPlan = {
  ...shotCands[0],
  branchCount: 1,
  avgPower: 5988.9,
  waste: 23.9,
  minBatteryPercent: 76.8,
};
assert.equal(
  filterByPoolBattery(shotParams, [shotPlan]).kept.length,
  0,
  "screenshot: injected +23.9W plan must be removed by precheck",
);
const shotInput = [shotPlan, ...shotCands];
const shot = solveWithPoolPrecheck(
  shotParams,
  shotInput,
  shotDesigner.secondaryFuel?.id,
);
assert.equal(
  shot.report?.removed,
  1,
  "screenshot: only the injected plan is removed",
);
assert.ok(
  !shot.result.solutions.some((s) => s.waste <= 100),
  "screenshot: no ten-watt tier (<=100W) plan may be recommended",
);
assert.ok(shot.report, "screenshot: precheck must trigger");
for (const s of shot.result.solutions) {
  assert.ok(
    s.waste >= shot.report.requiredWaste,
    `screenshot: kept plan waste ${s.waste} < required ${shot.report.requiredWaste}`,
  );
}
assert.ok(
  !shot.result.solutions.some((s) => Math.abs(s.waste - 23.9) <= 0.5),
  "screenshot: +23.9W must not be recommended",
);
const shotDefault = shot.result.defaultSelection
  ? shot.result.matrix[shot.result.defaultSelection.row]?.[
      shot.result.defaultSelection.col
    ]
  : null;
assert.ok(
  !shotDefault || shotDefault.waste >= shot.report.requiredWaste,
  "screenshot: default selection must pass precheck",
);
console.log(
  `  ✓ screenshot: removed ${shot.report.removed}/${shot.report.total}, kept ${shot.result.solutions.length}, allRemoved=${shot.report.allRemoved}`,
);

// 全部剔除时的诊断文案
const tKey = (k, v) => (v ? `${k}${JSON.stringify(v)}` : k);
const diag = diagnoseNoSolution(shotParams, tKey, {
  ...shot.report,
  allRemoved: true,
});
assert.ok(
  diag.primaryHint.startsWith("diagPoolSurplusNeeded"),
  "diagnose: surplus hint first",
);
assert.ok(
  diag.primaryHint.includes(`"need":${Math.ceil(shot.report.requiredWaste)}`),
  "diagnose: hint carries need watt",
);
// 未全部剔除 / 无报告 → 走原有分支
assert.ok(
  !diagnoseNoSolution(shotParams, tKey, null).primaryHint.startsWith(
    "diagPoolSurplusNeeded",
  ),
);
console.log("  ✓ diagnose surplus hint");

// 场景 C 只在「池零头确有熄火段且电池兜不住」时触发，其余落到场景 B
const diagCBase = {
  ...DEFAULT_PARAMS,
  targetPower: 5965,
  factoryRegion: "wuling",
};
const diagCCases = [
  ["no pool", [], false],
  ["pool disabled", [{ ...pool("wulingHigh", 0.5), enabled: false }], false],
  ["pool 1.5 (整档无零头)", [pool("wulingHigh", 1.5)], false],
  ["pool 0.5 (熄火段兜不住)", [pool("wulingHigh", 0.5)], true],
  ["pool 0.1 (熄火段兜不住)", [pool("wulingHigh", 0.1)], true],
];
for (const [name, oscPools, expectDrain] of diagCCases) {
  const hint = diagnoseNoSolution(
    { ...diagCBase, oscPools },
    tKey,
    null,
  ).primaryHint;
  assert.equal(
    hint.startsWith("diagPoolBatteryDrain"),
    expectDrain,
    `diagnose C: ${name} → ${hint}`,
  );
}
console.log("  ✓ diagnose scenario C only on real battery shortfall");

// ── 5. 场景 3：+1001.7W 解保留 ──────────────────────────────────
const s3Params = {
  ...DEFAULT_PARAMS,
  targetPower: 5965,
  factoryRegion: "valley",
  primaryFuelId: "valleyHigh",
  secondaryFuelId: "wulingMid",
  autoPlanBasePools: true,
  oscPools: [pool("wulingHigh", 0.5)],
};
const s3Designer = new FactoryDesigner(s3Params);
const s3Cands = s3Designer.solveCandidates();
const s3 = filterByPoolBattery(s3Params, s3Cands);
console.log(
  `  scenario 3 kept (${s3.kept.length}/${s3Cands.length}):\n    ${fmtW(s3.kept)}`,
);
assert.ok(
  s3.kept.some((s) => Math.abs(s.waste - 1001.7) <= 1),
  "scenario 3: +1001.7W plan must be kept",
);
const s3Matrix = solveWithPoolPrecheck(
  s3Params,
  s3Cands,
  s3Designer.secondaryFuel?.id,
);
assert.ok(s3Matrix.result.solutions.length > 0, "scenario 3: matrix not empty");
console.log("  ✓ scenario 3 keeps +1001.7W");

// ── 5b. 热能池那一路必须真的进仿真（截图「1路十瓦级」周期 90s 那一格）────
{
  const {
    computePoolFeedCycles,
    isPoolBranchSimulated,
    filterByPoolBattery: filterPool,
  } = await import("../src/utils/poolBatteryPrecheck.ts");
  const simParams = {
    ...DEFAULT_PARAMS,
    targetPower: 5965,
    factoryRegion: "wuling",
    primaryFuelId: "valleyHigh",
    secondaryFuelId: "none",
    inputRateLimitPerMin: 6,
    oscPools: [pool("wulingHigh", 0.5)],
  };
  const cycles = computePoolFeedCycles(simParams);
  assert.deepEqual(
    cycles,
    [128],
    "pool-sim: wulingHigh 0.5 → feed cycle 2·64 = 128s",
  );

  // 构造对象：周期 90s 不是 128 的整数倍 → 池没进仿真
  const shot90 = {
    period: 90,
    branchCount: 1,
    burnStateLog: [[1]],
    waste: 2000,
  };
  assert.equal(
    isPoolBranchSimulated(shot90, cycles),
    false,
    "pool-sim: period 90 vs 128 rejected",
  );
  // 周期对了但燃烧记录行数不够（池那一路没占行）
  const missingRow = {
    period: 5760,
    branchCount: 1,
    burnStateLog: [[1]],
    waste: 2000,
  };
  assert.equal(
    isPoolBranchSimulated(missingRow, cycles),
    false,
    "pool-sim: missing pool burn row rejected",
  );
  // 周期 = lcm(90,128) 且池占一行 → 通过
  const real = {
    period: 5760,
    branchCount: 1,
    burnStateLog: [[1], [1]],
    waste: 2000,
  };
  assert.equal(
    isPoolBranchSimulated(real, cycles),
    true,
    "pool-sim: lcm period + pool row accepted",
  );
  // 无池时不做判断
  assert.equal(
    isPoolBranchSimulated(shot90, []),
    true,
    "pool-sim: no pool → no check",
  );
  // 自测桩（无 period 字段）不受影响
  assert.equal(
    isPoolBranchSimulated({ waste: 1 }, cycles),
    true,
    "pool-sim: stub without period passes",
  );

  // 富余充足也不能救回没进仿真的格子；计入 report.unsimulated
  const fo = filterPool(simParams, [shot90, real]);
  assert.deepEqual(fo.kept, [real], "pool-sim: only simulated cell kept");
  assert.equal(fo.report?.unsimulated, 1, "pool-sim: unsimulated counted");
  assert.equal(fo.report?.removed, 1, "pool-sim: removed includes unsimulated");

  // 真实仿真：1/45（90s）支路 + 池零头支路 → 电池撑不住
  const d = new FactoryDesigner(simParams);
  const layered = d.calculateBasePower();
  const valleyHigh = d.primaryFuel;
  const sim = d._simulate(
    { totalPower: layered.totalPower },
    [
      {
        denominator: 45,
        branchInterval: 90,
        fuel: valleyHigh,
        phaseOffsetCells: 0,
      },
    ],
    valleyHigh,
  );
  assert.equal(
    sim.success,
    false,
    `pool-sim: 1/45 + pool must be infeasible (got ${sim.reason ?? "success"})`,
  );

  // 整条求解链：不能出现 90s 周期的格子，所有候选都必须通过判断
  const simCands = d.solveCandidates();
  assert.ok(
    !simCands.some((s) => s.period === 90),
    "pool-sim: no 90s-period candidate",
  );
  assert.ok(
    simCands.every((s) => isPoolBranchSimulated(s, cycles)),
    "pool-sim: every candidate has the pool branch simulated",
  );
  assert.ok(
    !simCands.some(
      (s) => s.branchCount === 1 && Math.abs(s.avgPower - 5988.9) < 0.5,
    ),
    "pool-sim: screenshot 5988.9W 1-branch cell gone",
  );
  console.log(
    `  ✓ pool branch simulated (cands=${simCands.length}, 1/45 reason=${sim.reason})`,
  );
}

// solve() 行为不变
assert.ok(Array.isArray(new FactoryDesigner(shotParams).solve().solutions));

// ── 6. i18n 键 ─────────────────────────────────────────────────
const dir = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../src/i18n",
);
for (const loc of ["zh", "en", "de", "fr", "id", "ja", "ko", "ru"]) {
  const data = JSON.parse(
    fs.readFileSync(path.join(dir, `locales.${loc}.json`), "utf8"),
  );
  for (const key of ["diagPoolSurplusNeeded", "oscPoolSurplusHint"]) {
    assert.ok(
      typeof data[key] === "string" && data[key].length > 0,
      `i18n ${loc}.${key}`,
    );
  }
  assert.ok(
    data.diagPoolSurplusNeeded.includes("{{need}}"),
    `i18n ${loc} need var`,
  );
  assert.ok(
    data.oscPoolSurplusHint.includes("{{watt}}"),
    `i18n ${loc} watt var`,
  );
}
console.log("  ✓ i18n keys");
console.log("selftest-pool-precheck: OK");
