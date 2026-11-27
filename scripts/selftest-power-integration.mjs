/**
 * 第 2 步：电量积分精度自测。
 * Prefer: pnpm exec tsx scripts/selftest-power-integration.mjs
 *
 * 已知脉冲：单分支，额定功率 P、燃烧时长 B（非整数秒）、投料间隔 I（整数秒周期）。
 * 一个周期内的真实能量 = P × B × (period / I)。
 * 精确分数积分后，仿真得到的 avgPower × 周期秒数 与真实能量的误差应 < 1J。
 * 同时断言 POWER_INTEGRATION_MARGIN_W 已归零（精确积分落地后不再需要裕量）。
 */
import assert from "node:assert/strict";
import { resolveFuel } from "../src/utils/constants.ts";
import { DEFAULT_PARAMS } from "../src/utils/defaultParams.ts";
import {
  FactoryDesigner,
  POWER_INTEGRATION_MARGIN_W,
} from "../src/utils/FactoryDesigner.ts";

assert.equal(
  POWER_INTEGRATION_MARGIN_W,
  0,
  "power-integration: margin must be 0 after exact integration",
);

const baseFuel = resolveFuel("valleyHigh");
assert.ok(baseFuel, "power-integration: valleyHigh fuel must resolve");

// targetPower 取 1W：电池始终满，不会因为放电失败而拿不到 avgPower
const designer = new FactoryDesigner({ ...DEFAULT_PARAMS, targetPower: 1 });
const sim = designer.simulator;
assert.ok(sim && typeof sim.simulateCycle === "function");

const cases = [
  {
    name: "P1000 B7.3 I10 off0",
    power: 1000,
    burnTime: 7.3,
    interval: 10,
    offset: 0,
  },
  {
    name: "P1000 B7.3 I10 off1",
    power: 1000,
    burnTime: 7.3,
    interval: 10,
    offset: 1,
  },
  {
    name: "P2000 B1.25 I4 off3",
    power: 2000,
    burnTime: 1.25,
    interval: 4,
    offset: 3,
  },
  {
    name: "P1100 B12.6 I27 off5",
    power: 1100,
    burnTime: 12.6,
    interval: 27,
    offset: 5,
  },
  {
    name: "P50 B0.4 I3 off2",
    power: 50,
    burnTime: 0.4,
    interval: 3,
    offset: 2,
  },
];

const rows = [];
for (const c of cases) {
  const fuel = { ...baseFuel, power: c.power, burnTime: c.burnTime };
  const r = sim.simulateCycle(
    { totalPower: 0 },
    [
      {
        denominator: 1,
        branchInterval: c.interval,
        phaseOffsetCells: c.offset,
        fuel,
      },
    ],
    fuel,
  );
  assert.equal(
    r.success,
    true,
    `power-integration ${c.name}: sim failed ${r.reason}`,
  );
  const expected = c.power * c.burnTime * (r.period / c.interval);
  const simulated = r.avgPower * r.period;
  const err = Math.abs(simulated - expected);
  rows.push(
    `${c.name.padEnd(22)} period=${r.period}s expected=${expected.toFixed(3)}J simulated=${simulated.toFixed(3)}J err=${err.toExponential(2)}J`,
  );
  assert.ok(
    err < 1,
    `power-integration ${c.name}: |err|=${err}J must be < 1J (expected ${expected}, got ${simulated})`,
  );
}

console.log(rows.join("\n"));
console.log("selftest-power-integration: all passed");
