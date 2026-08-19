/**
 * Ensure grid-code i18n keys exist in all 8 locales.
 * Prefer: pnpm exec tsx scripts/_selftest_i18n_grid_keys.mjs
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const localesDir = path.join(__dirname, "../src/i18n");
const locales = ["zh", "en", "de", "fr", "id", "ja", "ko", "ru"];
const required = [
  "gridCodeLabel",
  "copyGridCode",
  "gridCodeCopied",
  "importCodeMenu",
  "importCodeTitle",
  "importCodeLabel",
  "importCodePlaceholder",
  "importCodeInvalid",
  "importCodeKindGrid",
  "importCodeKindUrl",
  "importCodeKindToken",
  "importCodePrefixMismatch",
  "importCodeConfirm",
  "importCodeSuccess",
  "importProfileNameSuffix",
  "shareLinkLabel",
  "copyLink",
];

for (const loc of locales) {
  const file = path.join(localesDir, `locales.${loc}.json`);
  const j = JSON.parse(fs.readFileSync(file, "utf8"));
  for (const key of required) {
    assert.ok(typeof j[key] === "string" && j[key].length > 0, `${loc}.${key}`);
    assert.ok(!/[\u{1F300}-\u{1FAFF}]/u.test(j[key]), `${loc}.${key} has emoji`);
  }
  assert.ok(j.importCodePrefixMismatch.includes("{power}"), `${loc} needs {power}`);
}

console.log("_selftest_i18n_grid_keys: all passed");
