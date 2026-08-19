import { useI18n } from "../../../i18n";
import type { SolutionResult, UnifiedFuelBOMItem } from "../../../types/calc";
import type { Fuel } from "../../../utils/constants";
import { FUELS } from "../../../utils/constants";

function getOscillatingSavings(
  solution: SolutionResult,
  _locale: string
): { savedPerDay: number; savedPercent: number } | null {
  const oscillatingConsumption = solution?.fuelConsumption;
  const fuel = oscillatingConsumption?.oscillating?.fuel ?? undefined;
  const oscillatingBranches = solution?.oscillating ?? [];

  if (
    !fuel ||
    oscillatingBranches.length === 0 ||
    !fuel.power ||
    !fuel.burnTime
  ) {
    return null;
  }

  const oscillatingPower = oscillatingBranches.reduce(
    (sum, branch) => sum + (branch.power ?? 0),
    0
  );
  const neededGens = Math.max(1, Math.ceil(oscillatingPower / fuel.power));
  const fullBeltPerDay = neededGens * (1 / fuel.burnTime) * 86400;
  const perDay = oscillatingConsumption?.oscillating?.perDay ?? 0;
  const savedPerDay = fullBeltPerDay - perDay;

  if (savedPerDay <= 0) {
    return null;
  }

  return {
    savedPerDay,
    savedPercent: fullBeltPerDay > 0 ? (savedPerDay / fullBeltPerDay) * 100 : 0,
  };
}

function getBomFuelName(item: UnifiedFuelBOMItem, locale: string): string {
  const fromName = item.fuelName?.[locale] || item.fuelName?.en;
  if (fromName) return fromName;
  const fuel = FUELS[item.fuelId];
  return fuel?.name?.[locale] || fuel?.name?.en || item.fuelId;
}

export interface FuelConsumptionTableProps {
  solution: SolutionResult;
  locale: string;
}

