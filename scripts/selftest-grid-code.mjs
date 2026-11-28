/**
 * Grid Code B (fully-concatenated) self-test (no vitest).
 * Prefer: pnpm exec tsx scripts/selftest-grid-code.mjs
 */
import assert from "node:assert/strict";
import {
  FUEL_OPTIONS,
  FUEL_OPTIONS_DISPLAY,
  SECONDARY_FUEL_OPTIONS,
  SECONDARY_FUEL_OPTIONS_DISPLAY,
} from "../src/utils/constants.ts";
import { DEFAULT_PARAMS } from "../src/utils/defaultParams.ts";
import {
  buildGridCode,
  buildGridCodeHead,
  GRID_CODE_MAGIC,
  parseGridCode,
  parseImportInput,
  suggestImportProfileBaseName,
  suggestImportProfileBaseNameZh,
} from "../src/utils/gridCode.ts";
import {
  decodeShareParams,
  encodeShareParams,
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
    "canonical regex",
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
  const m =
    /^DIGE([VWF])(\d{1,5})([A-Z]{2})([A-Z]{2})([ALMPS])([A-Za-z]+)$/.exec(real);
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
  for (const mode of [
    "auto",
    "legacy",
    "mixed",
    "primaryOnly",
    "secondaryOnly",
  ]) {
    const code = buildGridCode(sampleParams({ multiFuelMode: mode }));
    assert.ok(code);
    const p = parseGridCode(code);
    assert.ok(p);
    assert.equal(p.params.multiFuelMode, mode);
  }
}

/**
 * 燃料编码下标稳定性：shareParams 用数组下标写 5 bit，任何重排都会让
 * 老分享码静默解成别的燃料。新燃料只允许追加在末尾。
 */
function checkFuelWireOrderStability() {
  assert.deepEqual(
    FUEL_OPTIONS.map((f) => f.id),
    [
      "ore",
      "valleyLow",
      "valleyMid",
      "valleyHigh",
      "wulingLow",
      "wulingMid",
      "customPrimary",
      "wulingHigh",
    ],
    "primary fuel wire order changed — old share codes would mis-decode",
  );
  assert.deepEqual(
    SECONDARY_FUEL_OPTIONS.map((f) => f.id),
    [
      "none",
      "ore",
      "valleyLow",
      "valleyMid",
      "valleyHigh",
      "wulingLow",
      "wulingMid",
      "customSecondary",
      "wulingHigh",
    ],
    "secondary fuel wire order changed — old share codes would mis-decode",
  );
  // 历史下标锚点：customPrimary 在 v1.11.1 起一直是 6
  assert.equal(
    FUEL_OPTIONS.findIndex((f) => f.id === "customPrimary"),
    6,
  );

  // 显示顺序与编码顺序解耦，但也要钉住，避免下拉顺序漂移
  assert.deepEqual(
    FUEL_OPTIONS_DISPLAY.map((f) => f.id),
    [
      "ore",
      "valleyLow",
      "valleyMid",
      "valleyHigh",
      "wulingLow",
      "wulingMid",
      "wulingHigh",
      "customPrimary",
    ],
  );
  assert.deepEqual(
    SECONDARY_FUEL_OPTIONS_DISPLAY.map((f) => f.id),
    [
      "none",
      "ore",
      "valleyLow",
      "valleyMid",
      "valleyHigh",
      "wulingLow",
      "wulingMid",
      "wulingHigh",
      "customSecondary",
    ],
  );
}

