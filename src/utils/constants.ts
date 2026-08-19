// 燃料类型配置
export interface FuelName {
  en: string;
  zh: string;
  ja: string;
  ko: string;
  ru: string;
  fr: string;
  de: string;
  id: string;
  [key: string]: string;
}

export interface Fuel {
  id: string;
  name: FuelName;
  power: number;
  burnTime: number;
  image: string;
}

const CUSTOM_FUEL_BASE = {
  name: {
    en: "Custom Fuel",
    zh: "自定义燃料",
    ja: "カスタム燃料",
    ko: "사용자 지정 연료",
    ru: "Своё топливо",
    fr: "Carburant perso.",
    de: "Eigener Brennstoff",
    id: "Bahan Bakar Kustom",
  },
  power: 100,
  burnTime: 10,
  image: "",
};

export const FUELS: Record<string, Fuel> = {
  ore: {
    id: "ore",
    name: {
      en: "Originium Ore",
      zh: "源矿",
      ja: "源石鉱物",
      ko: "오리지늄광물",
      ru: "Ориджиниевая руда",
      fr: "Minerai d'Originium",
      de: "Originium-Erz",
      id: "Bijih Originium",
    },
    power: 50, // w
    burnTime: 8, // s
    image: "/fuels/ore.webp",
  },
  valleyLow: {
    id: "valleyLow",
    name: {
      en: "LC Valley Battery",
      zh: "低容谷地电池",
      ja: "小容量谷地バッテリー",
      ko: "소용량협곡배터리",
      ru: "Батарея МЕ Долины",
      fr: "Batterie Vallée (faible)",
      de: "NK Tal-Batterie",
      id: "Baterai KR Lembah",
    },
    power: 220,
    burnTime: 40,
    image: "/fuels/valleyLow.webp",
  },
  valleyMid: {
    id: "valleyMid",
    name: {
      en: "SC Valley Battery",
      zh: "中容谷地电池",
      ja: "中容量谷地バッテリー",
      ko: "중용량협곡배터리",
      ru: "Батарея СЕ Долины",
      fr: "Batterie Vallée (moy.)",
      de: "SK Tal-Batterie",
      id: "Baterai KS Lembah",
    },
    power: 420,
    burnTime: 40,
    image: "/fuels/valleyMid.webp",
  },
  valleyHigh: {
    id: "valleyHigh",
    name: {
      en: "HC Valley Battery",
      zh: "高容谷地电池",
      ja: "大容量谷地バッテリー",
      ko: "대용량협곡배터리",
      ru: "Батарея ВЕ Долины",
      fr: "Batterie Vallée (haute)",
      de: "HK Tal-Batterie",
      id: "Baterai KT Lembah",
    },
    power: 1100,
    burnTime: 40,
    image: "/fuels/valleyHigh.webp",
  },
  wulingLow: {
    id: "wulingLow",
    name: {
      en: "LC Wuling Battery",
      zh: "低容武陵电池",
      ja: "小容量武陵バッテリー",
      ko: "저용량무릉배터리",
      ru: "Батарея МЕ Улина",
      fr: "Batterie Wuling (faible)",
      de: "NK Wuling-Batterie",
      id: "Baterai KR Wuling",
    },
    power: 1600,
    burnTime: 40,
    image: "/fuels/wulingLow.webp",
  },
  wulingMid: {
    id: "wulingMid",
    name: {
      en: "SC Wuling Battery",
      zh: "中容武陵电池",
      ja: "中容量武陵バッテリー",
      ko: "중용량무릉배터리",
      ru: "Батарея СЕ Улина",
      fr: "Batterie Wuling (moy.)",
      de: "SK Wuling-Batterie",
      id: "Baterai KS Wuling",
    },
    power: 3200,
    burnTime: 40,
    image: "/fuels/wulingMid.webp",
  },
  customPrimary: {
    id: "customPrimary",
    ...CUSTOM_FUEL_BASE,
  },
  customSecondary: {
    id: "customSecondary",
    ...CUSTOM_FUEL_BASE,
  },
};

// 根据覆盖值解析燃料
export function resolveFuel(
  fuelId: string,
  overrides?: Record<string, { power?: number; burnTime?: number }>
): Fuel | undefined {
  const base = FUELS[fuelId];
  if (!base) return undefined;
  const ov = overrides?.[fuelId];
  if (!ov) return base;
  return {
    ...base,
    power: ov.power ?? base.power,
    burnTime: ov.burnTime ?? base.burnTime,
  };
}

export function isCustomFuel(fuelId: string): boolean {
  return fuelId === "customPrimary" || fuelId === "customSecondary";
}

// 燃料选项列表（用于下拉菜单）
export const FUEL_OPTIONS = Object.values(FUELS).filter(
  (f) => f.id !== "customSecondary"
);

// 副燃料选项（包含"无"）
// 显式标注 name: FuelName，避免字面量推断导致 name[locale:string] 类型错误
export const SECONDARY_FUEL_OPTIONS: Array<
  | Fuel
  | {
      id: string;
      name: FuelName;
      power: number;
      burnTime: number;
      image?: string;
    }
