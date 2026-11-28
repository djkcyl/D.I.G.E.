/**
 * 分阶段 3×3 矩阵自测：9 组场景，每个可行格用独立电池仿真器交叉验证求解器。
 * 运行：pnpm exec tsx scripts/selftest-stage-matrix.mjs
 */
import { resolveFuel } from "../src/utils/constants.ts";
import { DEFAULT_PARAMS } from "../src/utils/defaultParams.ts";
import { FactoryDesigner } from "../src/utils/FactoryDesigner.ts";
import { poolPowerForRate } from "../src/utils/oscBudget.ts";
import { simulateSolution } from "./lib/batterySim.mjs";

const MIN_PERCENT = 5;
const TOL_PERCENT = 0.5;
const TOL_WATT = 1;
const TIME_LIMIT_MS = 3000;

const pool = (fuelId, maxPerMin, enabled = true) => [
  { id: "p1", fuelId, enabled, deviceLimit: 48, maxPerMin },
];
const V = { factoryRegion: "valley" };
const W = { factoryRegion: "wuling" };
const NO_GATE = { excludeItemGateLimiter: true };

const SCENARIOS = [
  {
    name: "V1 455",
    noLimiter: true,
    p: {
      ...V,
      ...NO_GATE,
      targetPower: 455,
      primaryFuelId: "valleyLow",
      secondaryFuelId: "ore",
    },
  },
  {
    name: "V2 875",
    noLimiter: true,
    p: {
      ...V,
      ...NO_GATE,
      targetPower: 875,
      primaryFuelId: "valleyMid",
      secondaryFuelId: "valleyLow",
    },
  },
  {
    name: "V3 4270",
    noLimiter: true,
    p: { ...V, ...NO_GATE, targetPower: 4270, primaryFuelId: "valleyHigh" },
  },
  {
    name: "V4 5980 池关",
    pair: "V4",
    poolOn: false,
    p: {
      ...V,
      targetPower: 5980,
      primaryFuelId: "valleyHigh",
      secondaryFuelId: "wulingMid",
      oscPools: pool("wulingHigh", 0.5, false),
    },
  },
  {
    name: "V4 5980 池开0.5",
    pair: "V4",
    poolOn: true,
    p: {
      ...V,
      targetPower: 5980,
      primaryFuelId: "valleyHigh",
      secondaryFuelId: "wulingMid",
      oscPools: pool("wulingHigh", 0.5),
    },
  },
  {
    name: "W1 3455",
    p: { ...W, targetPower: 3455, primaryFuelId: "wulingLow" },
  },
  {
    name: "W2 7465",
    p: { ...W, targetPower: 7465, primaryFuelId: "wulingMid" },
  },
  {
    name: "W3 9735 池关",
    pair: "W3",
    poolOn: false,
    p: {
      ...W,
      targetPower: 9735,
      primaryFuelId: "wulingMid",
      oscPools: pool("wulingHigh", 1.5, false),
    },
  },
  {
    name: "W3 9735 池开1.5",
    pair: "W3",
    poolOn: true,
    p: {
      ...W,
      targetPower: 9735,
      primaryFuelId: "wulingMid",
      oscPools: pool("wulingHigh", 1.5),
    },
  },
];

/** 从参数重建自定义池的结构字段（bands.watt / remainderDenominator），口径同求解器构造函数 */
function poolsFromParams(params) {
  const out = [];
  for (const cfg of params.oscPools ?? []) {
    if (!cfg || cfg.enabled === false || !cfg.fuelId || cfg.fuelId === "none")
      continue;
    const fuel = resolveFuel(cfg.fuelId, params.fuelOverrides);
    const perMin = Number(cfg.maxPerMin) || 0;
    if (!fuel || !(perMin > 0)) continue;
    const rated = poolPowerForRate(fuel, perMin, {
      deviceLimit: Math.max(1, Number(cfg.deviceLimit) || 0),
    });
    out.push({
      fuel,
      bandWatt: rated.bands.watt,
      remainderDenominator:
        rated.remainderWatt > 0 ? rated.remainderDenominator : null,
    });
  }
  return out;
}

