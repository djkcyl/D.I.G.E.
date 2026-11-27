/**
 * 准入口「成串放行」格位模型自测（docs/architecture.md「三之一」）。
 *
 *   1. k=0..5 的单周期格位序列；
 *   2. k=2/3/4 下单支路到达间隔分布；
 *   3. 长期均值 = 6k 个/分（含分流树轮转后各支路之和）；
 *   4. 单台热能池（排队）的断烧段与均匀模型不同；
 *   5. 截图案例复现：新旧到达模型下的均值功率与最低电量。
 *
 * 格位模型目前是 scripts/lib/batterySim.mjs 的本地实现；
 * TODO(core-wire)：inputRate.ts 导出 gateSlotPattern / branchArrivalTimes 后改为引用那里。
 */
import { resolveFuel } from "../src/utils/constants.ts";
import { DEFAULT_PARAMS } from "../src/utils/defaultParams.ts";
import { FactoryDesigner } from "../src/utils/FactoryDesigner.ts";
import { poolPowerForRate } from "../src/utils/oscBudget.ts";
import {
  branchArrivalTimes,
  gatedBranchPeriod,
  gateSlotPattern,
  idleGaps,
  POOL_INPUT_BUFFER,
  queueStats,
  simulateSolution,
} from "./lib/batterySim.mjs";

let failures = 0;
function check(cond, msg) {
  if (cond) {
    console.log(`  ✓ ${msg}`);
  } else {
    failures += 1;
    console.error(`  ✗ ${msg}`);
  }
}
const diffs = (ts) =>
  ts.slice(1).map((t, i) => Math.round((t - ts[i]) * 1e6) / 1e6);
const same = (a, b) =>
  a.length === b.length && a.every((x, i) => Math.abs(x - b[i]) < 1e-9);

// 1. 格位序列 ---------------------------------------------------------------
console.log("[1] 准入口单周期格位序列");
const PATTERNS = {
  0: "□□□□□",
  1: "■□□□□",
  2: "■■□□□",
  3: "■■■□□",
  4: "■■■■□",
  5: "■■■■■",
};
for (const [k, want] of Object.entries(PATTERNS)) {
  const got = gateSlotPattern(Number(k))
    .map((x) => (x ? "■" : "□"))
    .join("");
  check(got === want, `k=${k} (${6 * k}/分) → ${got}（期望 ${want}）`);
}

// 2. 单支路到达间隔分布 ------------------------------------------------------
console.log("[2] 单支路到达间隔分布（BELT_INTERVAL=2s）");
const INTERVAL_CASES = [
  { k: 1, L: 1, want: [10], note: "6/分直通 = 恰好均匀" },
  { k: 2, L: 1, want: [2, 8], note: "12/分直通 = 2s/8s 交替" },
  { k: 3, L: 1, want: [2, 2, 6], note: "18/分直通" },
  { k: 4, L: 1, want: [2, 2, 2, 4], note: "24/分直通" },
  { k: 2, L: 3, want: [12, 18], note: "12/分 + 1/3 分流" },
  { k: 3, L: 2, want: [4, 8, 8], note: "18/分 + 1/2 分流" },
  { k: 4, L: 3, want: [6, 8, 8, 8], note: "24/分 + 1/3 分流" },
  { k: 2, L: 9, want: [42, 48], note: "12/分 + 1/9 分流" },
];
for (const { k, L, want, note } of INTERVAL_CASES) {
  const P = gatedBranchPeriod(k, L);
  const ts = branchArrivalTimes({ k, localDenominator: L, horizon: P * 4 });
  const got = diffs(ts).slice(0, want.length * 3);
  const expect = [want, want, want].flat().slice(0, got.length);
  check(
    got.length >= want.length * 2 && same(got, expect),
    `${note}: k=${k} L=${L} 间隔 ${got.slice(0, want.length).join("/")}s，周期 ${P}s`,
  );
  const shifted = branchArrivalTimes({ k, localDenominator: L, horizon: P * 3 })
    .filter((t) => t >= P)
    .map((t) => t - P);
  const head = ts.filter((t) => t < P * 2);
  check(same(shifted, head), `k=${k} L=${L} 序列以 ${P}s 为周期重复`);
}

