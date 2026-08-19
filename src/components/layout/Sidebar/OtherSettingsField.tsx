import { useI18n } from "../../../i18n";
import type { CalcParams, FactoryRegion } from "../../../types/calc";
import { normalizeFactoryRegion } from "../../../utils/regionLimiter";
import Icon from "../../ui/Icon";
import Select from "../../ui/Select";
import Toggle from "../../ui/Toggle";
import SidebarSection from "./SidebarSection";

export interface OtherSettingsFieldProps {
  params: CalcParams;
  onChange: (key: keyof CalcParams | string, value: unknown) => void;
  onShowItemGateLimiterHint?: () => void;
  onShowExcludeBeltWarning?: () => void;
}

/** 其他设置：建设地区 + 准入口限速开关 + 排除传送带 */
export default function OtherSettingsField({
  params,
  onChange,
  onShowItemGateLimiterHint,
  onShowExcludeBeltWarning,
}: OtherSettingsFieldProps) {
  const { t } = useI18n();
  // false/缺省=关=限速求解；true=开=忽略限速
  const excludeItemGateLimiter = Boolean(params.excludeItemGateLimiter);
  const excludeBelt = params.excludeBelt !== false;
  const factoryRegion: FactoryRegion = normalizeFactoryRegion(
    params.factoryRegion
  );

  return (
    <SidebarSection
      icon="settings"
      title={t("otherSettings")}
      className="space-y-2"
    >
      <div className="space-y-3">
        <div className="space-y-2">
          <label
            id="factory-region-label"
            htmlFor="factory-region-select"
            className="text-sm text-endfield-text"
          >
            {t("factoryRegion")}
          </label>
          <Select
            id="factory-region-select"
            value={factoryRegion}
            options={[
              { value: "free", label: t("factoryRegionFree") },
              { value: "valley", label: t("factoryRegionValley") },
              { value: "wuling", label: t("factoryRegionWuling") },
            ]}
            onChange={(opt) =>
              onChange("factoryRegion", opt.value as FactoryRegion)
            }
            ariaLabelledby="factory-region-label"
          />
          <p className="text-sm text-endfield-text/50">{t("factoryRegionHint")}</p>
        </div>

        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="text-sm text-endfield-text">
              {t("excludeItemGateLimiter")}
            </span>
            {onShowItemGateLimiterHint ? (
              <button
                type="button"
                onClick={onShowItemGateLimiterHint}
                className="w-5 h-5 inline-flex items-center justify-center leading-none text-endfield-text/50 hover:text-endfield-yellow transition-colors shrink-0"
                title={t("excludeItemGateLimiterHint")}
                aria-label={t("excludeItemGateLimiterHint")}
                aria-haspopup="dialog"
              >
                <Icon name="info" className="leading-none" />
              </button>
            ) : null}
          </div>
          <Toggle
            checked={excludeItemGateLimiter}
            onChange={(checked) => onChange("excludeItemGateLimiter", checked)}
            ariaLabel={t("excludeItemGateLimiter")}
          />
        </div>

        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="text-sm text-endfield-text">{t("excludeBelt")}</span>
            {onShowExcludeBeltWarning ? (
              <button
                type="button"
                onClick={onShowExcludeBeltWarning}
                className="w-5 h-5 inline-flex items-center justify-center leading-none text-endfield-text/50 hover:text-endfield-yellow transition-colors shrink-0"
                title={t("excludeBeltWarning")}
                aria-label={t("excludeBeltWarning")}
                aria-haspopup="dialog"
              >
                <Icon name="info" className="leading-none" />
              </button>
            ) : null}
          </div>
          <Toggle
            checked={excludeBelt}
            onChange={(checked) => onChange("excludeBelt", checked)}
            ariaLabel={t("excludeBelt")}
          />
        </div>
      </div>
    </SidebarSection>
  );
}