/** 高容武陵电池（游戏 1.7，6400W / 40s） */
function checkWulingHighFuel() {
  const params = sampleParams({
    targetPower: 6600,
    primaryFuelId: "wulingHigh",
    secondaryFuelId: "none",
  });
  const code = buildGridCode(params);
  assert.ok(code, "wulingHigh should encode");
  assert.ok(
    code.startsWith("DIGEW6600WHNOA"),
    `human head should carry WH: ${code}`,
  );

  const parsed = parseGridCode(code);
  assert.ok(parsed);
  assert.equal(parsed.prefixMismatch, false);
  assert.equal(parsed.params.primaryFuelId, "wulingHigh");
  assert.equal(parsed.params.secondaryFuelId, "none");

  // 副燃料位置同样可承载高容武陵
  const asSecondary = sampleParams({
    primaryFuelId: "valleyHigh",
    secondaryFuelId: "wulingHigh",
  });
  const code2 = buildGridCode(asSecondary);
  assert.ok(code2);
  assert.ok(
    code2.startsWith("DIGEW7300VHWH"),
    `head should carry VH WH: ${code2}`,
  );
  const parsed2 = parseGridCode(code2);
  assert.ok(parsed2);
  assert.equal(parsed2.params.secondaryFuelId, "wulingHigh");

  // 裸 token 往返
  const token = encodeShareParams(params);
  assert.ok(token);
  assert.equal(decodeShareParams(token)?.primaryFuelId, "wulingHigh");

  // 目标功率超过历史 15 bit 上限（32767）时走尾部扩展槽
  const wide = sampleParams({
    targetPower: 65535,
    primaryFuelId: "wulingHigh",
    secondaryFuelId: "none",
  });
  const wideCode = buildGridCode(wide);
  assert.ok(wideCode, "65535W 应可编码");
  assert.ok(
    wideCode.startsWith("DIGEW65535WHNOA"),
    `人读头应带 65535: ${wideCode}`,
  );
  const wideParsed = parseGridCode(wideCode);
  assert.ok(wideParsed);
  assert.equal(wideParsed.params.targetPower, 65535, "扩展槽还原目标功率");

  const midWide = buildGridCode(sampleParams({ targetPower: 40000 }));
  assert.ok(midWide);
  assert.equal(parseGridCode(midWide)?.params.targetPower, 40000);

  // 边界：32767 仍走历史槽，32768 起走扩展槽
  const atLimit = buildGridCode(sampleParams({ targetPower: 32767 }));
  assert.ok(atLimit);
  assert.equal(parseGridCode(atLimit)?.params.targetPower, 32767);
  const overLimit = buildGridCode(sampleParams({ targetPower: 32768 }));
  assert.ok(overLimit);
  assert.equal(parseGridCode(overLimit)?.params.targetPower, 32768);
}

/** 自定义震荡热能池 + 手动常驻行的分享码往返 */
function checkPoolsAndBaseLines() {
  const params = sampleParams({
    targetPower: 10200,
    oscPools: [
      {
        id: "p1",
        fuelId: "wulingHigh",
        enabled: true,
        deviceLimit: 48,
        maxPerMin: 1.6,
      },
      {
        id: "p2",
        fuelId: "valleyHigh",
        enabled: true,
        deviceLimit: 32,
        maxPerMin: 0.5,
      },
    ],
    manualBaseLines: [
      { id: "l1", fuelId: "valleyHigh", count: 2 },
      { id: "l2", fuelId: "wulingMid", count: 1 },
    ],
  });
  const code = buildGridCode(params);
  assert.ok(code, "带池/常驻行的码应可生成");
  const parsed = parseGridCode(code);
  assert.ok(parsed);
  assert.equal(parsed.params.oscPools?.length, 2, "两条池应还原");
  assert.equal(parsed.params.oscPools?.[0].fuelId, "wulingHigh");
  assert.ok(Math.abs(parsed.params.oscPools[0].maxPerMin - 1.6) < 0.11);
  assert.equal(parsed.params.oscPools?.[1].deviceLimit, 32);
  assert.equal(parsed.params.manualBaseLines?.length, 2, "两条常驻行应还原");
  assert.equal(parsed.params.manualBaseLines[0].fuelId, "valleyHigh");
  assert.equal(parsed.params.manualBaseLines[0].count, 2);
}

/** 带分组符（短横/空格）粘贴也应能导入；游戏内短码则不应被误判为我们自己的码 */
function checkSeparatorTolerance() {
  const params = sampleParams({ targetPower: 5800, factoryRegion: "valley" });
  const code = buildGridCode(params);
  assert.ok(code);

  const dashed = code.replace(/(.{5})/g, "$1-").replace(/-$/, "");
  const fromDashed = parseImportInput(dashed);
  assert.ok(fromDashed, "带短横的电网码应可导入");
  assert.equal(fromDashed.params.targetPower, 5800);

  const token = encodeShareParams(params);
  assert.ok(token);
  const tokenDashed = token.replace(/(.{5})/g, "$1 ").trim();
  const fromTokenSpaced = parseImportInput(tokenDashed);
  assert.ok(fromTokenSpaced, "带空格的 token 应可导入");
  assert.equal(fromTokenSpaced.params.targetPower, 5800);

  // 游戏内蓝图码（5-5-5 分组、长度远短于我们的 token）不应被解析成功
  assert.equal(parseImportInput("SKW43ZA-FY5MP-Z7SNB"), null);
  assert.equal(parseImportInput("SKW43ZAFY5MPZ7SNB"), null);
}

function main() {
  checkRoundtrip();
  checkImportShapes();
  checkPrefixMismatchPayloadWins();
  checkSuggestNames();
  checkRegionsAndModes();
  checkFuelWireOrderStability();
  checkWulingHighFuel();
  checkPoolsAndBaseLines();
  checkSeparatorTolerance();
  console.log("selftest-grid-code: all passed");
}

main();