// 3. 长期均值 = 6k/分 -------------------------------------------------------
console.log("[3] 长期均值");
let meanFailures = 0;
for (const k of [1, 2, 3, 4, 5]) {
  for (const L of [1, 2, 3, 4, 6, 9, 12]) {
    const P = gatedBranchPeriod(k, L);
    const horizon = P * 6;
    let all = 0;
    let leaf0 = 0;
    for (let leaf = 0; leaf < L; leaf += 1) {
      const n = branchArrivalTimes({ k, localDenominator: L, leaf, horizon }).length;
      all += n;
      if (leaf === 0) leaf0 = n;
    }
    const perMinAll = (all / horizon) * 60;
    const perMinLeaf = (leaf0 / horizon) * 60;
    if (
      Math.abs(perMinAll - 6 * k) > 1e-9 ||
      Math.abs(perMinLeaf - (6 * k) / L) > 1e-9
    ) {
      meanFailures += 1;
      check(
        false,
        `k=${k} L=${L}: 总 ${perMinAll}/分（期望 ${6 * k}），单支 ${perMinLeaf}/分（期望 ${(6 * k) / L}）`,
      );
    }
  }
}
check(
  meanFailures === 0,
  "k=1..5 × L∈{1,2,3,4,6,9,12}：各支路之和 = 6k/分，单支路 = 6k/L 个/分",
);

// 3b. 均匀性 / 长间隔公式 ----------------------------------------------------
console.log("[3b] n=1/5 恒均匀；n∈{2,3,4} 且 n∤L 时 长间隔−均值 = (10−2n)(n−s)/n");
{
  let uniFail = 0;
  for (const k of [1, 5]) {
    for (let L = 1; L <= 24; L += 1) {
      const P = gatedBranchPeriod(k, L);
      const g = diffs(branchArrivalTimes({ k, localDenominator: L, horizon: P * 4 }));
      const want = (10 * L) / k;
      if (g.length === 0 || g.some((x) => Math.abs(x - want) > 1e-9)) {
        uniFail += 1;
        check(false, `k=${k} L=${L} 非均匀：${[...new Set(g)].join("/")}s（期望 ${want}s）`);
      }
    }
  }
  check(uniFail === 0, "n=1、n=5 × L=1..24：到达间隔恒为 10L/n 秒");

  let fmFail = 0;
  for (const k of [2, 3, 4]) {
    for (let L = 1; L <= 24; L += 1) {
      const s = L % k;
      const P = gatedBranchPeriod(k, L);
      const g = diffs(branchArrivalTimes({ k, localDenominator: L, horizon: P * 4 }));
      const mean = (10 * L) / k;
      if (s === 0) {
        if (g.some((x) => Math.abs(x - mean) > 1e-9)) {
          fmFail += 1;
          check(false, `k=${k} L=${L}（n|L）应均匀，实际 ${[...new Set(g)].join("/")}s`);
        }
        continue;
      }
      const longest = Math.max(...g);
      const want = ((10 - 2 * k) * (k - s)) / k;
      if (Math.abs(longest - mean - want) > 1e-9) {
        fmFail += 1;
        check(
          false,
          `k=${k} L=${L} s=${s}：长间隔 ${longest}s − 均值 ${mean.toFixed(3)}s = ${(longest - mean).toFixed(3)}，期望 ${want.toFixed(3)}`,
        );
      }
    }
  }
  check(fmFail === 0, "n∈{2,3,4} × L=1..24：n|L 均匀，n∤L 长间隔公式成立");
}

// 4. 单台热能池断烧段 --------------------------------------------------------
const fuel = resolveFuel("valleyHigh");
console.log(`[4] 单台热能池断烧段（排队模型，燃烧 ${fuel.burnTime}s）`);
{
  // 12/分 + 1/3：均值间隔 15s < 燃烧时长，排队吸收，成串也不断烧。
  const P = gatedBranchPeriod(2, 3);
  const ts = branchArrivalTimes({ k: 2, localDenominator: 3, horizon: P * 40 });
  const gaps = idleGaps(ts, fuel.burnTime, P * 4);
  check(
    gaps.length === 0,
    `k=2 + 1/3：到达 12/18s 交替，均值 15s < ${fuel.burnTime}s，排队吸收 → 无断烧`,
  );
}
{
  // 12/分 + 1/9：均匀模型 45s 一份 → 每份后断 5s；格位模型 42/48s 交替 → 断 2s / 8s 交替。
  const P = gatedBranchPeriod(2, 9);
  const slot = branchArrivalTimes({ k: 2, localDenominator: 9, horizon: P * 10 });
  const uni = Array.from({ length: 20 }, (_, m) => m * 45);
  const gs = idleGaps(slot, fuel.burnTime, P * 2);
  const gu = idleGaps(uni, fuel.burnTime, 90);
  check(
    gu.length > 0 && gu.every((g) => g === 5),
    "k=2 + 1/9 均匀模型：断烧段恒为 5s",
  );
  check(
    gs.length >= 4 &&
      gs.every((g, i) => g === (i % 2 === 0 ? gs[0] : gs[1])) &&
      [gs[0], gs[1]].sort((a, b) => a - b).join("/") === "2/8",
    `k=2 + 1/9 格位模型：断烧段 ${gs.slice(0, 4).join("/")}s（2s/8s 交替，长空档 8s）`,
  );
}

