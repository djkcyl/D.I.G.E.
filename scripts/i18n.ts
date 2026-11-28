import { promises as fs } from "node:fs";
import path from "node:path";
import * as ts from "typescript";

// ─── Shared Config ───────────────────────────────────────────────────────────

const ROOT = process.cwd();
const SRC_DIR = path.join(ROOT, "src");
const LOCALES_DIR = path.join(SRC_DIR, "i18n");
const ANNOUNCEMENT_LOCALES_DIR = path.join(LOCALES_DIR, "announcement");

const SOURCE_LOCALE = "zh";
const TARGET_LOCALES = ["en", "ja", "ko", "ru", "fr", "de", "id"];
const ALL_LOCALES = [SOURCE_LOCALE, ...TARGET_LOCALES];

// ─── Shared Locale Helpers ───────────────────────────────────────────────────

function sortKeys(data: Record<string, string>): Record<string, string> {
  const sorted: Record<string, string> = {};
  for (const key of Object.keys(data).sort((a, b) => a.localeCompare(b))) {
    sorted[key] = data[key];
  }
  return sorted;
}

function getLocaleFilePath(locale: string): string {
  return path.join(LOCALES_DIR, `locales.${locale}.json`);
}

async function readLocaleFile(locale: string): Promise<Record<string, string>> {
  const filePath = getLocaleFilePath(locale);
  const text = await fs.readFile(filePath, "utf8");
  const sanitized = text.replace(/^\uFEFF/, "");
  return JSON.parse(sanitized) as Record<string, string>;
}

async function writeLocaleFile(
  locale: string,
  data: Record<string, string>,
): Promise<void> {
  const filePath = getLocaleFilePath(locale);
  const output = `${JSON.stringify(sortKeys(data), null, 2)}\n`;
  await fs.writeFile(filePath, output, "utf8");
}

async function readAllLocaleData(): Promise<
  Record<string, Record<string, string>>
> {
  const out: Record<string, Record<string, string>> = {};
  for (const locale of ALL_LOCALES) {
    out[locale] = await readLocaleFile(locale);
  }
  return out;
}

type ChangelogSectionLike = {
  version?: string;
  items?: string[];
  [key: string]: unknown;
};

type AnnouncementLocaleFile = {
  changelog?: {
    sections?: ChangelogSectionLike[];
    [key: string]: unknown;
  };
  [key: string]: unknown;
};

function getAnnouncementLocaleFilePath(locale: string): string {
  return path.join(ANNOUNCEMENT_LOCALES_DIR, `locales.${locale}.json`);
}

async function readAnnouncementLocaleFile(
  locale: string,
): Promise<AnnouncementLocaleFile> {
  const filePath = getAnnouncementLocaleFilePath(locale);
  const text = await fs.readFile(filePath, "utf8");
  const sanitized = text.replace(/^\uFEFF/, "");
  return JSON.parse(sanitized) as AnnouncementLocaleFile;
}