> = [
  {
    id: "none",
    name: {
      en: "None",
      zh: "无",
      ja: "なし",
      ko: "없음",
      ru: "Нет",
      fr: "Aucun",
      de: "Keiner",
      id: "Kosong",
    },
    power: 0,
    burnTime: 0,
  },
  ...Object.values(FUELS).filter((f) => f.id !== "customPrimary"),
];

// 参数范围限制（用于 UI 滑块、分享编码等）
export const PARAM_LIMITS = {
  MAX_TARGET_POWER: 32767,
  MAX_BURN_TIME: 511,
  MAX_MAX_WASTE: 4095,
  MAX_BATTERY_PERCENT: 100,
  MIN_BRANCHES: 1,
  MAX_BRANCHES: 3,
  MIN_PHASE_OFFSET_CELLS: 0,
  MAX_PHASE_OFFSET_CELLS: 16,
} as const;

// 系统常量
export const CONSTANTS = {
  BASE_POWER: 200, // 基地自带发电功率 (w)
  BELT_SPEED: 0.5, // 传送带速度 (个/s)
  BELT_INTERVAL: 2, // 传送带间隔 (s) = 1/BELT_SPEED
  BATTERY_CAPACITY: 100000, // 默认蓄电池容量 (J)
} as const;

// 计算满带发电功率
// 满带时，发电机持续工作，输出功率 = 燃料发电功率
export function getFullBeltPower(fuel: Fuel): number {
  return fuel.power;
}

// 计算分流后的平均发电功率
// 分流后输入间隔 = 基础间隔 * 分母
// 如果输入间隔 <= 燃烧时间，发电机满载
// 如果输入间隔 > 燃烧时间，平均功率 = 燃料功率 * 燃烧时间 / 输入间隔
export function getOscillatingPower(
  fuel: Fuel,
  denominator: number,
  baseInterval: number = CONSTANTS.BELT_INTERVAL
): number {
  const inputInterval = baseInterval * denominator;
  if (inputInterval <= fuel.burnTime) {
    return fuel.power;
  }
  return (fuel.power * fuel.burnTime) / inputInterval;
}

// 计算满带需要几个发电机来消耗一条传送带
// 每个发电机消耗速率 = 1/燃烧时间
// 传送带供应速率 = BELT_SPEED
// 发电机数量 = 传送带速率 / 消耗速率 = BELT_SPEED * 燃烧时间
export function getGeneratorsPerBelt(
  fuel: Fuel,
  inputSpeed: number = CONSTANTS.BELT_SPEED
): number {
  return inputSpeed * fuel.burnTime;
}

// 格式化时间为 HH:MM:SS
export function formatTime(seconds: number): string {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hrs > 0) {
    return `${hrs.toString().padStart(2, "0")}:${mins
      .toString()
      .padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  }
  return `${mins.toString().padStart(2, "0")}:${secs
    .toString()
    .padStart(2, "0")}`;
}

// 有效的分流分母（2和3的幂次组合）
export function generateValidDenominators(maxValue: number = 512): number[] {
  const denoms: number[] = [];
  for (let x = 0; x < 10; x++) {
    for (let y = 0; y < 7; y++) {
      const val = 2 ** x * 3 ** y;
      if (val > 1 && val <= maxValue) {
        denoms.push(val);
      }
    }
  }
  return denoms.sort((a, b) => a - b);
}

// 分析分流器复杂度
export function analyzeSplitterComplexity(denominator: number): {
  total: number;
  twoWay: number;
  threeWay: number;
} {
  let d = denominator;
  let c2 = 0,
    c3 = 0;
  while (d % 2 === 0) {
    c2++;
    d /= 2;
  }
  while (d % 3 === 0) {
    c3++;
    d /= 3;
  }

  return {
    total: c2 + c3,
    twoWay: c2,
    threeWay: c3,
  };
}

export const DEFAULT_INPUT_SOURCE_ID = "warehouse";

export interface InputSource {
  id: string;
  name: FuelName;
  speed: number;
  interval: number;
}

export const INPUT_SOURCES: Record<string, InputSource> = {
  warehouse: {
    id: "warehouse",
    name: {
      en: "Warehouse",
      zh: "仓库",
      ja: "倉庫",
      ko: "창고",
      ru: "Склад",
      fr: "Entrepôt",
      de: "Lager",
      id: "Gudang",
    },
    speed: CONSTANTS.BELT_SPEED,
    interval: CONSTANTS.BELT_INTERVAL,
  },
  packer: {
    id: "packer",
    name: {
      en: "Packaging Unit",
      zh: "封装机",
      ja: "包装機",
      ko: "포장기",
      ru: "Упаковщик",
      fr: "Unité d'emballage",
      de: "Verpackungseinheit",
      id: "Mesin Pengemas",
    },
    speed: 0.1,
    interval: 10,
  },
};
export const INPUT_SOURCE_OPTIONS = Object.values(INPUT_SOURCES);