// 5. 截图案例复现 ------------------------------------------------------------
console.log(
  "[5] 截图案例：武陵 5965W，主=高容谷地，1 路震荡 1/45 准入口 6/分 + 自定义池高容武陵 0.5/分",
);
const params = {
  ...DEFAULT_PARAMS,
  targetPower: 5965,
  factoryRegion: "wuling",
  primaryFuelId: "valleyHigh",
  secondaryFuelId: "none",
  oscPools: [
    { id: "p1", fuelId: "wulingHigh", enabled: true, deviceLimit: 48, maxPerMin: 0.5 },
  ],
};
const result = new FactoryDesigner(params).solve();
const cells = [];
(result.matrix ?? []).forEach((row) => row?.forEach((c) => c && cells.push(c)));
for (const s of result.solutions ?? []) if (!cells.includes(s)) cells.push(s);
const target = cells.find(
  (s) =>
    (s.oscillating ?? []).length === 1 &&
    s.oscillating[0].denominator === 45 &&
    s.oscillating[0].limiterSpeed === 6,
);
check(Boolean(target), "求解器给出 1 路 1/45 准入口 6/分 的格子");
if (target) {
  const b = target.oscillating[0];
  const poolFuel = resolveFuel("wulingHigh");
  const rp = poolPowerForRate(poolFuel, 0.5);
  const pools = [
    {
      fuel: poolFuel,
      bandWatt: rp.bands?.watt ?? 0,
      remainderDenominator: rp.remainderDenominator,
    },
  ];
  const opts = { targetPower: params.targetPower, pools, minPercent: 5 };
  const oldSim = simulateSolution(target, { ...opts, arrivalModel: "uniform" });
  const newSim = simulateSolution(target, { ...opts, arrivalModel: "slot" });
  console.log(
    `  分支 1/${b.denominator} localD=${b.localDenominator} branchInterval=${b.branchInterval}s 相位 ${b.phaseOffsetCells} 格；池 1/${rp.remainderDenominator}`,
  );
  console.log(
    `  求解器：avg ${target.avgPower.toFixed(1)}W  min ${target.minBatteryPercent.toFixed(1)}%  周期 ${target.period}s`,
  );
  console.log(
    `  旧模型：avg ${oldSim.avgPower.toFixed(1)}W  min ${oldSim.minBatteryPercent.toFixed(1)}%  周期 ${oldSim.period}s`,
  );
  console.log(
    `  新模型：avg ${newSim.avgPower.toFixed(1)}W  min ${newSim.minBatteryPercent.toFixed(1)}%  周期 ${newSim.period}s`,
  );
  check(
    Math.abs(oldSim.avgPower - 5988.9) < 1,
    `旧模型独立仿真均值 ${oldSim.avgPower.toFixed(1)}W ≈ 截图 5988.9W`,
  );
  check(
    Math.abs(newSim.avgPower - oldSim.avgPower) < 1,
    `新模型均值不变（长期均值口径）：Δ ${(newSim.avgPower - oldSim.avgPower).toFixed(2)}W`,
  );
  check(
    Math.abs(oldSim.minBatteryPercent - 76.8) < 0.5,
    `旧模型最低电量 ${oldSim.minBatteryPercent.toFixed(1)}% ≈ 截图 76.8%`,
  );
  check(
    Math.abs(newSim.minBatteryPercent - oldSim.minBatteryPercent) < 0.5,
    `n=1 成串≡均匀：新旧最低电量 Δ ${(newSim.minBatteryPercent - oldSim.minBatteryPercent).toFixed(2)}pp（明显变化 = 格位分发 bug）`,
  );
}