export default function FuelConsumptionTable({
  solution,
  locale,
}: FuelConsumptionTableProps) {
  const { t } = useI18n();

  const bom = solution.fuelBOM;
  const hasBom = Array.isArray(bom) && bom.length > 0;

  if (!hasBom && !solution?.fuelConsumption) return null;

  const getFuelName = (fuel: Fuel | null | undefined) => {
    if (!fuel) return "-";
    return fuel.name?.[locale] || fuel.name?.en || "";
  };

  // 优先统一 BOM
  if (hasBom) {
    return (
      <div className="bg-endfield-gray border border-endfield-gray-light overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-endfield-gray-light bg-endfield-dark/50">
              <th className="text-left p-2 text-endfield-text font-normal">
                {t("fuelType")}
              </th>
              <th className="text-right p-2 text-endfield-text font-normal">
                {t("perMinute")}
              </th>
              <th className="text-right p-2 text-endfield-text font-normal">
                {t("perHour")}
              </th>
              <th className="text-right p-2 text-endfield-text font-normal">
                {t("perDay")}
              </th>
              <th className="hidden md:table-cell text-right p-2 text-endfield-text font-normal">
                {t("savedPerDay")}
              </th>
            </tr>
          </thead>
          <tbody>
            {bom.map((item) => {
              const name = getBomFuelName(item, locale);
              const parts: string[] = [];
              if (item.basePoolCount > 0 || item.baseRatePerMin > 0) {
                parts.push(
                  `${t("basePowerShort")}${
                    item.basePoolCount > 0 ? `×${item.basePoolCount}` : ""
                  }`
                );
              }
              if (item.oscRatePerMin > 0 || item.oscGeneratorCount > 0) {
                parts.push(t("oscillatingShort"));
              }
              // 优先使用 BOM 直接给出的每日节省量（相对震荡满载台数对照）
              const displaySavedDay = item.savedRatePerDay ?? 0;
              const displaySavedPct = item.savedPercent ?? 0;

              return (
                <tr
                  key={item.fuelId}
                  className="border-b border-endfield-gray-light/50 last:border-b-0"
                >
                  <td className="p-2">
                    <span className="text-endfield-text-light font-semibold">
                      {name}
                    </span>
                    {parts.length > 0 && (
                      <span className="text-endfield-text/50 text-xs ml-1">
                        ({parts.join(" + ")})
                      </span>
                    )}
                  </td>
                  <td className="p-2 text-right text-endfield-text-light">
                    {item.totalRatePerMin.toFixed(2)}
                  </td>
                  <td className="p-2 text-right text-endfield-text-light">
                    {item.totalRatePerHour.toFixed(1)}
                  </td>
                  <td className="p-2 text-right text-endfield-yellow font-bold">
                    {item.totalRatePerDay.toFixed(0)}
                  </td>
                  <td className="hidden md:table-cell p-2 text-right">
                    {displaySavedDay > 0.5 ? (
                      <span className="text-green-400 font-bold">
                        {displaySavedDay.toFixed(0)} (
                        {displaySavedPct.toFixed(1)}%)
                      </span>
                    ) : (
                      <span className="text-endfield-text/50">-</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {bom.some((item) => item.savedPercent > 0) && (
          <div className="md:hidden border-t border-endfield-gray-light px-2 py-2 text-sm text-endfield-text/70">
            {t("fuelBomMobileHint")}
          </div>
        )}
      </div>
    );
  }

  // Fallback: 旧 base/oscillating 两行
  const oscillatingSavings = getOscillatingSavings(solution, locale);
  const fuelConsumption = solution.fuelConsumption!;
  const { base, oscillating } = fuelConsumption;

  return (
    <div className="bg-endfield-gray border border-endfield-gray-light overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-endfield-gray-light bg-endfield-dark/50">
            <th className="text-left p-2 text-endfield-text font-normal">
              {t("fuelType")}
            </th>
            <th className="text-right p-2 text-endfield-text font-normal">
              {t("perMinute")}
            </th>
            <th className="text-right p-2 text-endfield-text font-normal">
              {t("perHour")}
            </th>
            <th className="text-right p-2 text-endfield-text font-normal">
              {t("perDay")}
            </th>
            <th className="hidden md:table-cell text-right p-2 text-endfield-text font-normal">
              {t("savedPerDay")}
            </th>
          </tr>
        </thead>
        <tbody>
          {base.perDay > 0 && (
            <tr className="border-b border-endfield-gray-light/50">
              <td className="p-2">
                <span className="text-endfield-text/70">
                  {t("basePowerShort")}:{" "}
                </span>
                <span className="text-endfield-text-light font-semibold">
                  {getFuelName(base.fuel)}
                </span>
              </td>
              <td className="p-2 text-right text-endfield-text-light">
                {base.perMinute.toFixed(2)}
              </td>
              <td className="p-2 text-right text-endfield-text-light">
                {base.perHour.toFixed(1)}
              </td>
              <td className="p-2 text-right text-endfield-yellow font-bold">
                {base.perDay.toFixed(0)}
              </td>
              <td className="hidden md:table-cell p-2 text-right text-endfield-text/50">
                -
              </td>
            </tr>
          )}
          {oscillating.perDay > 0 && (
            <tr>
              <td className="p-2">
                <span className="text-endfield-text/70">
                  {t("oscillatingShort")}:{" "}
                </span>
                <span className="text-endfield-text-light font-semibold">
                  {getFuelName(oscillating.fuel)}
                </span>
              </td>
              <td className="p-2 text-right text-endfield-text-light">
                {oscillating.perMinute.toFixed(2)}
              </td>
              <td className="p-2 text-right text-endfield-text-light">
                {oscillating.perHour.toFixed(1)}
              </td>
              <td className="p-2 text-right text-endfield-yellow font-bold">
                {oscillating.perDay.toFixed(0)}
              </td>
              <td className="hidden md:table-cell p-2 text-right">
                {oscillatingSavings ? (
                  <span className="text-green-400 font-bold">
                    {oscillatingSavings.savedPerDay.toFixed(0)} (
                    {oscillatingSavings.savedPercent.toFixed(1)}%)
                  </span>
                ) : (
                  <span className="text-endfield-text/50">-</span>
                )}
              </td>
            </tr>
          )}
        </tbody>
      </table>
      {oscillating.perDay > 0 && (
        <div className="md:hidden border-t border-endfield-gray-light px-2 py-2 flex items-center justify-between text-sm">
          <span className="text-endfield-text">{t("savedPerDay")}:</span>
          {oscillatingSavings ? (
            <span className="text-green-400 font-bold">
              {oscillatingSavings.savedPerDay.toFixed(0)} (
              {oscillatingSavings.savedPercent.toFixed(1)}%)
            </span>
          ) : (
            <span className="text-endfield-text/50">-</span>
          )}
        </div>
      )}
    </div>
  );
}
