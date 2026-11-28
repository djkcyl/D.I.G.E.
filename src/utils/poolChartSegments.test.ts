/**
 * poolChartSegments 单测（node:test + tsx，0 新依赖）：
 *   pnpm exec tsx --test src/utils/poolChartSegments.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildPoolSegments,
  poolAverageWatt,
  poolWattAt,
  resolveLogSecondsPerPoint,
} from "./poolChartSegments";

const close = (a: number, b: number) =>
  assert.ok(Math.abs(a - b) < 1e-6, `${a} !== ${b}`);

describe("resolveLogSecondsPerPoint：5760 s 周期 / 12 s 每点", () => {
  it("优先用仿真字段", () => {
    assert.equal(
      resolveLogSecondsPerPoint({ period: 5760, logSecondsPerPoint: 12 }),
      12,
    );
  });
  it("缺字段时兜底 ceil(period/500)，不是 1", () => {
    const step = resolveLogSecondsPerPoint({ period: 5760 });
    assert.equal(step, 12);
    // 481 个点（下标 0..480）→ 横轴末端 = 5760 s，而不是 480 s
    assert.equal(480 * step, 5760);
  });
  it("非法字段回落兜底；短周期 = 1", () => {
    assert.equal(
      resolveLogSecondsPerPoint({ period: 5760, logSecondsPerPoint: 0 }),
      12,
    );
    assert.equal(resolveLogSecondsPerPoint({ period: 128 }), 1);
    assert.equal(resolveLogSecondsPerPoint({ period: 1999 }), 1);
    assert.equal(resolveLogSecondsPerPoint({ period: 2000 }), 4);
    assert.equal(resolveLogSecondsPerPoint(null), 1);
  });
});

describe("buildPoolSegments：1/64 高容武陵（6400 W、40 s、周期 128 s）", () => {
  const segs = buildPoolSegments({
    oscPools: [
      {
        id: "p1",
        fuelId: "wulingHigh",
        enabled: true,
        deviceLimit: 48,
        maxPerMin: 0.5,
      },
    ],
  });

  it("分段字段", () => {
    assert.equal(segs.length, 1);
    const [s] = segs;
    assert.equal(s.constant, 0);
    assert.equal(s.pulseWatt, 6400);
    assert.equal(s.cycle, 128);
    assert.equal(s.onDuration, 40);
    close(s.averageWatt, 2000);
  });

  it("亮灯段高度 = 瞬时 6400，熄灯 = 0", () => {
    assert.equal(poolWattAt(segs, 0), 6400);
    assert.equal(poolWattAt(segs, 39), 6400);
    assert.equal(poolWattAt(segs, 40), 0);
    assert.equal(poolWattAt(segs, 127), 0);
    assert.equal(poolWattAt(segs, 128), 6400);
  });

  it("方波一个周期的均值 = 平均 2000（标题/摘要口径）", () => {
    let sum = 0;
    for (let t = 0; t < 128; t += 1) sum += poolWattAt(segs, t);
    close(sum / 128, 2000);
    close(poolAverageWatt(segs), 2000);
  });

  it("12 s/点采样时按真实秒取值", () => {
    const step = 12;
    assert.equal(poolWattAt(segs, 3 * step), 6400); // 36 s
    assert.equal(poolWattAt(segs, 4 * step), 0); // 48 s
  });

  it("关闭 / 空燃料 / 0 投料 → 无分段", () => {
    assert.equal(
      buildPoolSegments({
        oscPools: [
          {
            id: "a",
            fuelId: "wulingHigh",
            enabled: false,
            deviceLimit: 48,
            maxPerMin: 0.5,
          },
          { id: "b", fuelId: "none", deviceLimit: 48, maxPerMin: 0.5 },
          { id: "c", fuelId: "wulingHigh", deviceLimit: 48, maxPerMin: 0 },
        ],
      }).length,
      0,
    );
    assert.equal(poolAverageWatt(undefined), 0);
    assert.equal(poolWattAt(undefined, 10), 0);
  });
});