const failures = [];
const fail = (msg) => failures.push(msg);
const feasibleCount = new Map();
const rows = [];

for (const sc of SCENARIOS) {
  const params = {
    ...DEFAULT_PARAMS,
    secondaryFuelId: "none",
    oscPools: [],
    ...sc.p,
  };
  const t0 = performance.now();
  let result;
  try {
    result = new FactoryDesigner(params).solve();
  } catch (e) {
    fail(`${sc.name}: 求解抛异常 ${e?.message ?? e}`);
    continue;
  }
  const ms = performance.now() - t0;
  if (ms >= TIME_LIMIT_MS)
    fail(`${sc.name}: 求解耗时 ${ms.toFixed(0)}ms ≥ ${TIME_LIMIT_MS}ms`);

  const cells = [];
  result.matrix.forEach((row, r) => {
    row.forEach((cell, c) => {
      if (cell) cells.push({ r, c, cell });
    });
  });
  if (sc.pair)
    feasibleCount.set(`${sc.pair}:${sc.poolOn ? "on" : "off"}`, cells.length);
  if (cells.length < 1) fail(`${sc.name}: 无可行格`);

  const def = result.defaultSelection;
  const defCell = def ? result.matrix[def.row]?.[def.col] : null;
  if (!defCell) fail(`${sc.name}: 默认格不存在 ${JSON.stringify(def)}`);

  if (sc.noLimiter) {
    for (const sol of result.solutions) {
      for (const b of sol.oscillating ?? []) {
        if (b.requiresLimiter !== false) {
          fail(
            `${sc.name}: 分支 1/${b.denominator} requiresLimiter=${b.requiresLimiter}`,
          );
        }
      }
    }
  }

  const pools = poolsFromParams(params);
  const details = [];
  for (const { r, c, cell } of cells) {
    const sim = simulateSolution(cell, {
      targetPower: params.targetPower,
      minPercent: MIN_PERCENT,
      pools,
      fuelOverrides: params.fuelOverrides,
    });
    const solverMin = cell.minBatteryPercent ?? 0;
    const dMin = sim.minBatteryPercent - solverMin;
    const dAvg = sim.avgPower - cell.avgPower;
    const tag = `${sc.name} [${r},${c}]`;
    const nums = `solver m${solverMin.toFixed(2)}% avg${cell.avgPower.toFixed(2)} p${cell.period} | sim m${sim.minBatteryPercent.toFixed(2)}% avg${sim.avgPower.toFixed(2)} p${sim.period} failedAt=${sim.failedAt}`;
    if (sim.minBatteryPercent < MIN_PERCENT || sim.failedAt != null)
      fail(`${tag}: 独立仿真最低电量不足 ${nums}`);
    if (Math.abs(dMin) > TOL_PERCENT)
      fail(`${tag}: 最低电量偏差 ${dMin.toFixed(2)}pp ${nums}`);
    if (Math.abs(dAvg) > TOL_WATT)
      fail(`${tag}: 均值功率偏差 ${dAvg.toFixed(2)}W ${nums}`);
    details.push(
      `[${r},${c}] ${solverMin.toFixed(1)}/${sim.minBatteryPercent.toFixed(1)}% Δavg${dAvg.toFixed(2)}`,
    );
  }
  rows.push(
    `${sc.name.padEnd(16)} | ${ms.toFixed(0).padStart(5)}ms | 格 ${cells.length} | 默认 ${def ? `${def.row},${def.col}` : "-"} | ${details.join("  ")}`,
  );
}

for (const pair of ["V4"]) {
  const on = feasibleCount.get(`${pair}:on`);
  const off = feasibleCount.get(`${pair}:off`);
  if (on == null || off == null) fail(`${pair}: 缺少池开/池关结果`);
  else if (on > off) fail(`${pair}: 池开可行格 ${on} > 池关 ${off}`);
}

console.log(
  "场景 | 耗时 | 可行格 | 默认格 | 每格 求解器/独立 最低电量 与均值偏差",
);
for (const line of rows) console.log(line);

if (failures.length > 0) {
  console.error(`\nFAIL ${failures.length} 项：`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log("\nselftest-stage-matrix: OK");
