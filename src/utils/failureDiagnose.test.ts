/** 无解原因推断：只用已有参数与预检字段，不推断未知的用户操作。 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { CalcParams } from "../types/calc";
import { DEFAULT_PARAMS } from "./defaultParams";
import { diagnoseNoSolution, inferGapCause } from "./failureDiagnose";
import type { PoolPrecheckReport } from "./poolBatteryPrecheck";

const t = (key: string, vars?: Record<string, string | number>) =>
  vars ? `${key}${JSON.stringify(vars)}` : key;
const params = (extra: Partial<CalcParams> = {}): CalcParams => ({
  ...DEFAULT_PARAMS,
  targetPower: 5965,
  primaryFuelId: "valleyHigh",
  secondaryFuelId: "none",
  oscPools: [],
  manualBaseLines: [],
  autoPlanBasePools: true,
  ...extra,
});
const pool = (rate: number) => [
  {
    id: "p1",
    fuelId: "wulingHigh",
    enabled: true,
    deviceLimit: 48,
    maxPerMin: rate,
  },
];

describe("diagnoseNoSolution inferredCause", () => {
  it("预检剔光：指出用户填了带零头的投料量", () => {
    const result = diagnoseNoSolution(params({ oscPools: pool(0.5) }), t, {
      allRemoved: true,
      requiredWaste: 100,
      remW: 2000,
      tOff: 88,
    } as PoolPrecheckReport);
    assert.equal(result.inferredCause, "diagCausePoolRemainder");
  });

  it("requiredWaste=0 时不冒认零头原因，保持第 7 项待定行为", () => {
    const result = diagnoseNoSolution(params({ oscPools: pool(0.5) }), t, {
      allRemoved: true,
      requiredWaste: 0,
      remW: 0,
      tOff: 88,
    } as PoolPrecheckReport);
    assert.equal(result.inferredCause, undefined);
    assert.ok(result.primaryHint.startsWith("diagPoolSurplusNeeded"));
  });

  it("池供电超过目标：指出用户自定义池本身已经超过目标", () => {
    const result = diagnoseNoSolution(
      params({ targetPower: 4000, oscPools: pool(1.5) }),
      t,
    );
    assert.ok(result.primaryHint.startsWith("diagPoolExceedsTarget"));
    assert.equal(result.inferredCause, "diagCausePoolOverTarget");
  });

  it("缺口超过分支上限：指出关了自动常驻或提高了目标功率", () => {
    const result = diagnoseNoSolution(
      params({
        targetPower: 20000,
        autoPlanBasePools: false,
      }),
      t,
    );
    assert.ok(result.primaryHint.startsWith("diagGapTooLarge"));
    assert.equal(result.inferredCause, "diagCauseGapAutoOff");
  });

  it("同一缺口分支在打开自动充底时，指向燃料与 4 路上限", () => {
    assert.equal(inferGapCause(t, true), "diagCauseGapFuelCap");
    assert.equal(inferGapCause(t, false), "diagCauseGapAutoOff");
  });

  it("池零头掉电：指出蓄电池可用电量不足", () => {
    const result = diagnoseNoSolution(params({ oscPools: pool(0.5) }), t);
    assert.ok(result.primaryHint.startsWith("diagPoolBatteryDrain"));
    assert.equal(result.inferredCause, "diagCauseBatteryShort");
  });

  it("综合约束：指出冗余与最低电量同时偏紧", () => {
    const result = diagnoseNoSolution(params({ targetPower: 2000 }), t);
    assert.equal(result.primaryHint, "diagGeneralFailure");
    assert.equal(result.inferredCause, "diagCauseConstraintsTight");
  });

  it("调整链内部异常：优先给出异常与反馈路径", () => {
    const result = diagnoseNoSolution(
      params({ targetPower: 2000 }),
      t,
      null,
      "  worker exploded  ",
    );
    assert.equal(
      result.inferredCause,
      'diagCauseAdjustError{"error":"worker exploded"}',
    );
  });
});
