import { useState } from "react";
import { GAME_CONFIG } from "../../../config/game";
import { useI18n } from "../../../i18n";
import type { CalcParams } from "../../../types/calc";
import type { Fuel } from "../../../utils/constants";
import { FUEL_OPTIONS_DISPLAY, resolveFuel } from "../../../utils/constants";
import {
  DEFAULT_DEVICE_LIMIT,
  poolPowerForRate,
  singleBranchRange,
} from "../../../utils/oscBudget";
import type { SelectOption } from "../../ui/Select";
import Select from "../../ui/Select";
import Toggle from "../../ui/Toggle";
import SidebarSection from "./SidebarSection";

export interface OscillationPoolFieldProps {
  params: CalcParams;
  onChange: (key: keyof CalcParams | string, value: unknown) => void;
  locale: string;
}

const INPUT_CLASS =
  "w-full bg-endfield-gray border border-endfield-gray-light px-2 py-1.5 text-sm text-endfield-text-light focus:border-endfield-yellow focus:outline-none";

function fmt(value: number, digits = 1): string {
  if (!Number.isFinite(value)) return "—";
  return Number.isInteger(value) ? String(value) : value.toFixed(digits);
}

const newPoolId = () =>
  `pool_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;

/**
 * 自定义震荡热能池：可定义任意多条。
 * 每条输入「每分钟投料上限」，程序折成「满速带 + 余量震荡」，
 * 功率从目标缺口里扣除；开关只控制是否参与计算，不清空配置。
 */
export default function OscillationPoolField({
  params,
  onChange,
  locale,
}: OscillationPoolFieldProps) {
  const { t } = useI18n();
  const pools = params.oscPools ?? [];
  const [activeId, setActiveId] = useState<string | null>(pools[0]?.id ?? null);

  const active = pools.find((pool) => pool.id === activeId) ?? pools[0] ?? null;
  const enabledCount = pools.filter(
    (pool) => pool.enabled !== false && pool.fuelId && pool.fuelId !== "none",
  ).length;
  const enabled = enabledCount > 0;

  const fuel =
    active?.fuelId && active.fuelId !== "none"
      ? resolveFuel(active.fuelId)
      : undefined;
  const getFuelName = (item: { name?: Fuel["name"] } | undefined) =>
    item?.name?.[locale] || item?.name?.en || "";

  const options = [
    { value: "none", label: t("oscPoolNone") },
    ...FUEL_OPTIONS_DISPLAY.filter((item) => !item.id.startsWith("custom")).map(
      (item) => ({
        value: item.id,
        label: getFuelName(item),
        ...item,
      }),
    ),
  ];

  const renderFuelOption = (opt: SelectOption<string> & Partial<Fuel>) => (
    <>
      {opt.image && (
        <img
          src={opt.image}
          alt=""
          className="w-5 h-5 object-contain"
          aria-hidden="true"
        />
      )}
      <span>{opt.label ?? getFuelName(opt as { name?: Fuel["name"] })}</span>
    </>
  );

  const deviceLimit = active?.deviceLimit ?? DEFAULT_DEVICE_LIMIT;
  const maxPerMin = active?.maxPerMin ?? 0;
  const range = fuel ? singleBranchRange(fuel, { deviceLimit }) : null;
  const rated = fuel
    ? poolPowerForRate(fuel, maxPerMin, { deviceLimit })
    : null;

  // 联合校验：同一种电池也出现在自定义常驻热能池里时提示合计用量（不阻断求解）
  const sharedFuelPerMin = (() => {
    if (!fuel || !(maxPerMin > 0)) return 0;
    const lines = (params.manualBaseLines ?? []).filter(
      (line) => line && line.fuelId === fuel.id,
    );
    if (lines.length === 0) return 0;
    const fullSpeed = fuel.burnTime > 0 ? 60 / fuel.burnTime : 0;
    const basePerMin = lines.reduce(
      (sum, line) => sum + Math.max(0, Number(line.count) || 0) * fullSpeed,
      0,
    );
    return basePerMin + maxPerMin;
  })();

  const commit = (next: typeof pools) => {
    onChange("oscPools", next);
    if (!next.some((pool) => pool.id === activeId)) {
      setActiveId(next[0]?.id ?? null);
    }
  };

  const updateActive = (patch: Partial<NonNullable<typeof active>>) => {
    if (!active) return;
    commit(
      pools.map((pool) =>
        pool.id === active.id ? { ...pool, ...patch } : pool,
      ),
    );
  };

  const addPool = () => {
    const pool = {
      id: newPoolId(),
      fuelId: "none",
      enabled: true,
      deviceLimit: DEFAULT_DEVICE_LIMIT,
    };
    commit([...pools, pool]);
    setActiveId(pool.id);
  };

  const removePool = (poolId: string) => {
    const target = pools.find((pool) => pool.id === poolId);
    if (!target) return;
    const isFirst = pools[0]?.id === poolId;
    if (isFirst) {
      // 第一条的 ×：关闭整个自定义震荡热能池，并把它复位成「无」
      const next = pools.map((pool, index) =>
        index === 0
          ? { ...pool, enabled: false, fuelId: "none", maxPerMin: undefined }
          : pool,
      );
      commit(next);
      setActiveId(next[0]?.id ?? null);
      return;
    }
    const next = pools.filter((pool) => pool.id !== poolId);
    commit(next);
    setActiveId(next[0]?.id ?? null);
  };

  const toggleEnabled = (next: boolean) => {
    if (pools.length === 0) {
      if (!next) return;
      const pool = {
        id: newPoolId(),
        fuelId: options.find((o) => o.value !== "none")?.value ?? "none",
        enabled: true,
        deviceLimit: DEFAULT_DEVICE_LIMIT,
      };
      commit([pool]);
      setActiveId(pool.id);
      return;
    }
    // 只切换启用状态，保留用户已配置的每一条
    commit(pools.map((pool) => ({ ...pool, enabled: next })));
  };

  return (
    <SidebarSection
      icon="insights"
      title={t("oscPool")}
      right={
        <Toggle
          checked={enabled}
          onChange={toggleEnabled}
          ariaLabel={t("oscPool")}
        />
      }
      className="space-y-3"
    >
      <div className="flex flex-wrap items-center gap-1">
        {pools.map((pool, index) => {
          const poolFuel =
            pool.fuelId !== "none" ? resolveFuel(pool.fuelId) : null;
          const label = poolFuel
            ? `${index + 1}. ${getFuelName(poolFuel)}`
            : `${index + 1}. ${t("oscPoolNone")}`;
          const isActive = pool.id === active?.id;
          const off = pool.enabled === false;
          return (
            <span key={pool.id} className="inline-flex items-stretch">
              <button
                type="button"
                onClick={() => setActiveId(pool.id)}
                className={`h-7 px-2 text-xs border transition-colors whitespace-nowrap ${
                  isActive
                    ? "border-endfield-yellow text-endfield-yellow bg-endfield-yellow/10"
                    : "border-endfield-gray-light text-endfield-text/70 hover:text-endfield-text"
                } ${off ? "opacity-50" : ""}`}
              >
                {label}
              </button>
              <button
                type="button"
                onClick={() => removePool(pool.id)}
                title={t("removeBaseLine")}
                className="h-7 w-6 -ml-px text-xs border border-endfield-gray-light text-endfield-text/50 hover:border-red-400 hover:text-red-400"
              >
                ×
              </button>
            </span>
          );
        })}
        <button
          type="button"
          onClick={addPool}
          title={t("addBaseLine")}
          className="h-7 w-7 text-xs border border-endfield-gray-light text-endfield-text/70 hover:border-endfield-yellow hover:text-endfield-yellow"
        >
          +
        </button>
      </div>

      {pools.length > GAME_CONFIG.share.poolSlots ? (
        <p className="text-xs text-endfield-yellow">
          {t("oscPoolShareSlotLimit", {
            max: GAME_CONFIG.share.poolSlots,
            total: pools.length,
          })}
        </p>
      ) : null}

      {active ? (
        <>
          <div className="space-y-1">
            <label
              htmlFor="osc-pool-fuel"
              className="text-sm text-endfield-text"
            >
              {t("oscPoolFuel")}
            </label>
            <Select
              id="osc-pool-fuel"
              value={active.fuelId || "none"}
              options={options}
              onChange={(opt) => {
                const nextFuel = opt.value;
                if (!enabled) {
                  // 池子关闭时选中电池：自动开启开关，并高亮第一条
                  const next = pools.map((pool, index) => ({
                    ...pool,
                    enabled: true,
                    fuelId: index === 0 ? nextFuel : pool.fuelId,
                  }));
                  commit(next);
                  setActiveId(next[0]?.id ?? null);
                  return;
                }
                updateActive({ fuelId: nextFuel, enabled: true });
              }}
              renderOption={renderFuelOption}
            />
          </div>

          {fuel && range ? (
            <>
              <div className="space-y-1">
                <label
                  htmlFor="osc-pool-device-limit"
                  className="text-sm text-endfield-text"
                >
                  {t("oscPoolDeviceLimit")}
                </label>
                <input
                  id="osc-pool-device-limit"
                  type="number"
                  min={1}
                  max={999}
                  value={deviceLimit}
                  onChange={(e) =>
                    updateActive({
                      deviceLimit: Math.max(1, Number(e.target.value) || 1),
                    })
                  }
                  className={INPUT_CLASS}
                />
              </div>

              <div className="space-y-1 text-xs text-endfield-text/70">
                <div className="flex justify-between">
                  <span>{t("oscPoolSingleMax")}</span>
                  <span className="text-endfield-text-light">
                    {fmt(range.maxWatt)} w
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>{t("oscPoolSingleMin")}</span>
                  <span className="text-endfield-text-light">
                    {range.minDenominator > 0
                      ? `${fmt(range.minWatt)} w（1/${range.minDenominator}）`
                      : t("oscPoolNoOsc")}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>{t("oscPoolBandRate")}</span>
                  <span className="text-endfield-text-light">
                    {fmt(fuel.burnTime > 0 ? 60 / fuel.burnTime : 0, 2)}
                    {t("itemPerMin")}
                  </span>
                </div>
              </div>

              <div className="space-y-1">
                <label
                  htmlFor="osc-pool-per-min"
                  className="text-sm text-endfield-text"
                >
                  {t("oscPoolPerMinLimit")}
                </label>
                <input
                  id="osc-pool-per-min"
                  type="number"
                  min={0}
                  step={0.01}
                  value={maxPerMin > 0 ? maxPerMin : ""}
                  onChange={(e) => {
                    const rate = Number(e.target.value);
                    updateActive({
                      maxPerMin:
                        Number.isFinite(rate) && rate > 0 ? rate : undefined,
                    });
                  }}
                  className={INPUT_CLASS}
                />
                {rated ? (
                  <div className="space-y-0.5 text-xs text-endfield-text/70">
                    <div className="flex justify-between">
                      <span>{t("oscPoolDerived")}</span>
                      <span className="text-endfield-text-light">
                        {fmt(rated.watt)} w · {rated.bands.generators}{" "}
                        {t("oscPoolGenerators")}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>{t("oscPoolMatch")}</span>
                      <span className="text-endfield-text-light">
                        {fmt(rated.deviceCost)} / {deviceLimit}
                      </span>
                    </div>
                    {rated.bands.generators > 0 ? (
                      <p className="text-endfield-text/60">
                        {t("oscPoolBandBreakdown", {
                          ports: rated.bands.ports,
                          splitters: rated.bands.splitters,
                          generators: rated.bands.generators,
                        })}
                      </p>
                    ) : null}
                    {sharedFuelPerMin > 0 ? (
                      <p className="text-endfield-yellow">
                        {t("oscPoolSharedFuel", {
                          rate: sharedFuelPerMin.toFixed(2),
                        })}
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </>
          ) : (
            <p className="text-xs text-endfield-text/50">
              {t("oscPoolOffHint")}
            </p>
          )}
        </>
      ) : (
        <p className="text-xs text-endfield-text/50">{t("oscPoolOffHint")}</p>
      )}
    </SidebarSection>
  );
}
