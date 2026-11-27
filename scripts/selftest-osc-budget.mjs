/**
 * 震荡池预算 / 设备容量模型自测。
 * Prefer: pnpm exec tsx scripts/selftest-osc-budget.mjs
 *
 * 设备口径（2026-11-26 起）：取货口 1 + 存货口 2 + 热能池 1 + 分流器/汇流器各 1。
 */
import assert from "node:assert/strict";
import { resolveFuel } from "../src/utils/constants.ts";
import { DEFAULT_PARAMS } from "../src/utils/defaultParams.ts";
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
  normalizeDeviceLimit,
  perMinuteToWatt,
  poolPowerForRate,
  singleBranchRange,
  wattToPerMinute,
} from "../src/utils/oscBudget.ts";
import {
  decodeShareParams,
  encodeShareParams,
} from "../src/utils/shareParams.ts";

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

// 12) 第 7 步：deviceLimit=0/非法 → 默认 48；其余取整并限制在 1..48
// 断言名：step7-normalize-device-limit
for (const [input, expected] of [
  [0, 48],
  [-5, 48],
  [undefined, 48],
  [null, 48],
  [Number.NaN, 48],
  ["", 48],
  ["abc", 48],
  [1, 1],
  [6, 6],
  [24.4, 24],
  [47.6, 48],
  [48, 48],
  [49, 48],
  [127, 48],
  [999, 48],
  ["30", 30],
]) {
  assert.equal(
    normalizeDeviceLimit(input),
    expected,
    `step7-normalize-device-limit: ${String(input)} → ${expected}`,
  );
}

// 断言名：step7-zero-limit-equals-default
{
  const r0 = singleBranchRange(wulingHigh, { deviceLimit: 0 });
  const r48 = singleBranchRange(wulingHigh, { deviceLimit: 48 });
  assert.equal(r0.deviceLimit, 48, "step7: range.deviceLimit 0→48");
  assert.equal(r0.minDenominator, r48.minDenominator, "step7: 0 与 48 同档");
  assert.notEqual(r0.minDenominator, 0, "step7: 0 不再判成放不下");
  const m0 = matchDenominator(wulingHigh, 4000, { deviceLimit: 0 });
  assert.ok(m0, "step7: matchDenominator(deviceLimit=0) 有解");
  assert.equal(m0.denominator, 32);
  const p0 = poolPowerForRate(wulingHigh, 0.5, { deviceLimit: 0 });
  const p48 = poolPowerForRate(wulingHigh, 0.5, { deviceLimit: 48 });
  assert.ok(p0.remainderDenominator != null, "step7: 池零头有档位");
  assert.equal(p0.remainderDenominator, p48.remainderDenominator);
  near(p0.watt, p48.watt, 1e-9, "step7: 池功率 0≡48");
  // 超上限被夹到 48
  const r999 = singleBranchRange(wulingHigh, { deviceLimit: 999 });
  assert.equal(r999.deviceLimit, 48, "step7: 999 → 48");
}

// 断言名：step7-share-params-roundtrip（分享链接编解码两侧都夹到 1..48）
{
  const mk = (deviceLimit) => ({
    ...DEFAULT_PARAMS,
    oscPools: [
      {
        id: "pool_1",
        fuelId: "wulingHigh",
        enabled: true,
        deviceLimit,
        maxPerMin: 0.5,
      },
    ],
  });
  for (const [input, expected] of [
    [0, 48],
    [1, 1],
    [30, 30],
    [48, 48],
    [99, 48],
    [127, 48],
  ]) {
    const code = encodeShareParams(mk(input));
    assert.ok(code, `step7-share-params-roundtrip: encode(${input}) 非空`);
    const decoded = decodeShareParams(code);
    assert.ok(
      decoded?.oscPools?.length === 1,
      `step7-share-params-roundtrip: decode(${input}) 有池`,
    );
    assert.equal(
      decoded.oscPools[0].deviceLimit,
      expected,
      `step7-share-params-roundtrip: ${input} → ${expected}`,
    );
  }
}

console.log("selftest-osc-budget: step7 assertions passed");

// 13) 第 1 步：池零头向下取档，实际投料 30/D ≤ 申请量，总投料 ≤ maxPerMin
// 断言名：step1-remainder-down-14-levels
{
  const fuels = [
    ["wulingHigh", wulingHigh],
    ["wulingMid", wulingMid],
    ["valleyHigh", valleyHigh],
  ];
  const table = [];
  for (const [name, fuel] of fuels) {
    const fullRate = fullSpeedPerMinute(fuel);
    for (let k = 1; k <= 14; k += 1) {
      for (const bandCount of [0, 1, 2]) {
        const perMin = Math.round((bandCount * fullRate + k * 0.1) * 1e6) / 1e6;
        const rated = poolPowerForRate(fuel, perMin);
        const actual =
          rated.bands.generators * fullRate + rated.remainderActualPerMin;
        const tag = `step1-remainder-down-14-levels: ${name} ${perMin}/分`;
        assert.ok(actual <= perMin + 1e-9, `${tag} 实际 ${actual} > 上限`);
        assert.ok(
          rated.remainderActualPerMin <= rated.remainderPerMin + 1e-9,
          `${tag} 零头实际 ${rated.remainderActualPerMin} > 申请 ${rated.remainderPerMin}`,
        );
        if (rated.remainderDenominator != null) {
          near(
            rated.remainderActualPerMin,
            BELT_ITEMS_PER_MINUTE / rated.remainderDenominator,
            1e-9,
            `${tag} 实际 = 30/D`,
          );
          assert.ok(
            rated.remainderWatt <=
              perMinuteToWatt(fuel, rated.remainderPerMin) + 1e-6,
            `${tag} 零头功率不得高于申请功率`,
          );
        } else {
          assert.equal(rated.remainderActualPerMin, 0, `${tag} 无档位时为 0`);
        }
        if (bandCount === 0 && name === "wulingHigh") {
          table.push(
            `${perMin.toFixed(1)}→1/${rated.remainderDenominator ?? "-"}=${rated.remainderActualPerMin.toFixed(3)}`,
          );
        }
      }
    }
  }
  console.log(`step1 wulingHigh 14 档：${table.join("  ")}`);
}

// 断言名：step1-screenshot-05-to-64（截图案例 0.5/分 → 1/64 · 2000W，实际 0.469/分）
{
  const p = poolPowerForRate(wulingHigh, 0.5);
  assert.equal(p.remainderDenominator, 64, "step1-screenshot-05-to-64: D");
  near(p.remainderWatt, 2000, 1e-6, "step1-screenshot-05-to-64: W");
  near(
    p.remainderActualPerMin,
    30 / 64,
    1e-9,
    "step1-screenshot-05-to-64: 实际",
  );
}

console.log("selftest-osc-budget: step1 assertions passed");

console.log("selftest-osc-budget: all passed");
