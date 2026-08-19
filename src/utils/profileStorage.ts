import type { CalcParams } from "../types/calc";
import type { PowerGridProfile, ProfilesStorageState } from "../types/profile";
import { DEFAULT_PARAMS } from "./defaultParams";

export const PROFILES_STORAGE_KEY = "dige_grid_profiles_v1";
export const PROFILES_STORAGE_VERSION = 1;

const PRESET_TS = 1724000000000;

/** 内置预设：四号谷地（5800W 参数）/ 武陵（7300W 参数）；显示名仅地区 */
export const INITIAL_PRESET_PROFILES: PowerGridProfile[] = [
  {
    id: "preset_valley",
    name: "四号谷地",
    createdAt: PRESET_TS,
    updatedAt: PRESET_TS,
    params: {
      ...DEFAULT_PARAMS,
      targetPower: 5800,
      primaryFuelId: "valleyHigh",
      secondaryFuelId: "none",
      factoryRegion: "valley",
    },
  },
  {
    id: "preset_wuling",
    name: "武陵",
    createdAt: PRESET_TS,
    updatedAt: PRESET_TS,
    params: {
      ...DEFAULT_PARAMS,
      targetPower: 7300,
      primaryFuelId: "wulingMid",
      secondaryFuelId: "valleyHigh",
      factoryRegion: "wuling",
    },
  },
];

function createDefaultState(): ProfilesStorageState {
  return {
    version: PROFILES_STORAGE_VERSION,
    activeProfileId: INITIAL_PRESET_PROFILES[0].id,
    profiles: INITIAL_PRESET_PROFILES.map((p) => ({
      ...p,
      params: { ...p.params },
    })),
  };
}

function normalizeParams(raw: unknown): CalcParams {
  const base =
    raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return { ...DEFAULT_PARAMS, ...base } as CalcParams;
}

/** 旧版预设名「地区 - 功率」→ 仅地区 */
const LEGACY_PRESET_NAMES: Record<string, string> = {
  "四号谷地 - 5800W": "四号谷地",
  "武陵 - 7300W": "武陵",
};

function migrateLegacyPresetName(profile: PowerGridProfile): PowerGridProfile {
  const nextName = LEGACY_PRESET_NAMES[profile.name];
  if (!nextName || nextName === profile.name) return profile;
  return { ...profile, name: nextName };
}

function normalizeProfile(raw: unknown): PowerGridProfile | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const id = typeof o.id === "string" && o.id ? o.id : null;
  const name = typeof o.name === "string" ? o.name.trim() : "";
  if (!id || !name) return null;
  const createdAt =
    typeof o.createdAt === "number" && Number.isFinite(o.createdAt)
      ? o.createdAt
      : Date.now();
  const updatedAt =
    typeof o.updatedAt === "number" && Number.isFinite(o.updatedAt)
      ? o.updatedAt
      : createdAt;
  return {
    id,
    name: name.slice(0, 32),
    createdAt,
    updatedAt,
    params: normalizeParams(o.params),
  };
}

export function loadProfilesStorage(): ProfilesStorageState {
  if (typeof window === "undefined" || !window.localStorage) {
    return createDefaultState();
  }
  try {
    const raw = window.localStorage.getItem(PROFILES_STORAGE_KEY);
    if (!raw) return createDefaultState();
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return createDefaultState();
    const root = parsed as Record<string, unknown>;
    const list = Array.isArray(root.profiles) ? root.profiles : [];
    const before = list
      .map(normalizeProfile)
      .filter((p): p is PowerGridProfile => p !== null);
    const profiles = before.map(migrateLegacyPresetName);
    if (profiles.length === 0) return createDefaultState();

    let activeProfileId =
      typeof root.activeProfileId === "string" ? root.activeProfileId : "";
    if (!profiles.some((p) => p.id === activeProfileId)) {
      activeProfileId = profiles[0].id;
    }

    const state: ProfilesStorageState = {
      version: PROFILES_STORAGE_VERSION,
      activeProfileId,
      profiles,
    };
    const renamed = profiles.some((p, i) => p.name !== before[i]?.name);
    if (renamed) saveProfilesStorage(state);
    return state;
  } catch {
    return createDefaultState();
  }
}

export function saveProfilesStorage(state: ProfilesStorageState): void {
  if (typeof window === "undefined" || !window.localStorage) return;
  try {
    const payload: ProfilesStorageState = {
      version: PROFILES_STORAGE_VERSION,
      activeProfileId: state.activeProfileId,
      profiles: state.profiles.map((p) => ({
        ...p,
        name: p.name.slice(0, 32),
        params: normalizeParams(p.params),
      })),
    };
    if (!payload.profiles.some((p) => p.id === payload.activeProfileId)) {
      payload.activeProfileId = payload.profiles[0]?.id ?? "";
    }
    window.localStorage.setItem(PROFILES_STORAGE_KEY, JSON.stringify(payload));
  } catch (error) {
    console.error("Failed to save profiles:", error);
  }
}

export function createProfileId(): string {
  return `prof_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
}

export function getActiveProfile(
  state: ProfilesStorageState
): PowerGridProfile | undefined {
  return (
    state.profiles.find((p) => p.id === state.activeProfileId) ??
    state.profiles[0]
  );
}
