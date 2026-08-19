/**
 * Grid Code (方案 B：全粘连电网蓝图码)
 * DIGE + region(1) + power(1-5 digits) + primary(2) + secondary(2) + mode(1) + Base52 payload
 * 权威数据：payload（encodeShareParams）；人读头仅展示与粗校验。
 */
import { PARAM_LIMITS } from "./constants";
import {
  decodeShareParams,
  encodeShareParams,
  SHARE_PARAM_KEY,
  type ShareParams,
} from "./shareParams";

export const GRID_CODE_MAGIC = "DIGE";

/** 地区短码 */
export const REGION_TO_CODE = {
  valley: "V",
  wuling: "W",
  free: "F",
} as const;

export const CODE_TO_REGION: Record<string, "valley" | "wuling" | "free"> = {
  V: "valley",
  W: "wuling",
  F: "free",
};

/** 燃料短码（主/副；副可为 NO） */
export const FUEL_TO_CODE: Record<string, string> = {
  ore: "OR",
  valleyLow: "VL",
  valleyMid: "VM",
  valleyHigh: "VH",
  wulingLow: "WL",
  wulingMid: "WM",
  customPrimary: "CP",
  customSecondary: "CS",
  none: "NO",
};

export const CODE_TO_FUEL: Record<string, string> = Object.fromEntries(
  Object.entries(FUEL_TO_CODE).map(([id, code]) => [code, id])
);

/** 多燃料模式 1 字母 */
export const MODE_TO_CODE = {
  auto: "A",
  legacy: "L",
  mixed: "M",
  primaryOnly: "P",
  secondaryOnly: "S",
} as const;

export const CODE_TO_MODE: Record<
  string,
  "auto" | "legacy" | "mixed" | "primaryOnly" | "secondaryOnly"
> = {
  A: "auto",
  L: "legacy",
  M: "mixed",
  P: "primaryOnly",
  S: "secondaryOnly",
};

const GRID_CODE_RE =
  /^DIGE([VWF])(\d{1,5})([A-Z]{2})([A-Z]{2})([ALMPS])([A-Za-z]+)$/;

export type ImportKind = "grid" | "url" | "token";

export interface GridCodeParseResult {
  kind: "grid";
  params: ShareParams;
  /** 人读头与 payload 重算头不一致 */
  prefixMismatch: boolean;
  /** 载荷真实功率（用于提示） */
  actualPower?: number;
  /** 码内声明功率 */
  declaredPower?: number;
  code: string;
}

export interface TokenParseResult {
  kind: "token" | "url";
  params: ShareParams;
  prefixMismatch: false;
  code?: string;
}

export type ImportParseResult = GridCodeParseResult | TokenParseResult;

/** 去掉空白、零宽、包裹引号 */
export function normalizeImportText(raw: string): string {
  if (!raw || typeof raw !== "string") return "";
  let s = raw.trim();
  // 零宽 / BOM
  s = s.replace(/[\u200B-\u200D\uFEFF]/g, "");
  // 全角 DIGE 等少见情况：去掉所有 Unicode 空白
  s = s.replace(/\s+/g, "");
  // 首尾引号
  if (
    (s.startsWith('"') && s.endsWith('"')) ||
    (s.startsWith("'") && s.endsWith("'"))
  ) {
    s = s.slice(1, -1).trim();
  }
  return s;
}

function resolveRegionCode(params: ShareParams): string {
  const r = params.factoryRegion;
  if (r === "valley" || r === "wuling" || r === "free") {
    return REGION_TO_CODE[r];
  }
  return REGION_TO_CODE.free;
}

function resolveFuelCode(fuelId: unknown, fallback: string): string {
  if (typeof fuelId === "string" && fuelId && FUEL_TO_CODE[fuelId]) {
    return FUEL_TO_CODE[fuelId];
  }
  return fallback;
}

function resolveModeCode(params: ShareParams): string {
  const m = params.multiFuelMode;
  if (m && m in MODE_TO_CODE) {
    return MODE_TO_CODE[m as keyof typeof MODE_TO_CODE];
  }
  return MODE_TO_CODE.auto;
}

function clampPowerForHead(power: unknown): number {
  const n = Math.round(Number(power));
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(n, PARAM_LIMITS.MAX_TARGET_POWER);
}

/** 仅人读头（含 DIGE，无 payload） */
export function buildGridCodeHead(params: ShareParams): string | null {
  if (!params) return null;
  const power = clampPowerForHead(params.targetPower);
  const region = resolveRegionCode(params);
  const primary = resolveFuelCode(params.primaryFuelId, "WM");
  const secondary = resolveFuelCode(
    params.secondaryFuelId ?? "none",
    "NO"
  );
  const mode = resolveModeCode(params);
  return `${GRID_CODE_MAGIC}${region}${power}${primary}${secondary}${mode}`;
}

