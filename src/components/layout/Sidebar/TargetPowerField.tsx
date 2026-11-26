import { useI18n } from "../../../i18n";
import { PARAM_LIMITS } from "../../../utils/constants";
import Icon from "../../ui/Icon";
import SidebarSection from "./SidebarSection";

export interface TargetPowerFieldProps {
  value: number;
  onChange: (v: number) => void;
  onCalculate?: () => void;
  onRandom: () => void;
}

export default function TargetPowerField({
  value,
  onChange,
  onCalculate,
  onRandom,
}: TargetPowerFieldProps) {
  const { t } = useI18n();

  return (
    <SidebarSection
      icon="target"
      title={t("targetPower")}
      className="space-y-4"
    >
      <div className="space-y-2">
        <div className="flex justify-between">
          <label
            htmlFor="target-power-input"
            className="text-sm text-endfield-text"
          >
            {t("power")} (w)
          </label>
          <span className="text-sm text-endfield-yellow" aria-live="polite">
            {value}
          </span>
        </div>
        <div className="flex gap-2">
          <input
            id="target-power-input"
            type="number"
            min="0"
            max={PARAM_LIMITS.MAX_TARGET_POWER}
            value={value}
            onChange={(e) => onChange(parseInt(e.target.value, 10) || 0)}
            onKeyDown={(e) => e.key === "Enter" && onCalculate?.()}
            className="flex-1 bg-endfield-gray border border-endfield-gray-light px-3 py-2 text-sm text-endfield-text-light focus:border-endfield-yellow focus:outline-none"
            aria-describedby="target-power-desc"
          />
          <button
            type="button"
            onClick={onRandom}
            className="w-10 h-10 bg-endfield-gray border border-endfield-gray-light hover:border-endfield-yellow transition-colors flex items-center justify-center text-endfield-text-light hover:text-endfield-yellow shrink-0"
            title={t("random")}
            aria-label={t("random")}
          >
            <Icon name="casino" />
          </button>
        </div>
      </div>
    </SidebarSection>
  );
}
