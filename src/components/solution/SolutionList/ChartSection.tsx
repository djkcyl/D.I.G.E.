import { useEffect, useRef, useState } from "react";
import { useI18n } from "../../../i18n";
import type { SolutionResult } from "../../../types/calc";
import { CONSTANTS } from "../../../utils/constants";
import Toggle from "../../ui/Toggle";
import SolutionChart from "../SolutionChart";

export interface ChartSectionProps {
  solution: SolutionResult | undefined;
  targetPower: number;
  minBatteryThreshold: number;
  preciseValues: boolean;
  setPreciseValues: React.Dispatch<React.SetStateAction<boolean>>;
  hideHoverDetails: boolean;
  setHideHoverDetails: React.Dispatch<React.SetStateAction<boolean>>;
  poolSegments?: import("../SolutionChart").PoolSegments;
}

export default function ChartSection({
  solution,
  targetPower,
  minBatteryThreshold,
  preciseValues,
  setPreciseValues,
  hideHoverDetails,
  setHideHoverDetails,
  poolSegments,
}: ChartSectionProps) {
  const { t } = useI18n();
  const chartHeaderRef = useRef<HTMLDivElement>(null);
  const chartControlsRef = useRef<HTMLDivElement>(null);
  const chartDescRef = useRef<HTMLDivElement>(null);
  const [showChartDataDesc, setShowChartDataDesc] = useState(true);

  useEffect(() => {
    const headerEl = chartHeaderRef.current;
    if (!headerEl) return;

    const updateChartHeaderLayout = () => {
      const rowWidth = headerEl.clientWidth;
      const controlsWidth = chartControlsRef.current?.offsetWidth || 0;
      const descWidth = chartDescRef.current?.scrollWidth || 0;
      setShowChartDataDesc(rowWidth >= controlsWidth + descWidth + 24);
    };

    updateChartHeaderLayout();
    const observer = new ResizeObserver(updateChartHeaderLayout);
    observer.observe(headerEl);
    if (chartControlsRef.current) observer.observe(chartControlsRef.current);

    return () => observer.disconnect();
  }, []);

  return (
    <div className="bg-endfield-gray border border-endfield-gray-light p-2 sm:p-4">
      <div
        ref={chartHeaderRef}
        className="flex items-center justify-between mb-2 gap-2 relative"
      >
        <div
          ref={chartDescRef}
          className={`text-[11px] text-endfield-text/70 whitespace-nowrap ${showChartDataDesc ? "block" : "invisible absolute pointer-events-none"}`}
        >
          {t("chartDataDesc")}
        </div>
        <div ref={chartControlsRef} className="flex items-center gap-2 ml-auto">
          <button
            type="button"
            role="switch"
            aria-checked={preciseValues}
            aria-label={t("preciseValues")}
            onClick={() => setPreciseValues((v) => !v)}
            onKeyDown={(e) => {
              if (e.key === " " || e.key === "Enter") {
                e.preventDefault();
                setPreciseValues((v) => !v);
              }
            }}
            className="inline-flex items-center gap-2 px-2 py-1.5 bg-endfield-dark/60 border border-endfield-gray-light hover:border-endfield-yellow/60 transition-colors text-xs text-endfield-text cursor-pointer select-none"
          >
            <Toggle
              checked={preciseValues}
              interactive={false}
              ariaLabel={t("preciseValues")}
            />
            <span>{t("preciseValues")}</span>
          </button>
          <button
            type="button"
            role="switch"
            aria-checked={!hideHoverDetails}
            aria-label={t("hoverDetails")}
            onClick={() => setHideHoverDetails((v) => !v)}
            onKeyDown={(e) => {
              if (e.key === " " || e.key === "Enter") {
                e.preventDefault();
                setHideHoverDetails((v) => !v);
              }
            }}
            className="inline-flex items-center gap-2 px-2 py-1.5 bg-endfield-dark/60 border border-endfield-gray-light hover:border-endfield-yellow/60 transition-colors text-xs text-endfield-text cursor-pointer select-none"
          >
            <Toggle
              checked={!hideHoverDetails}
              interactive={false}
              ariaLabel={t("hoverDetails")}
            />
            <span>{t("hoverDetails")}</span>
          </button>
        </div>
      </div>
      <SolutionChart
        poolSegments={poolSegments}
        solution={solution}
        targetPower={targetPower}
        minBatteryThreshold={minBatteryThreshold}
        batteryCapacity={CONSTANTS.BATTERY_CAPACITY}
        hideHoverDetails={hideHoverDetails}
        preciseValues={preciseValues}
      />
    </div>
  );
}
