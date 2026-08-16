import { useState } from "react";
import { useI18n } from "../../../i18n";
import type { CalcParams } from "../../../types/calc";
import type { Fuel } from "../../../utils/constants";
import {
  FUEL_OPTIONS,
  isCustomFuel,
  resolveFuel,
  SECONDARY_FUEL_OPTIONS,
} from "../../../utils/constants";
import CustomFuelModal from "../../modals/CustomFuelModal";
import Icon from "../../ui/Icon";
import type { SelectOption } from "../../ui/Select";
import Select from "../../ui/Select";
import SidebarSection from "./SidebarSection";

export interface FuelConfigFieldProps {
  params: CalcParams;
  onChange: (key: keyof CalcParams | string, value: unknown) => void;
  locale: string;
}

export default function FuelConfigField({
  params,
  onChange,
  locale,
}: FuelConfigFieldProps) {
  const { t } = useI18n();
  const [customModalTarget, setCustomModalTarget] = useState<string | null>(
    null
  );

  const getFuelName = (fuel: { name?: Fuel["name"] } | undefined) =>
    fuel?.name?.[locale] || fuel?.name?.en || "";

  const primaryOptions = FUEL_OPTIONS.map((f) => ({
    value: f.id,
    label: getFuelName(f),
    ...f,
  }));
  const secondaryOptions = SECONDARY_FUEL_OPTIONS.map((f) => ({
    value: f.id,
    label: getFuelName(f),
    ...f,
  }));

  const renderFuelOption = (opt: SelectOption<string> & Partial<Fuel>) => (
    <>
      {opt.image && (
        <img
          src={opt.image}
          alt=""
          className="w-6 h-6 object-contain"
          aria-hidden="true"
        />
      )}
      <span>{opt.label ?? getFuelName(opt as { name?: Fuel["name"] })}</span>
    </>
  );

  const handleFuelChange = (key: string, fuelId: string) => {
    onChange(key, fuelId);
    if (isCustomFuel(fuelId)) {
      setCustomModalTarget(fuelId);
    }
  };

  const handleCustomConfirm = (power: number, burnTime: number) => {
    if (!customModalTarget) return;
    const prev = params.fuelOverrides || {};
    onChange("fuelOverrides", {
      ...prev,
      [customModalTarget]: { power, burnTime },
    });
  };

  const customModalValues = customModalTarget
    ? resolveFuel(customModalTarget, params.fuelOverrides)
    : null;

  const renderFuelInfo = (fuelId: string) => {
    const resolved = resolveFuel(fuelId, params.fuelOverrides);
    if (!resolved) return null;
    if (isCustomFuel(fuelId)) {
      return (
        <div className="flex items-center gap-2">
          <p className="text-sm text-endfield-text/70">
            {resolved.power}w / {resolved.burnTime}s
          </p>
          <button
            type="button"
            onClick={() => setCustomModalTarget(fuelId)}
            className="text-endfield-text/50 hover:text-endfield-text transition-colors"
            title={t("editFuelValues")}
          >
            <Icon name="edit" className="!w-4 !h-4" />
          </button>
        </div>
      );
    }
    return (
      <p className="text-sm text-endfield-text/70">
        {resolved.power}w / {resolved.burnTime}s
      </p>
    );
  };

  return (
    <SidebarSection
      icon="local_gas_station"
      title={t("fuelConfig")}
      className="space-y-4"
    >
      <div className="space-y-2">
        <label
          id="primary-fuel-label"
          htmlFor="primary-fuel-select"
          className="text-sm text-endfield-text"
        >
          {t("primaryFuel")}
        </label>
        <Select
          id="primary-fuel-select"
          value={params.primaryFuelId}
          options={primaryOptions}
          onChange={(opt) => handleFuelChange("primaryFuelId", opt.value)}
          renderOption={renderFuelOption}
          ariaLabelledby="primary-fuel-label"
        />
        {renderFuelInfo(params.primaryFuelId)}
      </div>

      <div className="space-y-2">
        <label
          id="secondary-fuel-label"
          htmlFor="secondary-fuel-select"
          className="text-sm text-endfield-text"
        >
          {t("secondaryFuelLabel")}
        </label>
        <Select
          id="secondary-fuel-select"
          value={params.secondaryFuelId}
          options={secondaryOptions}
          onChange={(opt) => handleFuelChange("secondaryFuelId", opt.value)}
          renderOption={renderFuelOption}
          ariaLabelledby="secondary-fuel-label"
        />
        {params.secondaryFuelId === "none" ? (
          <p className="text-sm text-endfield-text/50">
            {t("secondaryFuelHint")}
          </p>
        ) : (
          renderFuelInfo(params.secondaryFuelId)
        )}
      </div>

      {params.secondaryFuelId && params.secondaryFuelId !== "none" ? (
        <div className="space-y-2">
          <label
            id="multi-fuel-mode-label"
            htmlFor="multi-fuel-mode-select"
            className="text-sm text-endfield-text"
          >
            {t("multiFuelMode")}
          </label>
          <Select
            id="multi-fuel-mode-select"
            value={params.multiFuelMode ?? "auto"}
            options={[
              { value: "auto", label: t("multiFuelModeAuto") },
              { value: "legacy", label: t("multiFuelModeLegacy") },
              { value: "mixed", label: t("multiFuelModeMixed") },
              { value: "primaryOnly", label: t("multiFuelModePrimaryOnly") },
              {
                value: "secondaryOnly",
                label: t("multiFuelModeSecondaryOnly"),
              },
            ]}
            onChange={(opt) => onChange("multiFuelMode", opt.value)}
            ariaLabelledby="multi-fuel-mode-label"
          />
          <p className="text-sm text-endfield-text/50">
            {t("multiFuelModeHint")}
          </p>
        </div>
      ) : null}

      {customModalTarget && customModalValues && (
        <CustomFuelModal
          key={customModalTarget}
          show
          onClose={() => setCustomModalTarget(null)}
          currentValues={{
            power: customModalValues.power,
            burnTime: customModalValues.burnTime,
          }}
          onConfirm={handleCustomConfirm}
        />
      )}
    </SidebarSection>
  );
}
