import { useI18n } from "../../../i18n";
import type { SolutionResult } from "../../../types/calc";
import { formatTime } from "../../../utils/constants";

export interface SolutionSummaryProps {
  solution: SolutionResult | undefined;
}

export default function SolutionSummary({ solution }: SolutionSummaryProps) {
  const { t } = useI18n();

  if (!solution) return null;

  const phaseOffsetSummary =
    Array.isArray(solution.oscillating) && solution.oscillating.length > 0
      ? solution.oscillating
          .map(
            (branch, index) =>
              `#${index + 1}:${Math.max(0, Math.round(branch.phaseOffsetCells ?? 0))}`,
          )
          .join(", ")
      : null;

  return (
    <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-2 sm:gap-4 text-sm">
      <div className="flex items-center gap-1 sm:gap-2">
        <span className="text-endfield-text">{t("branchesShort")}:</span>
        <span className="text-endfield-text-light">{solution.branchCount}</span>
        <span className="text-endfield-text">
          {solution.isPrimary ? t("primaryOnly") : t("useSecondary")}
        </span>
      </div>
      <div className="flex items-center gap-1 sm:gap-2">
        <span className="text-endfield-text">{t("actualPower")}:</span>
        <span className="text-endfield-text-light">
          {solution.avgPower.toFixed(1)}w
        </span>
        <span
          className={`${solution.waste >= 0 ? "text-endfield-yellow" : "text-green-400"}`}
        >
          ({solution.waste >= 0 ? "+" : ""}
          {solution.waste.toFixed(1)})
        </span>
      </div>
      <div className="flex items-center gap-1 sm:gap-2">
        <span className="text-endfield-text">{t("cyclePeriod")}:</span>
        <span className="text-endfield-text-light">
          {solution.period > 0 ? formatTime(solution.period) : "--:--"}
        </span>
      </div>
      <div className="flex items-center gap-1 sm:gap-2">
        <span className="text-endfield-text">{t("minBatteryShort")}:</span>
        <span className="text-endfield-text-light">
          {solution.minBatteryPercent.toFixed(1)}%
        </span>
      </div>
      <div className="flex items-center gap-1 sm:gap-2">
        <span className="text-endfield-text">{t("variance")}:</span>
        <span className="text-endfield-text-light">
          {solution.variance.toFixed(2)}
        </span>
      </div>
      {phaseOffsetSummary && (
        <div className="col-span-2 flex items-center gap-1 sm:gap-2">
          <span className="text-endfield-text">{t("branchPhaseOffset")}:</span>
          <span className="text-endfield-text-light">{phaseOffsetSummary}</span>
        </div>
      )}
    </div>
  );
}
