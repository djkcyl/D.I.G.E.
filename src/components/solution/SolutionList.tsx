import { useEffect, useRef, useState } from "react";
import { useI18n } from "../../i18n";
import type { CalcParams, SolutionResult } from "../../types/calc";
import type { DecisionMatrixGrid, MatrixSelection } from "../../types/matrix";
import { MIN_BATTERY_CUTOFF } from "../../types/matrix";
import { findSelectionForSolution } from "../../utils/decisionMatrix";
import type { PowerGridProfile } from "../../types/profile";
import type { DiagnosisResult } from "../../utils/failureDiagnose";
import CollapsibleSection from "../ui/CollapsibleSection";
import Icon from "../ui/Icon";
import SolutionDiagram from "./SolutionDiagram";
import ChartSection from "./SolutionList/ChartSection";
import FuelConsumptionTable from "./SolutionList/FuelConsumptionTable";
import ProfileToolbar from "./SolutionList/ProfileToolbar";
import SolutionSummary from "./SolutionList/SolutionSummary";
import DecisionMatrixCard from "./SudokuDecisionMatrix/DecisionMatrixCard";
import DecisionMatrixDashboard from "./SudokuDecisionMatrix/DecisionMatrixDashboard";
import DecisionMatrixModal from "./SudokuDecisionMatrix/DecisionMatrixModal";

export interface SolutionListProfileProps {
  profiles: PowerGridProfile[];
  activeProfileId: string;
  isUrlSession?: boolean;
  onSelectProfile: (id: string) => void;
  onSaveAs: () => void;
  onRename: (id: string) => void;
  onDelete: (id: string) => void;
  onSaveUrlSessionToLocal?: () => void;
  onImportCode?: () => void;
}

export interface SolutionListProps {
  solutions: SolutionResult[];
  selectedIndex: number;
  onSelectSolution: (index: number) => void;
  params: CalcParams;
  diagnosis?: DiagnosisResult | null;
  profile?: SolutionListProfileProps | null;
  matrix?: DecisionMatrixGrid | null;
  defaultSelection?: MatrixSelection | null;
}

