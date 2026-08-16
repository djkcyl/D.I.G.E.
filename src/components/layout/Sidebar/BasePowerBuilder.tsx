import { useMemo } from "react";
import { useI18n } from "../../../i18n";
import type { CalcParams, ManualBaseLine } from "../../../types/calc";
import type { Fuel } from "../../../utils/constants";
import {
  CONSTANTS,
  FUEL_OPTIONS,
  resolveFuel,
} from "../../../utils/constants";
import Icon from "../../ui/Icon";
import type { SelectOption } from "../../ui/Select";
import Select from "../../ui/Select";
import Toggle from "../../ui/Toggle";
import SidebarSection from "./SidebarSection";

export interface BasePowerBuilderProps {
  params: CalcParams;
  onChange: (key: keyof CalcParams | string, value: unknown) => void;
  locale: string;
}

let lineSeq = 0;
const nextLineId = () => {
  lineSeq += 1;
  return `mbl_${Date.now().toString(36)}_${lineSeq}`;
};

export default function BasePowerBuilder({
  params,
  onChange,
  locale,
}: BasePowerBuilderProps) {
  const { t } = useI18n();

  const lines = Array.isArray(params.manualBaseLines)
    ? params.manualBaseLines
    : [];

  // undefined = 旧默认 floor → UI 视为开启；仅显式 false 为关闭
  const autoPlanChecked = params.autoPlanBasePools !== false;

  const getFuelName = (fuel: { name?: Fuel["name"] } | undefined) =>
    fuel?.name?.[locale] || fuel?.name?.en || "";

  const fuelOptions = useMemo(
    () =>
      FUEL_OPTIONS.map((f) => ({
        value: f.id,
        label: getFuelName(f),
        ...f,
      })),
    // locale drives labels
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [locale]
  );

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

  const setLines = (next: ManualBaseLine[]) => {
    onChange("manualBaseLines", next);
  };

  const updateLine = (id: string, patch: Partial<ManualBaseLine>) => {
    setLines(
      lines.map((line) => (line.id === id ? { ...line, ...patch } : line))
    );
  };

  const removeLine = (id: string) => {
    setLines(lines.filter((line) => line.id !== id));
  };

  const addLine = () => {
    const defaultFuelId = params.primaryFuelId || FUEL_OPTIONS[0]?.id || "ore";
    setLines([
      ...lines,
      {
        id: nextLineId(),
        fuelId: defaultFuelId,
        count: 1,
      },
    ]);
  };

  const corePower = CONSTANTS.BASE_POWER ?? 200;

  const manualPower = lines.reduce((sum, line) => {
    const fuel = resolveFuel(line.fuelId, params.fuelOverrides);
    const count = Math.max(0, Math.floor(Number(line.count) || 0));
    return sum + (fuel ? fuel.power * count : 0);
  }, 0);

  return (
    <SidebarSection
      icon="bolt"
      title={t("basePowerBuilder")}
      className="space-y-3"
    >
      <div className="flex justify-between text-sm text-endfield-text">
        <span>{t("baseCorePower")}</span>
        <span className="text-endfield-text-light font-semibold">
          {corePower} w
        </span>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm text-endfield-text">
            {t("manualBaseLines")}
          </span>
          <button
            type="button"
            onClick={addLine}
            className="text-xs px-2 py-1 border border-endfield-gray-light text-endfield-text-light hover:border-endfield-yellow hover:text-endfield-yellow transition-colors"
          >
            + {t("addBaseLine")}
          </button>
        </div>

        {lines.length === 0 ? (
          <p className="text-xs text-endfield-text/50">{t("manualBaseLinesEmpty")}</p>
        ) : (
          <ul className="space-y-2">
            {lines.map((line) => {
              const fuel = resolveFuel(line.fuelId, params.fuelOverrides);
              const count = Math.max(0, Math.floor(Number(line.count) || 0));
              const linePower = fuel ? fuel.power * count : 0;
              return (
                <li
                  key={line.id}
                  className="flex flex-col gap-1.5 p-2 border border-endfield-gray-light/80 bg-endfield-dark/40"
                >
                  <div className="flex items-center gap-2">
                    <div className="flex-1 min-w-0">
                      <Select
                        id={`base-line-fuel-${line.id}`}
                        value={line.fuelId}
                        options={fuelOptions}
                        onChange={(opt) =>
                          updateLine(line.id, { fuelId: opt.value })
                        }
                        renderOption={renderFuelOption}
                        ariaLabel={t("manualBaseFuel")}
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => removeLine(line.id)}
                      className="w-8 h-8 shrink-0 inline-flex items-center justify-center text-endfield-text/50 hover:text-red-400 transition-colors"
                      title={t("removeBaseLine")}
                      aria-label={t("removeBaseLine")}
                    >
                      <Icon name="close" className="!w-4 !h-4" />
                    </button>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <label className="flex items-center gap-2 text-sm text-endfield-text">
                      <span className="shrink-0">{t("basePoolCount")}</span>
                      <input
                        type="number"
                        min={0}
                        step={1}
                        value={Number.isFinite(line.count) ? line.count : 0}
                        onChange={(e) => {
                          const raw = Number(e.target.value);
                          updateLine(line.id, {
                            count: Number.isFinite(raw)
                              ? Math.max(0, Math.floor(raw))
                              : 0,
                          });
                        }}
                        className="w-16 bg-endfield-gray border border-endfield-gray-light px-2 py-1 text-endfield-text-light text-sm"
                      />
                    </label>
                    <span className="text-xs text-endfield-yellow">
                      {linePower} w
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {manualPower > 0 && (
          <div className="flex justify-between text-xs text-endfield-text/70">
            <span>{t("manualBasePowerSum")}</span>
            <span className="text-endfield-text-light">{manualPower} w</span>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between gap-2 pt-1">
        <div className="flex flex-col gap-0.5 min-w-0">
          <span className="text-sm text-endfield-text">
            {t("autoPlanBasePools")}
          </span>
          <span className="text-xs text-endfield-text/50 leading-snug">
            {t("autoPlanBasePoolsHint")}
          </span>
        </div>
        <Toggle
          checked={autoPlanChecked}
          onChange={(checked) => onChange("autoPlanBasePools", checked)}
          ariaLabel={t("autoPlanBasePools")}
        />
      </div>
    </SidebarSection>
  );
}
