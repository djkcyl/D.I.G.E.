/**
 * 震荡池预算 / 设备容量模型自测。
 * Prefer: pnpm exec tsx scripts/selftest-osc-budget.mjs
 *
 * 设备口径（2026-11-26 起）：取货口 1 + 存货口 2 + 热能池 1 + 分流器/汇流器各 1。
 */
import assert from "node:assert/strict";
import { resolveFuel } from "../src/utils/constants.ts";
import {
  BELT_ITEMS_PER_MINUTE,
  branchItemsPerMinute,
  branchLossFraction,
  branchWatt,
  DEFAULT_DEVICE_LIMIT,
  DEFAULT_LOSS_TOLERANCE,
  deviceCostOfDenominator,
  fullSpeedPerMinute,
  matchDenominator,
  maxDenominatorForDeviceLimit,
  maxDenominatorForLossTolerance,
  perMinuteToWatt,
  singleBranchRange,
  wattToPerMinute,
} from "../src/utils/oscBudget.ts";

const wulingHigh = resolveFuel("wulingHigh");
const wulingMid = resolveFuel("wulingMid");
const valleyHigh = resolveFuel("valleyHigh");
assert.ok(wulingHigh && wulingMid && valleyHigh);

function near(a, b, tol = 1e-6, msg = "") {
  assert.ok(Math.abs(a - b) <= tol, `${msg} expected ${b}, got ${a}`);
}

// 1) 基础口径：40s 电池满速 1.5 个/分
assert.equal(BELT_ITEMS_PER_MINUTE, 30);
near(fullSpeedPerMinute(wulingHigh), 1.5, 1e-9, "满速耗料");
near(
  fullSpeedPerMinute({ ...wulingHigh, burnTime: 8 }),
  7.5,
  1e-9,
  "8s 电池满速耗料",
);

// 2) 单支功率 = 额定 × min(1, (30/D)/满速)
near(branchItemsPerMinute(40), 0.75, 1e-9, "D=40 速率");
near(branchWatt(wulingHigh, 20), 6400, 1e-6, "D=20 满速");
near(branchWatt(wulingHigh, 40), 3200, 1e-6, "D=40 半速");
near(branchWatt(wulingHigh, 24), 6400 * (20 / 24), 1e-6, "D=24");

// 3) 设备容量：取货口 1 + 存货口 2 + 热能池 1 + 分流器各 1
assert.deepEqual(deviceCostOfDenominator(24), {
  two: 3,
  three: 1,
  ports: 4,
  limiter: 0,
  total: 18,
});
assert.equal(deviceCostOfDenominator(36).total, 20, "1+2+1 + 2×3 + 2×5");
assert.equal(deviceCostOfDenominator(32).total, 18, "全二分器：1+1+1+5×3");
assert.equal(deviceCostOfDenominator(24, true).total, 19, "限速器 +1");
assert.equal(deviceCostOfDenominator(35), null, "非 2^a·3^b 返回 null");

// 4) 设备上限 → 最大分母（新口径下设备几乎不可能成为瓶颈）
assert.equal(
  maxDenominatorForDeviceLimit(48),
  32768,
  "48 容量可撑起全二分 D32768",
);
assert.equal(maxDenominatorForDeviceLimit(DEFAULT_DEVICE_LIMIT), 32768);

// 5) 损耗上限：每 30 分钟吞 1 个，容忍 5% → D ≤ 45
near(maxDenominatorForLossTolerance(0.05), 45, 1e-9, "5% 容忍的最大分母");
near(maxDenominatorForLossTolerance(0.1), 90, 1e-9, "10% 容忍的最大分母");

// 6) 单支区间（口径 B）：损耗先卡住 → 最低 D=36
const rangeHigh = singleBranchRange(wulingHigh);
assert.equal(rangeHigh.limitedBy, "loss", "默认预算由损耗卡住");
assert.equal(rangeHigh.minDenominator, 36);
near(rangeHigh.minWatt, 6400 * (20 / 36), 1e-6, "高容武陵最低单支");
near(rangeHigh.maxWatt, 6400, 1e-9, "最高单支=额定");
assert.equal(rangeHigh.minDeviceCost, 20, "D36 设备占用 20");
near(rangeHigh.minLossFraction, 36 / 900, 1e-9, "最低档损耗比例");

const rangeMid = singleBranchRange(wulingMid);
near(rangeMid.minWatt, 3200 * (20 / 36), 1e-6, "中容武陵最低单支");
const rangeValley = singleBranchRange(valleyHigh);
near(rangeValley.minWatt, 1100 * (20 / 36), 1e-6, "高容谷地最低单支");

// 7) 设备连最小震荡档都放不下（最小 D24 需 18）
const tight = singleBranchRange(wulingHigh, { deviceLimit: 6 });
assert.equal(tight.minDenominator, 0, "设备不足时没有震荡档位");
assert.equal(tight.limitedBy, "device");
near(tight.minWatt, 6400, 1e-9, "退化为满速");

// 8) 瓦数 ↔ 投料速率 双向换算
near(wattToPerMinute(wulingHigh, 6400), 1.5, 1e-9, "6400W → 1.5/分");
near(wattToPerMinute(wulingHigh, 3200), 0.75, 1e-9, "3200W → 0.75/分");
near(perMinuteToWatt(wulingHigh, 0.75), 3200, 1e-6, "0.75/分 → 3200W");
near(perMinuteToWatt(valleyHigh, 1.5), 1100, 1e-6, "谷地满速");

// 9) 档位吸附
const m4000 = matchDenominator(wulingHigh, 4000);
assert.ok(m4000);
assert.equal(m4000.denominator, 32);
near(m4000.watt, 4000, 1e-6);
assert.equal(m4000.deviceCost, 18, "D32 设备占用 18");
near(m4000.deltaWatt, 0, 1e-6);

const mDown = matchDenominator(wulingHigh, 3000, { mode: "down" });
assert.ok(mDown);
assert.ok(mDown.watt <= 3000 + 1e-6, "down 模式不得高于目标");

// 10) 损耗比例随分母增长
assert.ok(
  branchLossFraction(wulingHigh, 36) < branchLossFraction(wulingHigh, 72),
  "分母越大损耗占比越高",
);
near(branchLossFraction(wulingHigh, 900), 1, 1e-9, "速率 1/30 时全损");

// 11) 默认值
assert.equal(DEFAULT_DEVICE_LIMIT, 48);
assert.equal(DEFAULT_LOSS_TOLERANCE, 0.05);

console.log("selftest-osc-budget: all passed");
