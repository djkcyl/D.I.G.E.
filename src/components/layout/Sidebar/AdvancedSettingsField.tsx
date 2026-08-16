import { useState } from "react";
import { useI18n } from "../../../i18n";
import type { CalcParams } from "../../../types/calc";
import { PARAM_LIMITS } from "../../../utils/constants";
import CollapsibleSection from "../../ui/CollapsibleSection";
import RangeField from "../../ui/RangeField";

export interface AdvancedSettingsFieldProps {
  params: CalcParams;
  onChange: (key: keyof CalcParams | string, value: unknown) => void;
  onCalculate?: () => void;
}
/**
 * 高级约束与时序：maxWaste / 相位差
 * 默认折叠，折叠状态不进 URL。传送带排除开关在「其他设置」主区。
 */
export default function AdvancedSettingsField({
  params,
  onChange,
  onCalculate,
}: AdvancedSettingsFieldProps) {
  const { t } = useI18n();
  const [collapsed, setCollapsed] = useState(true);

  const visibleBranchCount = Math.max(
    PARAM_LIMITS.MIN_BRANCHES,
    Math.min(
      PARAM_LIMITS.MAX_BRANCHES,
      params.maxBranches ?? PARAM_LIMITS.MAX_BRANCHES
    )
  );

  const phaseOffsetBranchKeys = Array.from(
    { length: visibleBranchCount },
    (_, index) => `phaseOffsetBranch${index + 1}` as keyof CalcParams
  );

  return (
    <CollapsibleSection
      icon="tune"
      title={t("advancedSettingsTitle")}
      collapsed={collapsed}
      onToggle={() => setCollapsed((v) => !v)}
      expandLabel={t("expandSection")}
      collapseLabel={t("collapseSection")}
      className="space-y-0"
    >
      <div className="space-y-4">
        <div className="space-y-2">
          <div className="flex justify-between">
            <label
              htmlFor="max-waste-input"
              className="text-sm text-endfield-text"
            >
              {t("maxWaste")}
            </label>
            <span
              className="text-sm text-endfield-text-light"
              aria-live="polite"
            >
              {params.maxWaste} w
            </span>
          </div>
          <input
            id="max-waste-input"
            type="number"
            min="0"
            max={PARAM_LIMITS.MAX_MAX_WASTE}
            value={params.maxWaste}
            onChange={(e) =>
              onChange("maxWaste", parseInt(e.target.value, 10) || 0)
            }
            onKeyDown={(e) => e.key === "Enter" && onCalculate?.()}
            className="w-full bg-endfield-gray border border-endfield-gray-light px-3 py-2 text-sm text-endfield-text-light focus:border-endfield-yellow focus:outline-none"
          />
        </div>

        <div className="space-y-2">
          <div className="text-sm text-endfield-text">
            {t("branchPhaseOffset")}
          </div>
          <p className="text-xs text-endfield-text/70">
            {t("branchPhaseOffsetHint")}
          </p>
          <div className="space-y-3">
            {phaseOffsetBranchKeys.map((key, index) => {
              const val = params[key];
              const numVal = typeof val === "number" ? val : 0;
              return (
                <RangeField
                  key={key}
                  id={`phase-offset-branch-${index + 1}`}
                  label={`${t("branch")} ${index + 1}`}
                  value={numVal}
                  min={PARAM_LIMITS.MIN_PHASE_OFFSET_CELLS}
                  max={PARAM_LIMITS.MAX_PHASE_OFFSET_CELLS}
                  step={1}
                  onChange={(nextValue) =>
                    onChange(key as keyof CalcParams, nextValue)
                  }
                  ariaLabel={`${t("branch")} ${index + 1} ${t(
                    "branchPhaseOffset"
                  )}`}
                  rightSlot={
                    <span
                      className="text-sm text-endfield-text-light"
                      aria-live="polite"
                    >
                      {numVal}
                    </span>
                  }
                />
              );
            })}
          </div>
        </div>
      </div>
    </CollapsibleSection>
  );
}