function formatWaste(value: number): string {
  if (!Number.isFinite(value)) return "—";
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function StickyHud({
  selectedSolution,
  selection,
  isMobile,
  onOpenPicker,
  profile,
}: {
  selectedSolution?: SolutionResult;
  selection: MatrixSelection | null;
  isMobile: boolean;
  onOpenPicker: () => void;
  profile?: SolutionListProfileProps | null;
}) {
  const { t } = useI18n();
  const row =
    selection?.row ?? Math.max(0, (selectedSolution?.branchCount ?? 1) - 1);
  const col = selection?.col ?? 0;
  const wasteLabel = t(`wasteCol${col}`);
  const waste = selectedSolution ? formatWaste(selectedSolution.waste) : "—";
  const power = selectedSolution ? formatWaste(selectedSolution.avgPower) : "—";
  const minBat = selectedSolution
    ? Math.round(selectedSolution.minBatteryPercent)
    : 0;

  const triggerLabel = isMobile
    ? t("mobilePlanTrigger", { count: row + 1, waste })
    : t("hudPlanTrigger", { count: row + 1, band: wasteLabel, waste });

  return (
    <div className="h-[38px] px-2 sm:px-3 border-b border-endfield-gray-light bg-endfield-dark/90 backdrop-blur-[6px] flex items-center gap-2 min-w-0">
      <button
        type="button"
        onClick={onOpenPicker}
        className="shrink-0 h-7 px-2 text-xs border border-endfield-yellow/60 text-endfield-yellow bg-endfield-yellow/10 hover:bg-endfield-yellow/20 whitespace-nowrap"
      >
        {triggerLabel} ▾
      </button>
      <div className="flex-1 min-w-0 text-xs text-endfield-text-light truncate">
        {t("currentPower")}: {power}w · {t("minBatteryShort")}: {minBat}%
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
  );
}

export default function SolutionList({
  solutions,
  selectedIndex,
  onSelectSolution,
  params,
  diagnosis = null,
  profile = null,
  matrix = null,
  defaultSelection = null,
}: SolutionListProps) {
  const { t, locale } = useI18n();
  const [hideHoverDetails, setHideHoverDetails] = useState(false);
  const [preciseValues, setPreciseValues] = useState(false);
  const [collapsedSections, setCollapsedSections] = useState({
    chart: false,
    fuel: false,
    diagram: false,
  });
  const [isMobile, setIsMobile] = useState(false);
  const [hudPinned, setHudPinned] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const scrollRootRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mql = window.matchMedia("(max-width: 768px)");
    const apply = () => {
      setHideHoverDetails(mql.matches);
      setIsMobile(mql.matches);
    };
    apply();
    const handler = (e: MediaQueryListEvent) => {
      setHideHoverDetails(e.matches);
      setIsMobile(e.matches);
    };
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, []);

  useEffect(() => {
    const root = scrollRootRef.current;
    const sentinel = sentinelRef.current;
    if (!root || !sentinel || typeof IntersectionObserver === "undefined")
      return;
    const io = new IntersectionObserver(
      ([entry]) => {
        setHudPinned(!entry.isIntersecting);
      },
      { root, threshold: 0 }
    );
    io.observe(sentinel);
    return () => io.disconnect();
  }, [solutions.length, matrix]);

  const toggleSection = (key: "chart" | "fuel" | "diagram") => {
    setCollapsedSections((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const hasSolutions = Boolean(solutions && solutions.length > 0);
  const selectedSolution = hasSolutions ? solutions[selectedIndex] : undefined;
  const preferred = solutions[0] ?? null;
  const selection =
    (matrix && selectedSolution
      ? findSelectionForSolution(matrix, selectedSolution)
      : null) ?? defaultSelection;

  const handleSelectCell = (
    _row: number,
    _col: number,
    sol: SolutionResult
  ) => {
    const idx = solutions.findIndex((s) => s === sol);
    if (idx >= 0) onSelectSolution(idx);
    setPickerOpen(false);
  };

  const matrixCard = (
    <DecisionMatrixCard
      matrix={matrix}
      selection={selection}
      preferred={preferred}
      onSelectCell={handleSelectCell}
    />
  );

  const emptyBody = (
    <div className="flex-1 flex items-center justify-center text-endfield-text min-h-[12rem] py-8">
      {diagnosis ? (
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
      ) : (
        <div className="text-center max-w-sm px-4">
          <Icon name="calculate" className="mb-2" />
          <p className="mb-2">{t("clickCalculate")}</p>
          <p className="text-xs text-endfield-text/60">
            {t("adjustParamsHint")}
          </p>
        </div>
      )}
    </div>
  );

  return (
    <div
      className="flex-1 flex flex-col overflow-hidden notranslate"
      translate="no"
    >
      <div
        ref={scrollRootRef}
        className="flex-1 overflow-auto scrollbar-gutter-stable"
      >
        <div ref={sentinelRef} className="h-px w-full" aria-hidden="true" />

        {isMobile ? (
          <StickyHud
            selectedSolution={selectedSolution}
            selection={selection}
            isMobile
            onOpenPicker={() => setPickerOpen(true)}
            profile={profile}
          />
        ) : (
          <>
            <div className="p-2 sm:p-4 border-b border-endfield-gray-light bg-endfield-dark/50">
              <div className="text-sm font-bold text-endfield-text uppercase tracking-widest mb-2">
                {t("decisionMatrixTitle")}
              </div>
              <div className="flex flex-col lg:flex-row gap-4 items-stretch">
                <div className="w-full lg:w-[380px] lg:shrink-0">
                  {matrixCard}
                </div>
                <div className="flex-1 min-w-0 min-h-[190px]">
                  <DecisionMatrixDashboard
                    solution={selectedSolution}
                    params={params}
                    selection={selection}
                    profile={profile}
                  />
                </div>
              </div>
            </div>
            {hudPinned ? (
              <div className="sticky top-0 z-20">
                <StickyHud
                  selectedSolution={selectedSolution}
                  selection={selection}
                  isMobile={false}
                  onOpenPicker={() => setPickerOpen(true)}
                  profile={profile}
                />
              </div>
            ) : null}
          </>
        )}

        {isMobile && hasSolutions && selectedSolution ? (
          <div className="px-2 sm:px-4 pt-2">
            <SolutionSummary solution={selectedSolution} />
          </div>
        ) : null}

        {!hasSolutions ? emptyBody : null}

        {hasSolutions && selectedSolution ? (
          <>
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
                  minBatteryThreshold={MIN_BATTERY_CUTOFF}
                  preciseValues={preciseValues}
                  setPreciseValues={setPreciseValues}
                  hideHoverDetails={hideHoverDetails}
                  setHideHoverDetails={setHideHoverDetails}
                />
              </CollapsibleSection>
            </div>

            {selectedSolution.fuelConsumption ? (
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
          </>
        ) : null}
      </div>

      {isMobile ? (
        <DecisionMatrixModal
          show={pickerOpen}
          onClose={() => setPickerOpen(false)}
          title={t("decisionMatrixTitle")}
        >
          {matrixCard}
        </DecisionMatrixModal>
      ) : pickerOpen ? (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setPickerOpen(false)}
        >
          <div
            className="absolute top-12 right-4 left-4 md:left-auto md:w-[380px] bg-endfield-gray border border-endfield-yellow/40 p-3 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {matrixCard}
          </div>
        </div>
      ) : null}
    </div>
  );
}