async function writeAnnouncementLocaleFile(
  locale: string,
  data: AnnouncementLocaleFile,
): Promise<void> {
  const filePath = getAnnouncementLocaleFilePath(locale);
  await fs.writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

function parseLocaleFlagArgs(args: string[]): Record<string, string> {
  const translations: Record<string, string> = {};

  let i = 0;
  while (i < args.length) {
    const arg = args[i];
    if (arg === "--") {
      i++;
      continue;
    }

    const localeMatch = arg.match(/^--(\w+)$/);
    if (!localeMatch || !ALL_LOCALES.includes(localeMatch[1])) {
      console.error(`Error: unknown argument "${arg}"`);
      process.exit(1);
    }

    const locale = localeMatch[1];
    i++;
    if (i >= args.length) {
      console.error(`Error: missing value for --${locale}`);
      process.exit(1);
    }

    translations[locale] = args[i];
    i++;
  }

  return translations;
}

// ─── Translate: check/add/delete/generate/apply ─────────────────────────────

interface AddEntry {
  key: string;
  translations: Record<string, string>;
}

type TranslationTemplate = Record<string, Record<string, string>>;

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function getMissingLocales(translations: Record<string, string>): string[] {
  return ALL_LOCALES.filter(
    (locale) => !isNonEmptyString(translations[locale]),
  );
}

async function checkSync(): Promise<boolean> {
  const source = await readLocaleFile(SOURCE_LOCALE);
  const sourceKeys = Object.keys(source).sort();
  let allSynced = true;

  console.log(`Source: ${SOURCE_LOCALE} (${sourceKeys.length} keys)\n`);

  for (const locale of TARGET_LOCALES) {
    const target = await readLocaleFile(locale);
    const targetKeySet = new Set(Object.keys(target));
    const sourceKeySet = new Set(sourceKeys);

    const missing = sourceKeys.filter((k) => !targetKeySet.has(k));
    const extra = Object.keys(target)
      .sort()
      .filter((k) => !sourceKeySet.has(k));

    if (missing.length === 0 && extra.length === 0) {
      console.log(`  ✓ ${locale} — synced (${targetKeySet.size} keys)`);
      continue;
    }

    allSynced = false;
    console.log(`  ✗ ${locale}:`);

    if (missing.length > 0) {
      console.log(`    Missing (${missing.length}):`);
      for (const key of missing) {
        console.log(`      + "${key}": "${source[key]}"`);
      }
    }

    if (extra.length > 0) {
      console.log(`    Extra (${extra.length}):`);
      for (const key of extra) {
        console.log(`      - "${key}"`);
      }
    }

    console.log("");
  }

  if (allSynced) {
    console.log("\n  All locale files are in sync.");
  }

  return allSynced;
}

function parseAddArgs(args: string[]): AddEntry[] {
  const entries: AddEntry[] = [];
  let current: AddEntry | null = null;

  let i = 0;
  while (i < args.length) {
    const arg = args[i];

    if (arg === "add") {
      if (current) entries.push(current);
      i++;
      if (i >= args.length) {
        console.error('Error: "add" 后面需要跟 key 名称');
        process.exit(1);
      }
      current = { key: args[i], translations: {} };
      i++;
      continue;
    }

    const localeMatch = arg.match(/^--(\w+)$/);
    if (localeMatch && ALL_LOCALES.includes(localeMatch[1])) {
      const locale = localeMatch[1];
      i++;
      if (i >= args.length) {
        console.error(`Error: --${locale} 后面需要跟翻译内容`);
        process.exit(1);
      }
      if (!current) {
        console.error(`Error: --${locale} 必须在 "add <key>" 之后使用`);
        process.exit(1);
      }
      current.translations[locale] = args[i];
      i++;
      continue;
    }

    if (arg === "--") {
      i++;
      continue;
    }

    console.error(`Error: 未知参数 "${arg}"`);
    process.exit(1);
  }

  if (current) entries.push(current);
  return entries;
}

async function addEntries(
  entries: AddEntry[],
  sourceLabel: string,
): Promise<void> {
  if (entries.length === 0) {
    console.error("Error: 没有需要添加的翻译");
    process.exit(1);
  }

  for (const entry of entries) {
    const missing = getMissingLocales(entry.translations);
    if (missing.length > 0) {
      console.error(
        `Error: key "${entry.key}" 缺少以下语言的翻译: ${missing.map((l) => `--${l}`).join(" ")}`,
      );
      process.exit(1);
    }
  }

  const localeData = await readAllLocaleData();

  console.log("");
  for (const entry of entries) {
    const isNew = localeData[SOURCE_LOCALE][entry.key] === undefined;
    console.log(
      `  ${isNew ? "ADD" : "UPDATE"} "${entry.key}"${sourceLabel ? ` (${sourceLabel})` : ""}`,
    );
    for (const locale of ALL_LOCALES) {
      localeData[locale][entry.key] = entry.translations[locale].trim();
      if (!sourceLabel) {
        console.log(`    [${locale}] ${entry.translations[locale]}`);
      }
    }
  }

  for (const locale of ALL_LOCALES) {
    await writeLocaleFile(locale, localeData[locale]);
  }

  console.log(
    `\n  Done. ${entries.length} key(s) × ${ALL_LOCALES.length} locales.\n`,
  );
  console.log("--- Sync check ---\n");
  await checkSync();
}

async function addTranslations(args: string[]): Promise<void> {
  const entries = parseAddArgs(args);
  if (entries.length === 0) {
    console.error("Error: 没有需要添加的翻译");
    console.error(
      'Usage: pnpm run i18n translate add <key> --zh "中文" --en "English" --ja "日本語" --ko "한국어" --ru "Русский" --fr "Français" --de "Deutsch"',
    );
    process.exit(1);
  }
  await addEntries(entries, "");
}

async function deleteKeys(keys: string[]): Promise<void> {
  if (keys.length === 0) {
    console.error("Error: 请指定要删除的 key");
    console.error("Usage: pnpm run i18n translate delete <key1> [<key2> ...]");
    process.exit(1);
  }

  const localeData = await readAllLocaleData();

  console.log("");
  for (const key of keys) {
    let found = false;
    for (const locale of ALL_LOCALES) {
      if (key in localeData[locale]) {
        delete localeData[locale][key];
        found = true;
      }
    }
    console.log(`  ${found ? "DELETE" : "SKIP (not found)"} "${key}"`);
  }

  for (const locale of ALL_LOCALES) {
    await writeLocaleFile(locale, localeData[locale]);
  }

  console.log("\n  Done.\n");
  console.log("--- Sync check ---\n");
  await checkSync();
}

async function generateTemplate(
  outputPathArg: string | undefined,
  keys: string[],
): Promise<void> {
  if (!outputPathArg) {
    console.error("Error: 请指定输出文件路径");
    console.error(
      "Usage: pnpm run i18n translate generate <output.json> <key1> [<key2> ...]",
    );
    process.exit(1);
  }

  const cleanKeys = keys
    .filter((k) => k !== "--")
    .map((k) => k.trim())
    .filter(Boolean);
  if (cleanKeys.length === 0) {
    console.error("Error: 请至少指定一个 key");
    console.error(
      "Usage: pnpm run i18n translate generate <output.json> <key1> [<key2> ...]",
    );
    process.exit(1);
  }

  const uniqueKeys = Array.from(new Set(cleanKeys));
  const localeData = await readAllLocaleData();

  const template: TranslationTemplate = {};
  for (const key of uniqueKeys) {
    template[key] = {};
    for (const locale of ALL_LOCALES) {
      template[key][locale] = localeData[locale][key] ?? "";
    }
  }

  const outputPath = path.isAbsolute(outputPathArg)
    ? outputPathArg
    : path.join(ROOT, outputPathArg);
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(
    outputPath,
    `${JSON.stringify(template, null, 2)}\n`,
    "utf8",
  );

  console.log(`\n  Template generated: ${outputPath}`);
  console.log(`  Keys: ${uniqueKeys.length}`);
  console.log(`  Locales: ${ALL_LOCALES.join(", ")}\n`);
}

async function applyTemplate(inputPathArg: string | undefined): Promise<void> {
  if (!inputPathArg) {
    console.error("Error: 请指定输入文件路径");
    console.error("Usage: pnpm run i18n translate apply <input.json>");
    process.exit(1);
  }

  const inputPath = path.isAbsolute(inputPathArg)
    ? inputPathArg
    : path.join(ROOT, inputPathArg);

  let raw: string;
  try {
    raw = await fs.readFile(inputPath, "utf8");
  } catch (error) {
    console.error(`Error: 无法读取文件 ${inputPath}`);
    throw error;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.replace(/^\uFEFF/, "")) as unknown;
  } catch (error) {
    console.error(`Error: JSON 解析失败 (${inputPath})`);
    throw error;
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    console.error(
      'Error: 模板格式错误。需要对象格式: { "<key>": { "zh": "...", "en": "...", ... } }',
    );
    process.exit(1);
  }

  const entries: AddEntry[] = [];
  for (const [key, value] of Object.entries(
    parsed as Record<string, unknown>,
  )) {
    if (!key.trim()) {
      console.error("Error: 检测到空 key");
      process.exit(1);
    }
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      console.error(`Error: key "${key}" 的值必须是对象`);
      process.exit(1);
    }

    const translations = value as Record<string, string>;
    const missing = getMissingLocales(translations);
    if (missing.length > 0) {
      console.error(
        `Error: key "${key}" 缺少或包含空翻译: ${missing.map((l) => `[${l}]`).join(", ")}`,
      );
      process.exit(1);
    }

    entries.push({
      key,
      translations: Object.fromEntries(
        ALL_LOCALES.map((locale) => [locale, translations[locale].trim()]),
      ),
    });
  }

  if (entries.length === 0) {
    console.error("Error: 模板中没有可写入的 key");
    process.exit(1);
  }

  await addEntries(entries, "from template");
}

