/**
 * 震荡池"按路计算再求和"算法自测。
 * Prefer: pnpm exec tsx scripts/selftest-osc-plan.mjs
 */
import assert from "node:assert/strict";
import { resolveFuel } from "../src/utils/constants.ts";
import {
  affordableDenominator,
  buildPoolPlan,
  LOSS_ITEMS_PER_MINUTE,
  maxTotalWattForBranches,
  minDeviceCostForOscillation,
  minTotalWattPlan,
} from "../src/utils/oscPlan.ts";

const wulingHigh = resolveFuel("wulingHigh");
const wulingMid = resolveFuel("wulingMid");
const valleyHigh = resolveFuel("valleyHigh");
assert.ok(wulingHigh && wulingMid && valleyHigh);

function near(a, b, tol = 1e-6, msg = "") {
  assert.ok(Math.abs(a - b) <= tol, `${msg} expected ${b}, got ${a}`);
}

// 每个取货口每 30 分钟丢 1 个 → 每分钟 1/30
near(LOSS_ITEMS_PER_MINUTE, 1 / 30, 1e-12, "单支损耗速率");

// 1) 默认 48 设备 + 5% 容忍：单支最低 = D36（设备只占 8）
const plan1 = minTotalWattPlan(wulingHigh);
assert.ok(plan1);
assert.equal(plan1.branches.length, 1, "默认预算下 1 路最省");
assert.equal(plan1.branches[0].denominator, 36);
near(plan1.totalWatt, 6400 * (20 / 36), 1e-6, "1 路最低总功率");
assert.equal(plan1.deviceCost, 20);
near(plan1.lossFraction, 4 / 100, 0.01, "单支损耗 ~4%");

// 2) 3 路：每路 D36 需 20，合计 60 → 48 预算放不下，返回 0
assert.equal(affordableDenominator(wulingHigh, 3, { deviceLimit: 48 }), 0);
const plan3 = minTotalWattPlan(wulingHigh, { maxBranches: 3 });
assert.equal(plan3.branches.length, 1, "总功率最小的仍是 1 路");

// 3) 手工 3 路 D36 方案：设备 60，损耗按路叠加
const plan3x = buildPoolPlan(wulingHigh, [36, 36, 36], {
  deviceLimit: 48,
});
near(plan3x.totalWatt, 3 * (6400 * (20 / 36)), 1e-6, "3 路 × D36");
assert.equal(plan3x.deviceCost, 60);
near(plan3x.totalLossPerMinute, 3 / 30, 1e-12, "损耗按路叠加");
near(
  plan3x.lossFraction,
  3 / 30 / (3 * (30 / 36) + 3 / 30),
  1e-9,
  "母带叠加损耗占比",
);

// 4) 中/低档燃料同比缩放
const planMid = minTotalWattPlan(wulingMid);
assert.ok(planMid);
near(planMid.totalWatt, 3200 * (20 / 36), 1e-6, "中容武陵最低");
const planValley = minTotalWattPlan(valleyHigh);
assert.ok(planValley);
near(planValley.totalWatt, 1100 * (20 / 36), 1e-6, "高容谷地最低");

// 5) 设备极紧（< 最小震荡档 8）：没有震荡方案
assert.equal(minTotalWattPlan(wulingHigh, { deviceLimit: 6 }), null);
assert.equal(
  minDeviceCostForOscillation(wulingHigh),
  18,
  "最小震荡档 D24 需 18",
);

// 6) 方案上限
assert.equal(maxTotalWattForBranches(wulingHigh, 2), 12800);
assert.equal(maxTotalWattForBranches(wulingHigh, 3), 19200);

console.log("selftest-osc-plan: all passed");
