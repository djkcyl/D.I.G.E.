/**
 * Region–fuel limiter matrix self-test (no vitest).
 * Prefer: pnpm exec tsx scripts/_selftest_region_limiter.mjs
 */
import assert from "node:assert/strict";
import {
  isFuelLimiterSupported,
  normalizeFactoryRegion,
  shouldShowWulingCrossRegionLimiterHint,
} from "../src/utils/regionLimiter.ts";
import { buildBranchLimiterOptions } from "../src/utils/inputRate.ts";
import { resolveFuel, generateValidDenominators } from "../src/utils/constants.ts";

function checkSupportMatrix() {
  assert.equal(normalizeFactoryRegion(undefined), "free");
  assert.equal(normalizeFactoryRegion(null), "free");
  assert.equal(normalizeFactoryRegion(""), "free");
  assert.equal(normalizeFactoryRegion("invalid"), "free");
  assert.equal(normalizeFactoryRegion("valley"), "valley");

  // free: all fuels allow limiter
  for (const id of ["ore", "valleyHigh", "wulingMid", "customPrimary"]) {
    assert.equal(isFuelLimiterSupported(id, "free"), true, `free+${id}`);
  }

  // wuling: all fuels allow limiter
  for (const id of ["ore", "valleyHigh", "wulingMid", "wulingLow"]) {
    assert.equal(isFuelLimiterSupported(id, "wuling"), true, `wuling+${id}`);
  }

  // valley: native + ore ok; wuling batteries blocked
  assert.equal(isFuelLimiterSupported("ore", "valley"), true);
  assert.equal(isFuelLimiterSupported("valleyHigh", "valley"), true);
  assert.equal(isFuelLimiterSupported("valleyMid", "valley"), true);
  assert.equal(isFuelLimiterSupported("wulingMid", "valley"), false);
  assert.equal(isFuelLimiterSupported("wulingLow", "valley"), false);
  assert.equal(isFuelLimiterSupported("customPrimary", "valley"), true);

  // hint: free/valley + wuling battery
  assert.equal(shouldShowWulingCrossRegionLimiterHint("wulingMid", "free"), true);
  assert.equal(shouldShowWulingCrossRegionLimiterHint("wulingMid", "valley"), true);
  assert.equal(shouldShowWulingCrossRegionLimiterHint("wulingMid", "wuling"), false);
  assert.equal(shouldShowWulingCrossRegionLimiterHint("valleyHigh", "free"), false);
  assert.equal(shouldShowWulingCrossRegionLimiterHint("", "free"), false);
}

function checkBranchCandidates() {
  const dens = generateValidDenominators();
  const wulingMid = resolveFuel("wulingMid");
  const valleyHigh = resolveFuel("valleyHigh");
  assert.ok(wulingMid && valleyHigh);

  const valleyWuling = buildBranchLimiterOptions(
    wulingMid,
    "warehouse",
    dens,
    !isFuelLimiterSupported("wulingMid", "valley")
  );
  assert.ok(valleyWuling.length > 0, "valley+wulingMid should still have full-speed options");
  assert.ok(
    valleyWuling.every((o) => o.requiresLimiter === false),
    "valley+wulingMid must not emit limited candidates"
  );

  const valleyNative = buildBranchLimiterOptions(
    valleyHigh,
    "warehouse",
    dens,
    !isFuelLimiterSupported("valleyHigh", "valley")
  );
  assert.ok(
    valleyNative.some((o) => o.requiresLimiter === true),
    "valley+valleyHigh should include limited candidates"
  );

  const wulingForeign = buildBranchLimiterOptions(
    valleyHigh,
    "warehouse",
    dens,
    !isFuelLimiterSupported("valleyHigh", "wuling")
  );
  assert.ok(
    wulingForeign.some((o) => o.requiresLimiter === true),
    "wuling+valleyHigh should include limited candidates"
  );

  const freeWuling = buildBranchLimiterOptions(
    wulingMid,
    "warehouse",
    dens,
    !isFuelLimiterSupported("wulingMid", "free")
  );
  assert.ok(
    freeWuling.some((o) => o.requiresLimiter === true),
    "free+wulingMid should include limited candidates"
  );
}

checkSupportMatrix();
checkBranchCandidates();
console.log("[region-limiter] all checks passed");