function printTranslateUsage(): void {
  console.log(`
Translate Commands
==================

  pnpm run i18n translate
    检查各语言文件的同步状态

  pnpm run i18n translate add <key> --zh "中文" --en "English" --ja "日本語" --ko "한국어" --ru "Русский" --fr "Français" --de "Deutsch"

  pnpm run i18n translate delete <key> [<key2> ...]

  pnpm run i18n translate generate <output.json> <key1> [<key2> ...]

  pnpm run i18n translate apply <input.json>
`);
}

async function runTranslateCommand(args: string[]): Promise<void> {
  if (args.includes("--help") || args.includes("-h")) {
    printTranslateUsage();
    return;
  }

  if (args.length === 0) {
    await checkSync();
    return;
  }

  const command = args[0];

  if (command === "add") {
    await addTranslations(args);
    return;
  }

  if (command === "delete") {
    const keys = args.slice(1).filter((a) => a !== "--");
    await deleteKeys(keys);
    return;
  }

  if (command === "generate") {
    const outputPath = args[1];
    const keys = args.slice(2);
    await generateTemplate(outputPath, keys);
    return;
  }

  if (command === "apply") {
    const inputPath = args[1];
    await applyTemplate(inputPath);
    return;
  }

  console.error(`Error: translate 未知命令 "${command}"`);
  printTranslateUsage();
  process.exit(1);
}

