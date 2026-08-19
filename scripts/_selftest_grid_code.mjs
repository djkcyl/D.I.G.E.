/**
 * Grid Code B (fully-concatenated) self-test (no vitest).
 * Prefer: pnpm exec tsx scripts/_selftest_grid_code.mjs
 */
import assert from "node:assert/strict";
import { DEFAULT_PARAMS } from "../src/utils/defaultParams.ts";
import {
  buildGridCode,
  buildGridCodeHead,
  parseGridCode,
  parseImportInput,
  suggestImportProfileBaseName,
  suggestImportProfileBaseNameZh,
  GRID_CODE_MAGIC,
} from "../src/utils/gridCode.ts";
import {
  encodeShareParams,
  decodeShareParams,
  SHARE_PARAM_KEY,
} from "../src/utils/shareParams.ts";

function sampleParams(overrides = {}) {
  return {
    ...DEFAULT_PARAMS,
    targetPower: 7300,
    factoryRegion: "wuling",
    primaryFuelId: "wulingMid",
    secondaryFuelId: "valleyHigh",
    multiFuelMode: "auto",
    ...overrides,
  };
}

function checkRoundtrip() {
  const params = sampleParams();
  const code = buildGridCode(params);
  assert.ok(code, "buildGridCode should return a string");
  assert.ok(code.startsWith(GRID_CODE_MAGIC), "must start with DIGE");
  assert.match(
    code,
    /^DIGE([VWF])(\d{1,5})([A-Z]{2})([A-Z]{2})([ALMPS])([A-Za-z]+)$/,
    "canonical regex"
  );

  const head = buildGridCodeHead(params);
  assert.ok(head && code.startsWith(head), "code starts with head");

  const parsed = parseGridCode(code);
  assert.ok(parsed, "parseGridCode");
  assert.equal(parsed.kind, "grid");
  assert.equal(parsed.prefixMismatch, false);
  assert.equal(parsed.params.targetPower, 7300);
  assert.equal(parsed.params.factoryRegion, "wuling");
  assert.equal(parsed.params.primaryFuelId, "wulingMid");
  assert.equal(parsed.params.secondaryFuelId, "valleyHigh");
  assert.equal(parsed.params.multiFuelMode, "auto");

  // payload alone must decode to same key fields
  const token = encodeShareParams(params);
  assert.ok(token);
  const fromToken = decodeShareParams(token);
  assert.ok(fromToken);
  assert.equal(fromToken.targetPower, parsed.params.targetPower);
  assert.equal(fromToken.factoryRegion, parsed.params.factoryRegion);
}

function checkImportShapes() {
  const params = sampleParams({ targetPower: 5800, factoryRegion: "valley" });
  const code = buildGridCode(params);
  assert.ok(code);

  // spaced display form
  const spaced = code.replace(/^DIGE/, "DIGE ").replace(/(\d{4})/, "$1 ");
  const fromSpaced = parseImportInput(spaced);
  assert.ok(fromSpaced && fromSpaced.kind === "grid", "spaced grid code");
  assert.equal(fromSpaced.params.targetPower, 5800);

  // bare token
  const token = encodeShareParams(params);
  assert.ok(token);
  const fromBare = parseImportInput(token);
  assert.ok(fromBare && fromBare.kind === "token", "bare token");
  assert.equal(fromBare.params.targetPower, 5800);

  // Absolute URL with ?p= (Node has no window; synthesize like buildShareUrl)
  const url = `https://example.com/dige/?${SHARE_PARAM_KEY}=${token}`;
  const fromUrl = parseImportInput(url);
  assert.ok(fromUrl && fromUrl.kind === "url", "share url");
  assert.equal(fromUrl.params.targetPower, 5800);

  // relative query fragment
  const qs = `?${SHARE_PARAM_KEY}=${token}`;
  const fromQs = parseImportInput(qs);
  assert.ok(fromQs && (fromQs.kind === "url" || fromQs.kind === "token"));
  assert.equal(fromQs.params.targetPower, 5800);

  // invalid
  assert.equal(parseImportInput(""), null);
  assert.equal(parseImportInput("not-a-code"), null);
  assert.equal(parseImportInput("DIGEX9999AAAAAzzzz"), null);
}

function checkPrefixMismatchPayloadWins() {
  const params = sampleParams({ targetPower: 7300, factoryRegion: "wuling" });
  const real = buildGridCode(params);
  assert.ok(real);

  // Corrupt human head power digits but keep valid payload
  const m = /^DIGE([VWF])(\d{1,5})([A-Z]{2})([A-Z]{2})([ALMPS])([A-Za-z]+)$/.exec(
    real
  );
  assert.ok(m);
  const [, region, , primary, secondary, mode, payload] = m;
  const fake = `${GRID_CODE_MAGIC}${region}9999${primary}${secondary}${mode}${payload}`;

  const parsed = parseGridCode(fake);
  assert.ok(parsed, "mismatched head still parses via payload");
  assert.equal(parsed.prefixMismatch, true);
  assert.equal(parsed.params.targetPower, 7300);
  assert.equal(parsed.declaredPower, 9999);
  assert.equal(parsed.actualPower, 7300);

  const viaImport = parseImportInput(fake);
  assert.ok(viaImport && viaImport.kind === "grid");
  assert.equal(viaImport.prefixMismatch, true);
  assert.equal(viaImport.params.targetPower, 7300);
}

function checkSuggestNames() {
  const wuling = sampleParams({ factoryRegion: "wuling", targetPower: 7300 });
  assert.equal(suggestImportProfileBaseName(wuling), "Wuling - 7300W");
  assert.equal(suggestImportProfileBaseNameZh(wuling), "武陵 - 7300W");

  const valley = sampleParams({ factoryRegion: "valley", targetPower: 5800 });
  assert.equal(suggestImportProfileBaseName(valley), "Valley - 5800W");
  assert.equal(suggestImportProfileBaseNameZh(valley), "四号谷地 - 5800W");

  const free = sampleParams({ factoryRegion: "free", targetPower: 2500 });
  assert.equal(suggestImportProfileBaseName(free), "Free - 2500W");
  assert.equal(suggestImportProfileBaseNameZh(free), "自由建造 - 2500W");
}

function checkRegionsAndModes() {
  for (const region of ["valley", "wuling", "free"]) {
    const code = buildGridCode(sampleParams({ factoryRegion: region }));
    assert.ok(code);
    const p = parseGridCode(code);
    assert.ok(p);
    assert.equal(p.params.factoryRegion, region);
  }
  for (const mode of ["auto", "legacy", "mixed", "primaryOnly", "secondaryOnly"]) {
    const code = buildGridCode(sampleParams({ multiFuelMode: mode }));
    assert.ok(code);
    const p = parseGridCode(code);
    assert.ok(p);
    assert.equal(p.params.multiFuelMode, mode);
  }
}

function main() {
  checkRoundtrip();
  checkImportShapes();
  checkPrefixMismatchPayloadWins();
  checkSuggestNames();
  checkRegionsAndModes();
  console.log("_selftest_grid_code: all passed");
}

main();
