import { useRef, useState } from "react";
import { useI18n } from "../../../i18n";
import type { CalcParams } from "../../../types/calc";
import type { InputSource } from "../../../utils/constants";
import {
  DEFAULT_INPUT_SOURCE_ID,
  INPUT_SOURCES,
  PARAM_LIMITS,
} from "../../../utils/constants";
import CloseButton from "../../ui/CloseButton";
import ConstraintsField from "./ConstraintsField";
import FuelConfigField from "./FuelConfigField";
import InputSourceField from "./InputSourceField";
import OtherSettingsField from "./OtherSettingsField";
import SidebarFooter from "./SidebarFooter";
import TargetPowerField from "./TargetPowerField";
import WarningModal from "./WarningModal";

const clampNumber = (value: unknown, min: number, max: number): number => {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Number(value)));
};

export interface SidebarProps {
  params: CalcParams;
  setParams: React.Dispatch<React.SetStateAction<CalcParams>>;
  collapsed: boolean;
  onClose: () => void;
  onCalculate: () => void;
  onRandomCalculate: () => void;
  onOpenAnnouncement: (tab: string) => void;
  onOpenPrivacyPolicy: () => void;
  onOpenQA: () => void;
}
export default function Sidebar({
  params,
  setParams,
  collapsed,
  onClose,
  onCalculate,
  onRandomCalculate,
  onOpenAnnouncement,
  onOpenPrivacyPolicy,
  onOpenQA,
}: SidebarProps) {
  const { t, locale } = useI18n();
  const [showInputWarning, setShowInputWarning] = useState(false);
  const [showExcludeBeltWarning, setShowExcludeBeltWarning] = useState(false);
  const [showItemGateLimiterHint, setShowItemGateLimiterHint] = useState(false);
  const calcButtonRef = useRef<HTMLButtonElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const handleChange = (key: keyof CalcParams | string, value: unknown) => {
    if (key === "targetPower") {
      setParams((prev) => ({
        ...prev,
        [key]: clampNumber(value, 0, PARAM_LIMITS.MAX_TARGET_POWER),
      }));
      return;
    }
    if (key === "maxWaste") {
      setParams((prev) => ({
        ...prev,
        [key]: clampNumber(value, 0, PARAM_LIMITS.MAX_MAX_WASTE),
      }));
      return;
    }
    if (key === "maxBranches") {
      setParams((prev) => ({
        ...prev,
        [key]: clampNumber(
          value,
          PARAM_LIMITS.MIN_BRANCHES,
          PARAM_LIMITS.MAX_BRANCHES
        ),
      }));
      return;
    }
    if (/^phaseOffsetBranch\d+$/.test(String(key))) {
      setParams((prev) => ({
        ...prev,
        [key]: clampNumber(
          value,
          PARAM_LIMITS.MIN_PHASE_OFFSET_CELLS,
          PARAM_LIMITS.MAX_PHASE_OFFSET_CELLS
        ),
      }));
      return;
    }
    if (key === "minBatteryPercent") {
      setParams((prev) => ({ ...prev, [key]: clampNumber(value, 0, 100) }));
      return;
    }
    setParams((prev) => ({ ...prev, [key]: value }));
  };

  const inputSource =
    INPUT_SOURCES[params.inputSourceId || DEFAULT_INPUT_SOURCE_ID] ||
    INPUT_SOURCES[DEFAULT_INPUT_SOURCE_ID];
  const getInputSourceName = (source: InputSource | undefined) =>
    source?.name?.[locale] || source?.name?.en || "";

  return (
    <>
      <button
        type="button"
        aria-label={t("close")}
        className={`fixed inset-0 z-20 md:hidden bg-black/50 transition-opacity duration-300 w-full h-full ${
          collapsed
            ? "opacity-0 pointer-events-none"
            : "opacity-100 pointer-events-auto"
        }`}
        onClick={onClose}
      />
      <aside
        className={`
          w-80 sm:w-96
          bg-endfield-dark/95 md:bg-endfield-dark/80 
          border-r border-endfield-gray-light 
          overflow-hidden flex flex-col shrink-0 
          transition-all duration-300
          fixed md:relative inset-y-0 left-0 z-30 md:z-10
          ${
            collapsed
              ? "-translate-x-full md:-ml-96 pointer-events-none"
              : "translate-x-0 md:ml-0 pointer-events-auto"
          }
        `}
        aria-label={t("sidebarConfigPanel")}
        aria-hidden={collapsed}
      >
        <div className="md:hidden shrink-0 p-3 border-b border-endfield-gray-light flex items-center justify-between">
          <span className="text-sm font-bold text-endfield-text-light">
            {t("constraints")}
          </span>
          <CloseButton
            onClick={onClose}
            label={t("close")}
            sizeClass="w-8 h-8"
          />
        </div>

        <div
          ref={scrollContainerRef}
          className="flex-1 overflow-y-auto scrollbar-gutter-stable p-4 sm:p-6 flex flex-col gap-4 sm:gap-6"
        >
          <TargetPowerField
            value={params.targetPower}
            onChange={(v) => handleChange("targetPower", v)}
            onCalculate={onCalculate}
            onRandom={onRandomCalculate}
          />

          <div className="w-full shrink-0 border-t border-endfield-gray-light/90" />

          <ConstraintsField
            params={params}
            onChange={handleChange}
            onCalculate={onCalculate}
          />

          <div className="w-full shrink-0 border-t border-endfield-gray-light/90" />

          <FuelConfigField
            params={params}
            onChange={handleChange}
            locale={locale}
          />

          <div className="w-full shrink-0 border-t border-endfield-gray-light/90" />

          <InputSourceField
            params={params}
            onChange={handleChange}
            locale={locale}
            onShowInputWarning={() => setShowInputWarning(true)}
          />

          <div className="w-full shrink-0 border-t border-endfield-gray-light/90" />

          <OtherSettingsField
            params={params}
            onChange={handleChange}
            onShowExcludeBeltWarning={() => setShowExcludeBeltWarning(true)}
            onShowItemGateLimiterHint={() => setShowItemGateLimiterHint(true)}
          />

          <div className="w-full shrink-0 border-t border-endfield-gray-light/90" />

          <div className="space-y-2 text-sm text-endfield-text/70">
            <div className="flex justify-between">
              <span>{t("basePower")}:</span>
              <span className="text-endfield-text-light">200 w</span>
            </div>
            <div className="flex justify-between">
              <span>{t("inputSource")}:</span>
              <span className="text-endfield-text-light">
                {getInputSourceName(inputSource)}
              </span>
            </div>
            <div className="flex justify-between">
              <span>{t("inputSpeed")}:</span>
              <span className="text-endfield-text-light">
                {inputSource.speed.toFixed(inputSource.speed < 0.1 ? 3 : 2)}{" "}
                {t("itemPerSec")}
              </span>
            </div>
            <div className="flex justify-between">
              <span>{t("batteryCapacity")}:</span>
              <span className="text-endfield-text-light">100,000 J</span>
            </div>
          </div>

          <SidebarFooter
            collapsed={collapsed}
            onCalculate={onCalculate}
            onOpenAnnouncement={onOpenAnnouncement}
            onOpenPrivacyPolicy={onOpenPrivacyPolicy}
            onOpenQA={onOpenQA}
            onClose={onClose}
            locale={locale}
            calcButtonRef={calcButtonRef}
            scrollContainerRef={scrollContainerRef}
          />
        </div>
      </aside>

      <WarningModal
        show={showInputWarning}
        message={t("inputWarningPacker")}
        closeOnBackdrop={false}
        onClose={() => setShowInputWarning(false)}
      />
      <WarningModal
        show={showExcludeBeltWarning}
        message={t("excludeBeltWarning")}
        closeOnBackdrop={false}
        onClose={() => setShowExcludeBeltWarning(false)}
      />
      <WarningModal
        show={showItemGateLimiterHint}
        message={t("excludeItemGateLimiterHint")}
        closeOnBackdrop={false}
        onClose={() => setShowItemGateLimiterHint(false)}
      />
    </>
  );
}