// ─── Prune Command ───────────────────────────────────────────────────────────

function printChangelogUsage(): void {
  console.log(`
Changelog Commands
==================

  pnpm run i18n changelog append <version> --zh "..." --en "..." --ja "..." --ko "..." --ru "..." --fr "..." --de "..."
    Append one changelog item to an existing section in src/i18n/announcement/locales.*.json
`);
}

async function appendChangelogItem(
  version: string | undefined,
  args: string[],
): Promise<void> {
  if (!isNonEmptyString(version)) {
    console.error("Error: changelog version is required.");
    console.error(
      'Usage: pnpm run i18n changelog append <version> --zh "..." --en "..." --ja "..." --ko "..." --ru "..." --fr "..." --de "..."',
    );
    process.exit(1);
  }

  const translations = parseLocaleFlagArgs(args);
  const missingLocales = getMissingLocales(translations);
  if (missingLocales.length > 0) {
    console.error(
      `Error: missing translations for locales: ${missingLocales.map((l) => `--${l}`).join(" ")}`,
    );
    process.exit(1);
  }

  const localeData: Record<string, AnnouncementLocaleFile> = {};
  for (const locale of ALL_LOCALES) {
    localeData[locale] = await readAnnouncementLocaleFile(locale);
  }

  const sourceSections = localeData[SOURCE_LOCALE]?.changelog?.sections;
  const availableVersions = Array.isArray(sourceSections)
    ? sourceSections
        .map((section) => section.version)
        .filter(
          (item): item is string => typeof item === "string" && item.length > 0,
        )
    : [];

  for (const locale of ALL_LOCALES) {
    const sections = localeData[locale]?.changelog?.sections;
    if (!Array.isArray(sections)) {
      console.error(
        `Error: changelog.sections is missing or invalid in locale "${locale}".`,
      );
      process.exit(1);
    }

    const section = sections.find((item) => item?.version === version);
    if (!section) {
      console.error(
        `Error: version "${version}" was not found in locale "${locale}".`,
      );
      if (availableVersions.length > 0) {
        console.error(
          `Available versions in ${SOURCE_LOCALE}: ${availableVersions.join(", ")}`,
        );
      }
      process.exit(1);
    }

    if (!Array.isArray(section.items)) {
      console.error(
        `Error: changelog section "${version}" has invalid items in locale "${locale}".`,
      );
      process.exit(1);
    }
  }

  console.log("");
  let appendedCount = 0;

  for (const locale of ALL_LOCALES) {
    const section = localeData[locale].changelog?.sections?.find(
      (item) => item?.version === version,
    );
    if (!section || !Array.isArray(section.items)) continue;

    const nextItem = translations[locale].trim();
    if (section.items.includes(nextItem)) {
      console.log(`  SKIP [${locale}] already exists`);
      continue;
    }

    section.items.push(nextItem);
    appendedCount++;
    console.log(`  APPEND [${locale}] ${nextItem}`);
  }

  for (const locale of ALL_LOCALES) {
    await writeAnnouncementLocaleFile(locale, localeData[locale]);
  }

  console.log("");
  console.log(
    `  Done. Appended to version "${version}" across ${ALL_LOCALES.length} locales.`,
  );
  console.log(`  Updated entries: ${appendedCount}/${ALL_LOCALES.length}`);
}