// 6. 池入口排队长度 ----------------------------------------------------------
console.log(`[6] 池入口排队长度（入口缓存 ${POOL_INPUT_BUFFER} 格）`);
{
  // 成串 n=4、L=2：到达 4s/6s 交替，均值 5s；燃烧取临界值 5s（= 均值间隔）
  const k = 4;
  const L = 2;
  const P = gatedBranchPeriod(k, L);
  const mean = (10 * L) / k;
  const ts = branchArrivalTimes({ k, localDenominator: L, horizon: P * 60 });
  const q = queueStats(ts, mean);
  check(
    q.peak <= 4 && q.overflowAt == null,
    `成串 n=4 L=2（燃烧 ${mean}s = 均值间隔）：排队峰值 ${q.peak} ≤ 4`,
  );
  const sim = simulateSolution(
    {
      baseConfig: { totalPower: 0 },
      oscillating: [
        {
          denominator: 2,
          requiresLimiter: true,
          limiterSpeed: 24,
          localDenominator: L,
          phaseOffsetCells: 0,
          branchInterval: mean,
          fuel: { burnTime: mean, power: 1000 },
        },
      ],
    },
    { targetPower: 0 },
  );
  check(
    sim.valid && sim.queuePeak <= 4,
    `simulateSolution 同用例：valid=${sim.valid}，排队峰值 ${sim.queuePeak} ≤ 4`,
  );
}
{
  // 人为构造：每 2s 到 1 份，每份烧 40s → 到达速度 > 燃烧速度
  const ts = Array.from({ length: 300 }, (_, m) => m * 2);
  const q = queueStats(ts, 40);
  check(
    q.overflowAt != null && q.peak > POOL_INPUT_BUFFER,
    `到达 2s/份 > 燃烧 40s/份：第 ${q.overflowAt}s 排队超过 ${POOL_INPUT_BUFFER}（峰值 ${q.peak}）`,
  );
  const sim = simulateSolution(
    {
      baseConfig: { totalPower: 0 },
      oscillating: [
        {
          denominator: 1,
          branchInterval: 2,
          phaseOffsetCells: 0,
          fuel: { burnTime: 40, power: 1000 },
        },
      ],
    },
    { targetPower: 0 },
  );
  check(
    !sim.valid && sim.failedAt != null,
    `simulateSolution 短周期同用例也判无效：${sim.invalidReason}（仿真窗口内峰值 ${sim.queuePeak}）`,
  );
}

// 7. precompute-analyst 截图对照 ---------------------------------------------
console.log(
  "[7] 截图对照：谷地 5965W，主=高容谷地，池高容武陵 0.5/分（1/64）；游戏实测断电",
);
{
  const p7 = {
    ...DEFAULT_PARAMS,
    targetPower: 5965,
    factoryRegion: "valley",
    primaryFuelId: "valleyHigh",
    secondaryFuelId: "none",
    oscPools: [
      { id: "p1", fuelId: "wulingHigh", enabled: true, deviceLimit: 48, maxPerMin: 0.5 },
    ],
  };
  let r7 = null;
  try {
    r7 = new FactoryDesigner(p7).solve();
  } catch (e) {
    console.log(`  求解器抛错（按无解处理）：${e?.message ?? e}`);
  }
  const cells7 = [];
  (r7?.matrix ?? []).forEach((row) => row?.forEach((c) => c && cells7.push(c)));
  for (const s of r7?.solutions ?? []) if (!cells7.includes(s)) cells7.push(s);
  const poolFuel7 = resolveFuel("wulingHigh");
  const rp7 = poolPowerForRate(poolFuel7, 0.5);
  check(
    rp7.remainderDenominator === 64,
    `池零头分母 1/${rp7.remainderDenominator}（期望 1/64）`,
  );
  const pools7 = [
    {
      fuel: poolFuel7,
      bandWatt: rp7.bands?.watt ?? 0,
      remainderDenominator: rp7.remainderDenominator,
    },
  ];
  console.log(`  求解器给出 ${cells7.length} 个格子`);
  let stale = 0;
  let survivors = 0;
  for (const s of cells7) {
    const sim = simulateSolution(s, { targetPower: 5965, pools: pools7, minPercent: 5 });
    const tag = (s.oscillating ?? [])
      .map((b) => `1/${b.denominator}${b.limiterSpeed ? `@${b.limiterSpeed}/分` : ""}`)
      .join("+");
    console.log(
      `  ${tag || "(无震荡)"}：求解器 avg ${s.avgPower?.toFixed(1)}W min ${s.minBatteryPercent?.toFixed(1)}% ｜ 独立仿真 avg ${sim.avgPower.toFixed(1)}W min ${sim.minBatteryPercent.toFixed(1)}% failedAt=${sim.failedAt} valid=${sim.valid} 排队峰值 ${sim.queuePeak}`,
    );
    if (
      Math.abs((s.avgPower ?? 0) - 5988.9) < 1 &&
      Math.abs((s.minBatteryPercent ?? 0) - 76.8) < 0.5
    ) {
      stale += 1;
    }
    if (sim.failedAt == null) survivors += 1;
  }
  check(stale === 0, `不再出现 5988.9W / 76.8% 的格子（命中 ${stale} 个）`);
  check(
    cells7.length === 0 || survivors === 0,
    `新模型判为无解或断电（求解器 ${cells7.length} 格，独立仿真不断电 ${survivors} 格）`,
  );
}

if (failures > 0) {
  console.error(`\nselftest-gate-burst: ${failures} 项失败`);
  process.exit(1);
}
console.log("\nselftest-gate-burst: 全部通过");