/** 方案 B 全粘连：DIGE… + Base52 payload */
export function buildGridCode(params: ShareParams | null): string | null {
  if (!params) return null;
  const head = buildGridCodeHead(params);
  const payload = encodeShareParams(params);
  if (!head || !payload) return null;
  return `${head}${payload}`;
}

function headFromDecodedParams(params: ShareParams): string | null {
  return buildGridCodeHead(params);
}

/** 解析方案 B 电网码；payload 权威 */
export function parseGridCode(raw: string): GridCodeParseResult | null {
  const s = normalizeImportText(raw);
  if (!s) return null;

  const m = GRID_CODE_RE.exec(s);
  if (!m) return null;

  const [, regionCode, powerStr, primaryCode, secondaryCode, modeCode, payload] =
    m;

  const params = decodeShareParams(payload);
  if (!params) return null;

  const declaredHead = `${GRID_CODE_MAGIC}${regionCode}${powerStr}${primaryCode}${secondaryCode}${modeCode}`;
  const expectedHead = headFromDecodedParams(params);
  const prefixMismatch = Boolean(expectedHead && expectedHead !== declaredHead);

  const actualPower =
    typeof params.targetPower === "number" && Number.isFinite(params.targetPower)
      ? params.targetPower
      : undefined;
  const declaredPower = Number(powerStr);

  return {
    kind: "grid",
    params,
    prefixMismatch,
    actualPower,
    declaredPower: Number.isFinite(declaredPower) ? declaredPower : undefined,
    code: s,
  };
}

function tryExtractTokenFromUrl(text: string): string | null {
  const s = text.trim();
  try {
    // 绝对 URL
    if (/^https?:\/\//i.test(s) || s.includes("?") || s.includes(`${SHARE_PARAM_KEY}=`)) {
      let url: URL | null = null;
      try {
        url = new URL(s);
      } catch {
        // 相对或残缺：手动抽 p=
        const match = /[?&#](?:p)=([A-Za-z]+)/.exec(s);
        if (match) return match[1];
        // p= 在串中
        const m2 = /(?:^|[?&#])p=([A-Za-z]+)/.exec(s);
        return m2 ? m2[1] : null;
      }
      const token = url.searchParams.get(SHARE_PARAM_KEY);
      return token && /^[A-Za-z]+$/.test(token) ? token : null;
    }
  } catch {
    /* ignore */
  }
  return null;
}

/**
 * 万能导入识别：Grid Code B → URL/?p= → 裸 Base52 token
 */
export function parseImportInput(raw: string): ImportParseResult | null {
  if (!raw || typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  // 1) 先尝试去空白后的 Grid Code（允许用户粘贴带空格的展示形）
  const compact = normalizeImportText(trimmed);
  if (compact.toUpperCase().startsWith(GRID_CODE_MAGIC)) {
    // 载荷大小写敏感：normalize 只去空白，不改字母大小写
    const grid = parseGridCode(compact);
    if (grid) return grid;
  }

  // 2) URL / query
  const fromUrl = tryExtractTokenFromUrl(trimmed);
  if (fromUrl) {
    const params = decodeShareParams(fromUrl);
    if (params) {
      return { kind: "url", params, prefixMismatch: false, code: fromUrl };
    }
  }

  // 3) 裸 token（仅字母）
  const tokenCandidate = compact.replace(/[^A-Za-z]/g, "");
  // 若整段就是 Base52
  if (/^[A-Za-z]+$/.test(compact) && !compact.toUpperCase().startsWith(GRID_CODE_MAGIC)) {
    const params = decodeShareParams(compact);
    if (params) {
      return { kind: "token", params, prefixMismatch: false, code: compact };
    }
  } else if (tokenCandidate && tokenCandidate !== compact) {
    const params = decodeShareParams(tokenCandidate);
    if (params) {
      return { kind: "token", params, prefixMismatch: false, code: tokenCandidate };
    }
  }

  return null;
}

/** 默认导入存档名：地区标签 + 功率 + 后缀由调用方 i18n */
export function suggestImportProfileBaseName(params: ShareParams): string {
  const region = params.factoryRegion;
  let regionLabel = "Free";
  if (region === "valley") regionLabel = "Valley";
  else if (region === "wuling") regionLabel = "Wuling";
  else if (region === "free") regionLabel = "Free";

  const power = clampPowerForHead(params.targetPower);
  return `${regionLabel} - ${power}W`;
}

/** 中文默认名（App 可用 locale 分支） */
export function suggestImportProfileBaseNameZh(params: ShareParams): string {
  const region = params.factoryRegion;
  let regionLabel = "自由建造";
  if (region === "valley") regionLabel = "四号谷地";
  else if (region === "wuling") regionLabel = "武陵";

  const power = clampPowerForHead(params.targetPower);
  return `${regionLabel} - ${power}W`;
}