async function runChangelogCommand(args: string[]): Promise<void> {
  if (args.includes("--help") || args.includes("-h")) {
    printChangelogUsage();
    return;
  }

  if (args.length === 0) {
    printChangelogUsage();
    return;
  }

  const [command, ...rest] = args;
  if (command === "append") {
    const version = rest[0];
    const translationArgs = rest.slice(1);
    await appendChangelogItem(version, translationArgs);
    return;
  }

  console.error(`Error: unknown changelog command "${command}"`);
  printChangelogUsage();
  process.exit(1);
}

type PruneOptions = {
  write: boolean;
  force: boolean;
  keep: Set<string>;
  keepPrefixes: string[];
};

type DynamicUsage = {
  file: string;
  line: number;
  text: string;
};

const SOURCE_EXTS = new Set([".js", ".jsx", ".ts", ".tsx"]);
const IGNORED_DIRS = new Set(["node_modules", "dist", ".git", "public"]);

function parsePruneArgs(argv: string[]): PruneOptions {
  const opts: PruneOptions = {
    write: false,
    force: false,
    keep: new Set(),
    keepPrefixes: [],
  };

  for (const arg of argv) {
    if (arg === "--write") opts.write = true;
    else if (arg === "--force") opts.force = true;
    else if (arg.startsWith("--keep=")) {
      const raw = arg.slice("--keep=".length).trim();
      if (raw)
        raw
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
          .forEach((k) => {
            opts.keep.add(k);
          });
    } else if (arg.startsWith("--keep-prefix=")) {
      const raw = arg.slice("--keep-prefix=".length).trim();
      if (raw)
        opts.keepPrefixes.push(
          ...raw
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
        );
    }
  }

  return opts;
}

function printPruneUsage(): void {
  console.log(
    "Usage: pnpm run i18n prune [--write] [--force] [--keep=a,b] [--keep-prefix=p1,p2]",
  );
  console.log("");
  console.log("Options:");
  console.log("  --write         Apply changes (default is dry-run)");
  console.log("  --force         Allow pruning when dynamic keys are detected");
  console.log("  --keep=keys     Comma-separated keys to keep");
  console.log("  --keep-prefix=  Comma-separated key prefixes to keep");
}

async function walkFiles(dir: string, files: string[] = []): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (IGNORED_DIRS.has(entry.name)) continue;
      await walkFiles(path.join(dir, entry.name), files);
      continue;
    }
    const ext = path.extname(entry.name);
    if (SOURCE_EXTS.has(ext)) files.push(path.join(dir, entry.name));
  }
  return files;
}

function getScriptKind(filePath: string): ts.ScriptKind {
  const ext = path.extname(filePath);
  if (ext === ".tsx") return ts.ScriptKind.TSX;
  if (ext === ".ts") return ts.ScriptKind.TS;
  if (ext === ".jsx") return ts.ScriptKind.JSX;
  return ts.ScriptKind.JS;
}

function isLocalesAccess(expr: ts.Expression): boolean {
  if (ts.isPropertyAccessExpression(expr)) {
    return (
      ts.isIdentifier(expr.expression) && expr.expression.text === "locales"
    );
  }
  if (ts.isElementAccessExpression(expr)) {
    return (
      ts.isIdentifier(expr.expression) && expr.expression.text === "locales"
    );
  }
  return false;
}

function isLocaleObjectExpr(expr: ts.Expression): boolean {
  if (isLocalesAccess(expr)) return true;
  if (ts.isParenthesizedExpression(expr))
    return isLocaleObjectExpr(expr.expression);
  if (ts.isBinaryExpression(expr)) {
    const op = expr.operatorToken.kind;
    if (
      op === ts.SyntaxKind.BarBarToken ||
      op === ts.SyntaxKind.QuestionQuestionToken
    ) {
      return isLocaleObjectExpr(expr.left) || isLocaleObjectExpr(expr.right);
    }
  }
  return false;
}

