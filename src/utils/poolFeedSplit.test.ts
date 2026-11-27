/**
 * poolFeedSplit 单测。项目没有 vitest，这里用 Node 内置 node:test + tsx 跑，0 新依赖：
 *   pnpm exec tsx --test src/utils/poolFeedSplit.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  POOL_FEED_MAX_TENTHS,
  splitPoolFeed,
  toFeedTenths,
  toResidentBaseLine,
} from "./poolFeedSplit";

const close = (a: number, b: number) =>
  assert.ok(Math.abs(a - b) < 1e-9, `${a} !== ${b}`);

describe("toFeedTenths", () => {
  it("消掉浮点误差", () => {
    assert.equal(toFeedTenths(0.1 + 0.2), 3);
    assert.equal(toFeedTenths(1.45), 15);
    assert.equal(toFeedTenths("1.4"), 14);
  });
  it("非法输入 → 0", () => {
    for (const v of [0, -1, Number.NaN, "abc", undefined, null, Infinity]) {
      assert.equal(toFeedTenths(v), 0);
    }
  });
});

describe("splitPoolFeed：40s 电池（满速 1.5/分）", () => {
  it("0 → 不建池", () => {
    const s = splitPoolFeed("valleyLow", 0);
    assert.equal(s.active, false);
    assert.equal(s.residentCount, 0);
    assert.equal(s.remainderPerMin, 0);
    assert.equal(s.needsOscillation, false);
    assert.equal(s.clamped, false);
  });

  it("满速单台投料 = 1.5", () => {
    close(splitPoolFeed("valleyLow", 1).fullSpeedPerMin, 1.5);
    close(splitPoolFeed("wulingHigh", 1).fullSpeedPerMin, 1.5);
  });

  it("1.5 正好满速 → 1 台常驻，无震荡", () => {
    const s = splitPoolFeed("valleyMid", 1.5);
    assert.equal(s.active, true);
    assert.equal(s.residentCount, 1);
    assert.equal(s.remainderTenths, 0);
    assert.equal(s.remainderPerMin, 0);
    assert.equal(s.needsOscillation, false);
  });

  it("1.4 → 全部走震荡", () => {
    const s = splitPoolFeed("valleyLow", 1.4);
    assert.equal(s.residentCount, 0);
    assert.equal(s.remainderTenths, 14);
    close(s.remainderPerMin, 1.4);
    assert.equal(s.needsOscillation, true);
  });

  it("超过 1.5 → 截断到 1.5 并标记", () => {
    const s = splitPoolFeed("valleyLow", 2.3);
    assert.equal(s.clamped, true);
    assert.equal(s.rateTenths, POOL_FEED_MAX_TENTHS);
    assert.equal(s.residentCount, 1);
    assert.equal(s.remainderPerMin, 0);
  });

  it("0.1 ~ 1.5 每一档：常驻 + 零头 = 投料，零头为整数十分位", () => {
    for (let t = 1; t <= POOL_FEED_MAX_TENTHS; t += 1) {
      const s = splitPoolFeed("wulingLow", t / 10);
      assert.equal(s.rateTenths, t);
      assert.ok(Number.isInteger(s.remainderTenths));
      close(s.residentPerMin + s.remainderPerMin, t / 10);
      assert.equal(s.residentCount, t === 15 ? 1 : 0);
    }
  });
});

describe("splitPoolFeed：其他燃料 / 覆盖 burnTime", () => {
  it("源矿 8s（满速 7.5/分）→ 1.5 全是零头", () => {
    const s = splitPoolFeed("ore", 1.5);
    close(s.fullSpeedPerMin, 7.5);
    assert.equal(s.residentCount, 0);
    close(s.remainderPerMin, 1.5);
  });

  it("自定义 burnTime=100（满速 0.6/分）→ 1.5 = 2 台 + 0.3", () => {
    const s = splitPoolFeed("customPrimary", 1.5, {
      customPrimary: { burnTime: 100 },
    });
    assert.equal(s.residentCount, 2);
    close(s.residentPerMin, 1.2);
    assert.equal(s.remainderTenths, 3);
    close(s.remainderPerMin, 0.3);
  });

  it("自定义 burnTime=400（满速 0.15/分）→ 1.5 = 10 台，无零头", () => {
    const s = splitPoolFeed("customPrimary", 1.5, {
      customPrimary: { burnTime: 400 },
    });
    assert.equal(s.residentCount, 10);
    assert.equal(s.needsOscillation, false);
  });

  it("燃料无效 → 不建池", () => {
    for (const id of ["none", "", "notAFuel"]) {
      const s = splitPoolFeed(id, 1);
      assert.equal(s.active, false);
      assert.equal(s.residentCount, 0);
    }
  });
});

describe("toResidentBaseLine", () => {
  it("有常驻 → manualBaseLines 同构行", () => {
    assert.deepEqual(
      toResidentBaseLine(splitPoolFeed("valleyHigh", 1.5), "pool_1_band"),
      { id: "pool_1_band", fuelId: "valleyHigh", count: 1 },
    );
  });
  it("无常驻 → null", () => {
    assert.equal(
      toResidentBaseLine(splitPoolFeed("valleyHigh", 1.2), "x"),
      null,
    );
  });
});
