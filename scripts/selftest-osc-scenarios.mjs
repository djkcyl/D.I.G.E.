/**
 * 自定义震荡热能池：虚构场景验收（投料量上限 → 满速带 + 余量，功率从目标缺口扣除）。
 * Prefer: pnpm exec tsx scripts/selftest-osc-scenarios.mjs
 */
import assert from "node:assert/strict";
import { resolveFuel } from "../src/utils/constants.ts";
import { DEFAULT_PARAMS } from "../src/utils/defaultParams.ts";
import { FactoryDesigner } from "../src/utils/FactoryDesigner.ts";
import { poolPowerForRate } from "../src/utils/oscBudget.ts";

const valleyHigh = resolveFuel("valleyHigh");
const wulingHigh = resolveFuel("wulingHigh");
assert.ok(valleyHigh && wulingHigh);

function run(targetPower, oscPools, extra = {}) {
  const params = {
    ...DEFAULT_PARAMS,
    targetPower,
    primaryFuelId: extra.primaryFuelId ?? "valleyHigh",
    secondaryFuelId: extra.secondaryFuelId ?? "none",
    factoryRegion: extra.factoryRegion ?? "valley",
    oscPools,
  };
  return new FactoryDesigner(params).solve();
}

function best(solveResult) {
  const sel = solveResult.defaultSelection;
  assert.ok(sel, "应存在默认格");
  const sol = solveResult.matrix[sel.row][sel.col];
  assert.ok(sol, "默认格应有方案");
  return sol;
}

// 场景 1：四号谷地 5800W，自定义震荡热能池 高容谷地 1 个/分钟
{
  const target = 5800;
  const perMin = 1;
  const expectedPool = poolPowerForRate(valleyHigh, perMin).watt;
  const result = run(target, [
    {
      id: "p1",
      fuelId: "valleyHigh",
      enabled: true,
      deviceLimit: 48,
      maxPerMin: perMin,
    },
  ]);
  const sol = best(result);
  const oscSum = (sol.oscillating ?? []).reduce((s, b) => s + b.power, 0);
  const composed = sol.baseConfig.totalPower + oscSum + expectedPool;
  assert.ok(
    Math.abs(composed - sol.avgPower) <= 1,
    `场景1 组成对不上：${composed} ≠ ${sol.avgPower}`,
  );
  assert.ok(
    Math.abs(sol.avgPower - target) <= Math.max(1, sol.waste) + 1,
    `场景1 最终功率应贴近目标：${sol.avgPower}`,
  );
  assert.ok(
    Math.abs(sol.baseConfig.totalPower + oscSum - (target - expectedPool)) <=
      Math.max(1, sol.waste) + 1,
    `场景1 base+osc 应等于目标-池：${sol.baseConfig.totalPower} + ${oscSum} vs ${target - expectedPool}`,
  );
}

// 场景 2：武陵 9700W，自定义震荡热能池 高容武陵 上限 3 个/分钟
{
  const target = 9700;
  const perMin = 3;
  const rated = poolPowerForRate(wulingHigh, perMin);
  // 3 个/分 = 1.5×2 → 连续功率 12800W（不做向下取整）
  assert.equal(rated.bands.generators, 2, "3 个/分需要 2 台满速热能池");
  const result = run(
    target,
    [
      {
        id: "p1",
        fuelId: "wulingHigh",
        enabled: true,
        deviceLimit: 48,
        maxPerMin: perMin,
      },
    ],
    { primaryFuelId: "wulingHigh", factoryRegion: "wuling" },
  );
  const sol = best(result);
  const oscSum = (sol.oscillating ?? []).reduce((s, b) => s + b.power, 0);
  const expectedPool = Math.min(rated.watt, target);
  assert.ok(
    Math.abs(
      sol.baseConfig.totalPower + oscSum + expectedPool - sol.avgPower,
    ) <= 1,
    `场景2 组成对不上：${sol.baseConfig.totalPower + oscSum + expectedPool} ≠ ${sol.avgPower}`,
  );
  assert.ok(
    Math.abs(sol.avgPower - target) <= Math.max(1, sol.waste) + 1,
    `场景2 最终功率应贴近目标：${sol.avgPower}`,
  );
}

console.log("selftest-osc-scenarios: all passed");