function isTCallExpression(expr: ts.Expression): boolean {
  if (ts.isIdentifier(expr)) return expr.text === "t";
  if (ts.isPropertyAccessExpression(expr)) return expr.name.text === "t";
  if (ts.isElementAccessExpression(expr)) {
    return (
      ts.isStringLiteral(expr.argumentExpression) &&
      expr.argumentExpression.text === "t"
    );
  }
  return false;
}

function getLiteralKey(node: ts.Expression): string | null {
  if (ts.isStringLiteral(node)) return node.text;
  if (ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  return null;
}

function collectUsedKeysFromFile(
  filePath: string,
  sourceText: string,
  usedKeys: Set<string>,
  dynamicUsages: DynamicUsage[],
): void {
  const sourceFile = ts.createSourceFile(
    filePath,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    getScriptKind(filePath),
  );
  const localeVars = new Set<string>();

  const collectLocaleVars = (node: ts.Node): void => {
    if (
      ts.isVariableDeclaration(node) &&
      node.initializer &&
      isLocaleObjectExpr(node.initializer)
    ) {
      if (ts.isIdentifier(node.name)) {
        localeVars.add(node.name.text);
      } else if (ts.isObjectBindingPattern(node.name)) {
        for (const element of node.name.elements) {
          if (ts.isIdentifier(element.name)) usedKeys.add(element.name.text);
        }
      }
    }
    ts.forEachChild(node, collectLocaleVars);
  };

  collectLocaleVars(sourceFile);

  const collectKeys = (node: ts.Node): void => {
    const tsWithChain = ts as { isCallChain?: (n: ts.Node) => boolean };
    if (ts.isCallExpression(node) || tsWithChain.isCallChain?.(node)) {
      const callExpr = node as ts.CallExpression;
      if (
        isTCallExpression(callExpr.expression) &&
        callExpr.arguments.length > 0
      ) {
        const arg = callExpr.arguments[0];
        const literal = getLiteralKey(arg);
        if (literal) {
          usedKeys.add(literal);
        } else {
          const { line } = sourceFile.getLineAndCharacterOfPosition(
            callExpr.pos,
          );
          dynamicUsages.push({
            file: filePath,
            line: line + 1,
            text: callExpr.getText(sourceFile),
          });
        }
      }
    }

    if (ts.isPropertyAccessExpression(node)) {
      const base = node.expression;
      if (
        (ts.isIdentifier(base) && localeVars.has(base.text)) ||
        isLocaleObjectExpr(base)
      ) {
        usedKeys.add(node.name.text);
      }
    }

    if (ts.isElementAccessExpression(node)) {
      const base = node.expression;
      if (
        (ts.isIdentifier(base) && localeVars.has(base.text)) ||
        isLocaleObjectExpr(base)
      ) {
        const literal = node.argumentExpression
          ? getLiteralKey(node.argumentExpression)
          : null;
        if (literal) usedKeys.add(literal);
      }
    }

    ts.forEachChild(node, collectKeys);
  };

  collectKeys(sourceFile);
}

async function collectUsedKeys(
  srcDir: string,
): Promise<{ usedKeys: Set<string>; dynamicUsages: DynamicUsage[] }> {
  const files = await walkFiles(srcDir);
  const usedKeys = new Set<string>();
  const dynamicUsages: DynamicUsage[] = [];

  await Promise.all(
    files.map(async (file) => {
      const text = await fs.readFile(file, "utf8");
      collectUsedKeysFromFile(file, text, usedKeys, dynamicUsages);
    }),
  );

  return { usedKeys, dynamicUsages };
}

async function getLocaleJsonFiles(): Promise<string[]> {
  const entries = await fs.readdir(LOCALES_DIR);
  return entries
    .filter((name) => /^locales\..+\.json$/.test(name))
    .map((name) => path.join(LOCALES_DIR, name))
    .filter((name) => name !== path.join(LOCALES_DIR, "locales.json"));
}

async function pruneLocaleFile(
  filePath: string,
  usedKeys: Set<string>,
  opts: PruneOptions,
): Promise<{ pruned: Record<string, string>; unusedKeys: string[] }> {
  const text = await fs.readFile(filePath, "utf8");
  let data: Record<string, string>;
  try {
    data = JSON.parse(text.replace(/^\uFEFF/, "")) as Record<string, string>;
  } catch (error) {
    throw new Error(`Failed to parse JSON in ${filePath}: ${String(error)}`);
  }

  const unusedKeys: string[] = [];
  const pruned: Record<string, string> = {};

  for (const key of Object.keys(data)) {
    const keep =
      usedKeys.has(key) ||
      opts.keep.has(key) ||
      opts.keepPrefixes.some((prefix) => key.startsWith(prefix));
    if (keep) pruned[key] = data[key];
    else unusedKeys.push(key);
  }

  return { pruned, unusedKeys };
}

async function runPruneCommand(args: string[]): Promise<void> {
  if (args.includes("--help") || args.includes("-h")) {
    printPruneUsage();
    return;
  }

  const opts = parsePruneArgs(args);
  const localeFiles = await getLocaleJsonFiles();

  if (localeFiles.length === 0) {
    throw new Error("No locale files found. Expected src/i18n/locales.*.json");
  }

  const { usedKeys, dynamicUsages } = await collectUsedKeys(SRC_DIR);

  if (dynamicUsages.length > 0 && opts.write && !opts.force) {
    console.error(
      "Dynamic translation key usage found. Run with --force to prune anyway:",
    );
    for (const usage of dynamicUsages) {
      console.error(`- ${usage.file}:${usage.line} ${usage.text}`);
    }
    process.exit(1);
  }

  if (dynamicUsages.length > 0 && (!opts.write || opts.force)) {
    console.warn(
      "Dynamic translation key usage found (review before pruning):",
    );
    for (const usage of dynamicUsages) {
      console.warn(`- ${usage.file}:${usage.line} ${usage.text}`);
    }
  }

  let totalRemoved = 0;

  for (const file of localeFiles) {
    const { pruned, unusedKeys } = await pruneLocaleFile(file, usedKeys, opts);
    if (unusedKeys.length === 0) {
      if (opts.write) {
        const locale = path
          .basename(file)
          .replace(/^locales\./, "")
          .replace(/\.json$/, "");
        await writeLocaleFile(locale, pruned);
      }
      console.log(`[keep] ${path.relative(ROOT, file)} (0 unused keys)`);
      continue;
    }

    totalRemoved += unusedKeys.length;

    if (opts.write) {
      const locale = path
        .basename(file)
        .replace(/^locales\./, "")
        .replace(/\.json$/, "");
      await writeLocaleFile(locale, pruned);
      console.log(
        `[pruned] ${path.relative(ROOT, file)} (-${unusedKeys.length} keys)`,
      );
    } else {
      console.log(
        `[report] ${path.relative(ROOT, file)} (${unusedKeys.length} unused keys)`,
      );
      console.log(`  Unused: ${unusedKeys.join(", ")}`);
    }
  }

  if (!opts.write) {
    console.log("");
    console.log("Dry run complete. Use --write to apply changes.");
  } else {
    console.log("");
    console.log(`Prune complete. Removed ${totalRemoved} keys.`);
    console.log("");
    console.log("--- Sync check ---\n");
    await checkSync();
  }
}

// ─── CLI Entry ───────────────────────────────────────────────────────────────

function printMainUsage(): void {
  console.log(`
i18n Tool
=========

Commands:

  pnpm run i18n
    等价于: pnpm run i18n translate

  pnpm run i18n translate [add|delete|generate|apply]
    翻译 key 管理与同步检查

  pnpm run i18n prune [--write] [--force] [--keep=...] [--keep-prefix=...]
    检测并清理未使用翻译 key

Compatible aliases:

  pnpm run i18n:translate ...
  pnpm run i18n:prune ...
`);
}

async function main(): Promise<void> {
  const raw = process.argv.slice(2);
  const args = raw[0] === "--" ? raw.slice(1) : raw;

  if (args.length === 0) {
    await runTranslateCommand([]);
    return;
  }

  const [topCommand, ...rest] = args;

  if (topCommand === "--help" || topCommand === "-h" || topCommand === "help") {
    printMainUsage();
    return;
  }

  if (topCommand === "translate") {
    await runTranslateCommand(rest);
    return;
  }

  if (topCommand === "prune") {
    await runPruneCommand(rest);
    return;
  }

  if (topCommand === "changelog") {
    await runChangelogCommand(rest);
    return;
  }

  // Legacy compatibility for alias script: pnpm run i18n:translate add ...
  if (["add", "delete", "generate", "apply"].includes(topCommand)) {
    await runTranslateCommand(args);
    return;
  }

  console.error(`Error: 未知命令 "${topCommand}"`);
  printMainUsage();
  process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
