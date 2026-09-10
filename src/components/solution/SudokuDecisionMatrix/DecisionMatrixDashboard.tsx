import { useI18n } from "../../../i18n";
import type { CalcParams, SolutionResult } from "../../../types/calc";
import type { MatrixSelection } from "../../../types/matrix";
import { formatTime } from "../../../utils/constants";
import ProfileToolbar from "../SolutionList/ProfileToolbar";
import type { ProfileToolbarProps } from "../SolutionList/ProfileToolbar";

export interface DecisionMatrixDashboardProps {
  solution?: SolutionResult;
  params: CalcParams;
  selection: MatrixSelection | null;
  profile?: ProfileToolbarProps | null;
}

function formatNum(value: number, digits = 1): string {
  if (!Number.isFinite(value)) return "—";
  return Number.isInteger(value) ? String(value) : value.toFixed(digits);
}

export default function DecisionMatrixDashboard({
  solution,
  params,
  selection,
  profile = null,
}: DecisionMatrixDashboardProps) {
  const { t, locale } = useI18n();
  const row = selection?.row ?? Math.max(0, (solution?.branchCount ?? 1) - 1);
  const col = selection?.col ?? 0;
  const band = t(`wasteCol${col}`);
  const waste = solution ? formatNum(solution.waste) : "—";

  if (!solution) {
    return (
      <div className="h-full min-h-[8rem] flex items-center text-sm text-endfield-text/70">
        {t("clickCalculate")}
      </div>
    );
  }

  const oscCount = solution.oscillating?.length ?? 0;
  const autoCount = solution.baseDetails?.autoBaseCount ?? 0;
  const autoFuel =
    solution.baseDetails?.autoBaseFuel?.name?.[locale] ||
    solution.baseDetails?.autoBaseFuel?.name?.en ||
    "";
  const manualCount =
    solution.baseDetails?.manualLines.reduce(
      (sum, line) => sum + line.count,
      0
    ) ?? 0;
  const rate = solution.rateLimitPerMin;
  const limiterLabel =
    rate && rate > 0
      ? t("dashboardLimiter", { k: Math.round(rate / 6) })
      : t("dashboardNoLimiter");

  const topologyParts = [
    oscCount > 0
      ? t("dashboardOscBranches", { count: oscCount })
      : t("dashboardNoOsc"),
    autoCount > 0
      ? t("dashboardAutoBase", { count: autoCount, fuel: autoFuel })
      : null,
    manualCount > 0 ? t("dashboardManualBase", { count: manualCount }) : null,
    t("dashboardSplitters", { count: solution.totalSplitters }),
    limiterLabel,
  ].filter(Boolean);

  const daily =
    Array.isArray(solution.fuelBOM) && solution.fuelBOM.length > 0
      ? solution.fuelBOM
          .map((item) => {
            const name =
              item.fuelName?.[locale] || item.fuelName?.en || item.fuelId;
            const saved =
              item.savedPercent > 0
                ? ` (${t("dashboardSaved", {
                    pct: formatNum(item.savedPercent, 1),
                  })})`
                : "";
            return `${name} ${Math.round(item.totalRatePerDay)}${saved}`;
          })
          .join(" · ")
      : null;

  const compactHint =
    (solution.branchCount <= 1 || oscCount <= 1) &&
    solution.totalSplitters === 0;

  return (
    <div className="h-full flex flex-col gap-2 min-w-0 text-sm">
      <div className="flex items-start gap-2 min-w-0">
        <div className="min-w-0 flex-1 text-endfield-yellow font-bold tracking-wide">
          {t("dashboardPlanTitle", {
            count: row + 1,
            band,
            waste,
          })}
        </div>
        {profile ? (
          <div className="shrink-0">
            <ProfileToolbar
              profiles={profile.profiles}
              activeProfileId={profile.activeProfileId}
              isUrlSession={profile.isUrlSession}
              onSelectProfile={profile.onSelectProfile}
              onSaveAs={profile.onSaveAs}
              onRename={profile.onRename}
              onDelete={profile.onDelete}
              onSaveUrlSessionToLocal={profile.onSaveUrlSessionToLocal}
              onImportCode={profile.onImportCode}
            />
          </div>
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs sm:text-sm">
        <div>
          <span className="text-endfield-text">{t("actualPower")}: </span>
          <span className="text-endfield-text-light tabular-nums">
            {formatNum(solution.avgPower)}w
          </span>
        </div>
        <div>
          <span className="text-endfield-text">{t("targetPower")}: </span>
          <span className="text-endfield-text-light tabular-nums">
            {formatNum(params.targetPower)}w
          </span>
          <span
            className={`ml-1 ${
              solution.waste >= 0 ? "text-endfield-yellow" : "text-green-400"
            }`}
          >
            ({solution.waste >= 0 ? "+" : ""}
            {formatNum(solution.waste)}w)
          </span>
        </div>
        <div className="col-span-2">
          <span className="text-endfield-text">{t("dashboardTopology")}: </span>
          <span className="text-endfield-text-light">
            {topologyParts.join(" · ")}
          </span>
        </div>
        <div>
          <span className="text-endfield-text">{t("minBatteryShort")}: </span>
          <span className="text-endfield-text-light tabular-nums">
            {formatNum(solution.minBatteryPercent)}%
          </span>
        </div>
        <div>
          <span className="text-endfield-text">{t("cyclePeriod")}: </span>
          <span className="text-endfield-text-light">
            {solution.period > 0 ? formatTime(solution.period) : "--:--"}
          </span>
        </div>
        <div>
          <span className="text-endfield-text">{t("variance")}: </span>
          <span className="text-endfield-text-light tabular-nums">
            {solution.variance.toFixed(0)}
          </span>
        </div>
        {daily ? (
          <div className="col-span-2">
            <span className="text-endfield-text">{t("dashboardDaily")}: </span>
            <span className="text-endfield-text-light">{daily}</span>
          </div>
        ) : null}
        {compactHint ? (
          <div className="col-span-2 text-endfield-yellow/90 text-xs">
            {t("dashboardHighlightCompact")}
          </div>
        ) : null}
      </div>
    </div>
  );
}
