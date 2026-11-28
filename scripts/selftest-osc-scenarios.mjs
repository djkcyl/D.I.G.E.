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

// 场景 2：武陵 9700W，自定义震荡热能池 高容武陵 上限 1.5 个/分钟（正好 1 台满速带）
{
  const target = 9700;
  const perMin = 1.5;
  const rated = poolPowerForRate(wulingHigh, perMin);
  assert.equal(rated.bands.generators, 1, "1.5 个/分 = 1 台满速热能池");
  assert.equal(rated.remainderDenominator, null, "正好整除时没有余量分支");

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
  // 逐秒仿真是整秒对齐燃烧窗口的，均值会有一点点离散误差
  assert.ok(
    Math.abs(sol.baseConfig.totalPower + oscSum + rated.watt - sol.avgPower) <=
      60,
    `场景2 组成对不上：${sol.baseConfig.totalPower + oscSum + rated.watt} ≠ ${sol.avgPower}`,
  );
  assert.ok(
    sol.waste >= 0 && sol.waste <= 1200,
    `场景2 浪费应在窗口内：${sol.waste}`,
  );
  assert.ok(
    sol.minBatteryPercent >= 5 - 1e-6,
    `场景2 最低电量应满足 5% 底线：${sol.minBatteryPercent}`,
  );
}

// 场景 3：蓄电池真实约束——5965W + 高容武陵 0.5 个/分钟
// 早期版本只把池的「平均功率」从目标里扣掉，没把脉冲供电带进电池仿真，
// 因此会给出「最低电量 76.8%」却在实际游戏里 39 秒断电的方案。
{
  const target = 5965;
  const result = run(target, [
    {
      id: "p1",
      fuelId: "wulingHigh",
      enabled: true,
      deviceLimit: 48,
      maxPerMin: 0.5,
    },
  ]);

  assert.ok(result.solutions.length > 0, "场景3 至少应有一个可行方案");
  for (const sol of result.solutions) {
    // 1) 每个方案都必须满足 5% 蓄电底线（仿真已把池脉冲算进去）
    assert.ok(
      sol.minBatteryPercent >= 5 - 1e-6,
      `场景3 方案最低电量跌破底线：${sol.minBatteryPercent}`,
    );
    // 2) 池功率必须出现在逐秒曲线里，而不是常量
    assert.ok(Array.isArray(sol.poolPowerLog), "场景3 池功率应有逐秒序列");
    const poolValues = new Set(
      (sol.poolPowerLog ?? []).map((v) => Math.round(v)),
    );
    assert.ok(
      poolValues.size > 1 || [...poolValues][0] === 0,
      "场景3 池功率应呈脉冲（出现多个取值）",
    );
    // 3) 不允许再出现「3 台谷地常驻 + 489W 震荡」这种会断电的组合
    const oscSum = (sol.oscillating ?? []).reduce((s, b) => s + b.power, 0);
    const isBlackoutCombo =
      sol.baseConfig.totalPower === 3500 && Math.abs(oscSum - 489) <= 5;
    assert.ok(
      !isBlackoutCombo,
      "场景3 不应返回会让基地断电的组合（base 3500 + osc 489）",
    );
  }
}

console.log("selftest-osc-scenarios: all passed");
