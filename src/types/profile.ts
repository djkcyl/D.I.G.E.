import type { CalcParams } from "./calc";

/** 单个电网存档 */
export interface PowerGridProfile {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  params: CalcParams;
}

/** localStorage 根结构（key: dige_grid_profiles_v1） */
export interface ProfilesStorageState {
  version: number;
  activeProfileId: string;
  profiles: PowerGridProfile[];
}

export type ProfileModalMode = "saveAs" | "rename";
