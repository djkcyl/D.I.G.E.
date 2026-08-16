import { useEffect, useState } from "react";
import { useI18n } from "../../i18n";
import type { CalcParams, SolutionResult } from "../../types/calc";
import type { DiagnosisResult } from "../../utils/failureDiagnose";
import CollapsibleSection from "../ui/CollapsibleSection";
import Icon from "../ui/Icon";
import SolutionDiagram from "./SolutionDiagram";
import ChartSection from "./SolutionList/ChartSection";
import FuelConsumptionTable from "./SolutionList/FuelConsumptionTable";
import SolutionSelector from "./SolutionList/SolutionSelector";
import SolutionSummary from "./SolutionList/SolutionSummary";

export interface SolutionListProps {
  solutions: SolutionResult[];
  selectedIndex: number;
  onSelectSolution: (index: number) => void;
  params: CalcParams;
  diagnosis?: DiagnosisResult | null;
}

export default function SolutionList({
  solutions,
  selectedIndex,
  onSelectSolution,
  params,
  diagnosis = null,
}: SolutionListProps) {
  const { t, locale } = useI18n();
  const [hideHoverDetails, setHideHoverDetails] = useState(false);
  const [preciseValues, setPreciseValues] = useState(false);
  const [collapsedSections, setCollapsedSections] = useState({
    chart: false,
    fuel: false,
    diagram: false,
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mql = window.matchMedia("(max-width: 768px)");
    setHideHoverDetails(mql.matches);
    const handler = (e: MediaQueryListEvent) => setHideHoverDetails(e.matches);
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, []);

  const toggleSection = (key: "chart" | "fuel" | "diagram") => {
    setCollapsedSections((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  if (!solutions || solutions.length === 0) {
    if (diagnosis) {
      return (
        <div className="flex-1 flex items-center justify-center text-endfield-text">
          <div className="text-left max-w-md px-4 space-y-3 border border-endfield-gray-light/80 bg-endfield-dark/60 p-4">
            <div className="flex items-center gap-2 text-red-300">
              <Icon name="error" className="leading-none" />
              <span className="text-sm font-bold uppercase tracking-widest">
                {t("noSolutionFound")}
              </span>
            </div>
            <p className="text-sm text-endfield-text-light">
              {diagnosis.primaryHint}
            </p>
            {diagnosis.secondaryHints.length > 0 ? (
              <div className="space-y-1.5">
                <p className="text-xs uppercase tracking-wider text-endfield-text/70">
                  {t("diagSuggestionsHeader")}
                </p>
                <ul className="list-disc pl-5 space-y-1 text-sm text-endfield-text-light">
                  {diagnosis.secondaryHints.map((hint, i) => (
                    <li key={i}>{hint}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            <p className="text-xs text-endfield-text/60">
              {t("adjustParamsHint")}
            </p>
          </div>
        </div>
      );
    }

    return (
      <div className="flex-1 flex items-center justify-center text-endfield-text">
        <div className="text-center max-w-sm px-4">
          <Icon name="calculate" className="mb-2" />
          <p className="mb-2">{t("clickCalculate")}</p>
          <p className="text-xs text-endfield-text/60">
            {t("adjustParamsHint")}
          </p>
        </div>
      </div>
    );
  }

  const selectedSolution = solutions[selectedIndex];

  return (
    <div
      className="flex-1 flex flex-col overflow-hidden notranslate"
      translate="no"
    >
      <div className="flex-1 overflow-auto scrollbar-gutter-stable">
        <div className="p-2 sm:p-4 border-b border-endfield-gray-light bg-endfield-dark/50 md:sticky md:top-0 md:z-20 md:bg-endfield-dark/80 md:backdrop-blur-[6px] md:shadow-[0_4px_12px_rgba(0,0,0,0.28)]">
          <SolutionSelector
            solutions={solutions}
            selectedIndex={selectedIndex}
            onSelectSolution={onSelectSolution}
          />
          <SolutionSummary solution={selectedSolution} />
        </div>

        <div
          className={`${
            collapsedSections.chart
              ? "px-2 sm:px-4 pt-2 sm:pt-4 pb-2 sm:pb-3"
              : "p-2 sm:p-4"
          } border-b border-endfield-gray-light`}
        >
          <CollapsibleSection
            title={t("cycleChart")}
            collapsed={collapsedSections.chart}
            onToggle={() => toggleSection("chart")}
            icon="monitoring"
            expandLabel={t("expandSection")}
            collapseLabel={t("collapseSection")}
          >
            <ChartSection
              solution={selectedSolution}
              targetPower={params.targetPower}
              minBatteryThreshold={params.minBatteryPercent}
              preciseValues={preciseValues}
              setPreciseValues={setPreciseValues}
              hideHoverDetails={hideHoverDetails}
              setHideHoverDetails={setHideHoverDetails}
            />
          </CollapsibleSection>
        </div>

        {selectedSolution?.fuelConsumption ? (
          <div
            className={`${
              collapsedSections.fuel
                ? "px-2 sm:px-4 pt-2 sm:pt-4 pb-2 sm:pb-3"
                : "p-2 sm:p-4"
            } border-b border-endfield-gray-light`}
          >
            <CollapsibleSection
              title={String(t("fuelConsumption"))}
              collapsed={collapsedSections.fuel}
              onToggle={() => toggleSection("fuel")}
              icon="local_fire_department"
              expandLabel={t("expandSection")}
              collapseLabel={t("collapseSection")}
            >
              <FuelConsumptionTable
                solution={selectedSolution}
                locale={locale}
              />
            </CollapsibleSection>
          </div>
        ) : null}

        <div
          className={
            collapsedSections.diagram
              ? "px-2 sm:px-4 pt-2 sm:pt-4 pb-2 sm:pb-3"
              : "p-2 sm:p-4"
          }
        >
          <CollapsibleSection
            title={t("solutionDiagram")}
            collapsed={collapsedSections.diagram}
            onToggle={() => toggleSection("diagram")}
            icon="account_tree"
            expandLabel={t("expandSection")}
            collapseLabel={t("collapseSection")}
          >
            <SolutionDiagram solution={selectedSolution} params={params} />
          </CollapsibleSection>
        </div>
      </div>
    </div>
  );
}
