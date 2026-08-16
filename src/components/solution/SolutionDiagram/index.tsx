import { useCallback, useEffect, useRef, useState } from "react";
import { useI18n } from "../../../i18n";
import type { CalcParams, SolutionResult } from "../../../types/calc";
import {
  FUEL_OPTIONS,
  INPUT_SOURCE_OPTIONS,
  SECONDARY_FUEL_OPTIONS,
} from "../../../utils/constants";
import {
  buildEndfieldBlueprintPng,
  buildEndfieldCompleteImage,
  downloadEndfieldBlueprint,
  downloadEndfieldBlueprintZip,
} from "../../../utils/endfieldBlueprint";
import { buildShareUrl, type ShareParams } from "../../../utils/shareParams";
import Icon from "../../ui/Icon";
import ImagePreviewModal from "../../ui/ImagePreview/ImagePreviewModal";
import BlueprintBranch from "./BlueprintBranch";
import BlueprintExportModal from "./BlueprintExportModal";
import BlueprintLegend from "./BlueprintLegend";
import DiagramConfig from "./DiagramConfig";
import SimpleBranch from "./SimpleBranch";
import SimpleLegend from "./SimpleLegend";

const BLUEPRINT_ZOOM_MIN = 1;
const BLUEPRINT_ZOOM_MAX = 3;

export interface SolutionDiagramProps {
  solution: SolutionResult | null;
  params: CalcParams;
}

export default function SolutionDiagram({
  solution,
  params,
}: SolutionDiagramProps) {
  const { t, locale } = useI18n();
  const [mode, setMode] = useState<"blueprint" | "simple">("blueprint");
  const [blueprintZoom, setBlueprintZoom] = useState(1);
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [imagePreviewOpen, setImagePreviewOpen] = useState(false);
  const [resumeExportModalOnPreviewClose, setResumeExportModalOnPreviewClose] =
    useState(false);
  const [imagePreviewBlob, setImagePreviewBlob] = useState<Blob | null>(null);
  const [imagePreviewFileName, setImagePreviewFileName] = useState("");
  const [imagePreviewTitle, setImagePreviewTitle] = useState("");
  const [preparingCompleteImage, setPreparingCompleteImage] = useState(false);
  const pinchRef = useRef({ initialDistance: 0, initialZoom: 1 });

  const clampZoom = useCallback(
    (z: number) =>
      Math.max(BLUEPRINT_ZOOM_MIN, Math.min(BLUEPRINT_ZOOM_MAX, z)),
    []
  );

  const handleBlueprintWheel = useCallback(
    (e: React.WheelEvent) => {
      if (mode !== "blueprint") return;
      e.preventDefault();
      const delta = -e.deltaY * 0.002;
      setBlueprintZoom((z) => clampZoom(z + delta));
    },
    [mode, clampZoom]
  );

  const handleBlueprintTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (mode !== "blueprint" || e.touches.length !== 2) return;
      const dist = Math.hypot(
        e.touches[1].clientX - e.touches[0].clientX,
        e.touches[1].clientY - e.touches[0].clientY
      );
      pinchRef.current = { initialDistance: dist, initialZoom: blueprintZoom };
    },
    [mode, blueprintZoom]
  );

  const handleBlueprintTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (e.touches.length !== 2 || !pinchRef.current.initialDistance) return;
      e.preventDefault();
      const dist = Math.hypot(
        e.touches[1].clientX - e.touches[0].clientX,
        e.touches[1].clientY - e.touches[0].clientY
      );
      const { initialDistance, initialZoom } = pinchRef.current;
      const scale = dist / initialDistance;
      setBlueprintZoom(clampZoom(initialZoom * scale));
    },
    [clampZoom]
  );

  const handleBlueprintTouchEnd = useCallback(() => {
    pinchRef.current = { initialDistance: 0, initialZoom: 1 };
  }, []);

  const handleOpenExportModal = useCallback(() => {
    setExportModalOpen(true);
  }, []);

  const handleCloseExportModal = useCallback(() => {
    setExportModalOpen(false);
    setResumeExportModalOnPreviewClose(false);
  }, []);

  const handleCloseImagePreview = useCallback(() => {
    setImagePreviewOpen(false);
    setImagePreviewBlob(null);
    setImagePreviewFileName("");
    setImagePreviewTitle("");
    if (resumeExportModalOnPreviewClose) {
      setExportModalOpen(true);
      setResumeExportModalOnPreviewClose(false);
    }
  }, [resumeExportModalOnPreviewClose]);

  useEffect(() => {
    if (mode !== "blueprint") setBlueprintZoom(1);
  }, [mode]);

  const openImagePreview = useCallback(
    ({
      blob,
      fileName,
      title,
    }: {
      blob: Blob;
      fileName?: string;
      title?: string;
    }) => {
      if (!blob) return;
      setImagePreviewBlob(blob);
      setImagePreviewFileName(fileName || "");
      setImagePreviewTitle(title || t("completeImagePreviewTitle"));
      setImagePreviewOpen(true);
    },
    [t]
  );

  const oscillating = solution?.oscillating ?? [];
  const oscillatingFuel = solution?.oscillatingFuel as
    | { name?: Record<string, string> }
    | undefined;
  const inputSourceId = solution?.inputSourceId;
  const excludeBelt = solution?.excludeBelt;
  const showPackerWarning = inputSourceId === "packer";
  const showExcludeBeltWarning = excludeBelt === false;
  const hasOscillating = Array.isArray(oscillating) && oscillating.length > 0;
  const canExportBlueprint = mode === "blueprint" && hasOscillating;
  const handleExportSingleBranch = useCallback(
    (branchIndex: number) => {
      const branch = oscillating?.[branchIndex];
      if (!branch) return;
      try {
        const denominator = Number(branch.denominator);
        const safeDenominator =
          Number.isFinite(denominator) && denominator > 0
            ? denominator
            : "unknown";
        const power = Number(branch.power);
        const powerToken = `${
          Number.isFinite(power) ? Math.round(power) : "unknown"
        }w`;
        downloadEndfieldBlueprint(branch, {
          filename: `dige_branch_${
            branchIndex + 1
          }_1_${safeDenominator}_${powerToken}_blueprint.json`,
        });
      } catch (error) {
        console.error("Blueprint export failed:", error);
      }
    },
    [oscillating]
  );

  const handleExportSingleBranchPng = useCallback(
    async (branchIndex: number) => {
      const branch = oscillating?.[branchIndex];
      if (!branch) return;
      try {
        const denominator = Number(branch.denominator);
        const safeDenominator =
          Number.isFinite(denominator) && denominator > 0
            ? denominator
            : "unknown";
        const power = Number(branch.power);
        const powerToken = `${
          Number.isFinite(power) ? Math.round(power) : "unknown"
        }w`;
        const { fileName, blob } = await buildEndfieldBlueprintPng(branch, {
          filename: `dige_branch_${
            branchIndex + 1
          }_1_${safeDenominator}_${powerToken}.png`,
          branchLabel: `${t("branch")} ${branchIndex + 1}`,
        });
        openImagePreview({
          blob,
          fileName,
          title: `${t("branch")} ${branchIndex + 1} PNG`,
        });
        setResumeExportModalOnPreviewClose(true);
        setExportModalOpen(false);
      } catch (error) {
        console.error("Blueprint PNG export failed:", error);
      }
    },
    [openImagePreview, oscillating, t]
  );

  const handleExportAllBranchesZip = useCallback(async () => {
    if (!Array.isArray(oscillating) || oscillating.length === 0) return;
    try {
      const totalPower = oscillating.reduce((sum, branch) => {
        const branchPower = Number(branch?.power);
        return sum + (Number.isFinite(branchPower) ? branchPower : 0);
      }, 0);
      const powerToken = `${Math.round(totalPower)}w`;

      await downloadEndfieldBlueprintZip(oscillating, {
        filename: `dige_branches_all_${oscillating.length}_${powerToken}.zip`,
        includePng: true,
        includeParams: false,
        includePreciseChart: false,
      });
      setExportModalOpen(false);
    } catch (error) {
      console.error("Blueprint zip export failed:", error);
    }
  }, [oscillating]);

  const handleExportCompleteImage = useCallback(async () => {
    if (!Array.isArray(oscillating) || oscillating.length === 0) return;
    try {
      setPreparingCompleteImage(true);
      const getLocalizedName = (option: {
        name?: Record<string, string>;
        id?: string;
      }) => option?.name?.[locale] || option?.name?.en || option?.id || "-";
      const primaryFuelNameMap = Object.fromEntries(
        FUEL_OPTIONS.map((option) => [option.id, getLocalizedName(option)])
      );
      const secondaryFuelNameMap = Object.fromEntries(
        SECONDARY_FUEL_OPTIONS.map((option) => [
          option.id,
          getLocalizedName(option),
        ])
      );
      const inputSourceNameMap = Object.fromEntries(
        INPUT_SOURCE_OPTIONS.map((option) => [
          option.id,
          getLocalizedName(option),
        ])
      );
      const totalPower = oscillating.reduce((sum, branch) => {
        const branchPower = Number(branch?.power);
        return sum + (Number.isFinite(branchPower) ? branchPower : 0);
      }, 0);
      const powerToken = `${Math.round(totalPower)}w`;
      const shareUrl = buildShareUrl(params as ShareParams);

      const { fileName, blob } = await buildEndfieldCompleteImage(oscillating, {
        filename: `dige_export_full_${oscillating.length}_${powerToken}.png`,
        params,
        shareUrl: shareUrl ?? undefined,
        solution: solution ?? undefined,
        targetPower: Number(params?.targetPower),
        chartLabels: {
          currentPower: t("currentPower"),
          targetPowerLine: t("targetPowerLine"),
          batteryLevel: t("batteryLevel"),
          minBatteryPercent: t("minBatteryPercent"),
          branch: t("branch"),
          burnStateShort: t("burnStateShort"),
          powerAxis: t("powerAxis"),
          batteryAxis: t("batteryAxis"),
          stateOn: t("stateOn"),
          stateOff: t("stateOff"),
        },
        completeLabels: {
          title: t("completeExportImageTitle"),
          exportTime: t("exportTime"),
          parameters: t("constraints"),
          summary: t("summary"),
          branches: t("solutionDiagram"),
          chart: t("cycleChart"),
          targetPower: t("targetPower"),
          minBatteryPercent: t("minBatteryPercent"),
          maxWaste: t("maxWaste"),
          maxBranches: t("maxBranches"),
          branchPhaseOffset: t("branchPhaseOffset"),
          excludeBelt: t("excludeBelt"),
          primaryFuel: t("primaryFuel"),
          secondaryFuel: t("secondaryFuel"),
          inputSource: t("inputSource"),
          actualPower: t("actualPower"),
          cyclePeriod: t("cyclePeriod"),
          variance: t("variance"),
          minBattery: t("minBatteryShort"),
          branchCount: t("branchesShort"),
          totalSplitters: t("legendBlueprintS"),
          branch: t("branch"),
          stateOn: t("stateOn"),
          stateOff: t("stateOff"),
          excludeBeltOn: t("enabled"),
          excludeBeltOff: t("disabled"),
          footnote: t("completeExportFootnote"),
          primaryFuelNameMap,
          secondaryFuelNameMap,
          inputSourceNameMap,
        },
      });
      openImagePreview({
        blob,
        fileName,
        title: t("completeImagePreviewTitle"),
      });
      setResumeExportModalOnPreviewClose(true);
      setExportModalOpen(false);
    } catch (error) {
      console.error("Blueprint complete image export failed:", error);
    } finally {
      setPreparingCompleteImage(false);
    }
  }, [locale, openImagePreview, oscillating, params, solution, t]);

  if (!solution) {
    return (
      <div className="h-32 flex items-center justify-center text-endfield-text text-sm">
        {t("noSolutionData")}
      </div>
    );
  }

  return (
    <div className="space-y-2 sm:space-y-3 notranslate" translate="no">
      {showPackerWarning && (
        <div className="p-2.5 bg-red-900/20 border border-red-900/50 text-sm text-red-300 flex items-center gap-2">
          <Icon name="warning" />
          <span>{t("inputWarningPacker")}</span>
        </div>
      )}

      {showExcludeBeltWarning && (
        <div className="p-2.5 bg-red-900/20 border border-red-900/50 text-sm text-red-300 flex items-center gap-2">
          <Icon name="warning" />
          <span>{t("excludeBeltWarning")}</span>
        </div>
      )}

      <DiagramConfig solution={solution} locale={locale} />

      <div className="border border-endfield-gray-light bg-endfield-gray/30">
        <div className="flex flex-wrap items-center gap-2 p-3 border-b border-endfield-gray-light bg-endfield-gray/50">
          <Icon name="electric_bolt" className="text-endfield-yellow" />
          <span className="text-sm text-endfield-text uppercase">
            {t("oscillatingShort")}:
          </span>
          <span className="text-sm font-bold text-endfield-text-light">
            {hasOscillating ? oscillating.length : 0}
          </span>
          {hasOscillating ? (
            <>
              <span className="text-sm text-endfield-text">
                x{" "}
                {oscillatingFuel
                  ? oscillatingFuel.name?.[locale] || oscillatingFuel.name?.en
                  : (solution.fuel as { name?: Record<string, string> })
                      ?.name?.[locale] ||
                    (solution.fuel as { name?: Record<string, string> })?.name
                      ?.en}
              </span>
              <span className="text-sm text-endfield-text">=</span>
              <span className="text-sm font-bold text-endfield-text-light">
                {oscillating.reduce((sum, b) => sum + b.power, 0).toFixed(0)}w
              </span>
              <span className="text-xs text-endfield-text/70 flex flex-wrap items-center gap-x-1 gap-y-0.5">
                <span>(</span>
                {oscillating.map((b, i) => {
                  const limited =
                    Boolean(b.requiresLimiter) && b.limiterSpeed != null;
                  const branchFuelId =
                    b.fuelId ||
                    oscillatingFuel?.id ||
                    (solution.fuel as { id?: string } | null)?.id;
                  const showBranchFuel =
                    Boolean(solution.isMixed) ||
                    (Boolean(b.fuelId) &&
                      oscillatingFuel?.id != null &&
                      b.fuelId !== oscillatingFuel.id);
                  const branchFuelMeta = branchFuelId
                    ? FUEL_OPTIONS.find((f) => f.id === branchFuelId) ||
                      SECONDARY_FUEL_OPTIONS.find((f) => f.id === branchFuelId)
                    : undefined;
                  const branchFuelLabel = branchFuelMeta
                    ? branchFuelMeta.name?.[locale] || branchFuelMeta.name?.en
                    : branchFuelId;
                  return (
                    <span
                      key={`${b.denominator}-${b.power}-${i}`}
                      className="inline-flex items-center gap-0.5"
                    >
                      {i > 0 ? (
                        <span className="text-endfield-text/50">+</span>
                      ) : null}
                      <span
                        className={
                          limited
                            ? "text-endfield-yellow font-semibold"
                            : undefined
                        }
                      >
                        {b.power.toFixed(0)}w
                      </span>
                      {showBranchFuel && branchFuelLabel ? (
                        <span className="text-[10px] leading-none text-endfield-text-light/80 border border-endfield-gray-light px-1 py-0.5 rounded-sm whitespace-nowrap">
                          {branchFuelLabel}
                        </span>
                      ) : null}
                      {limited ? (
                        <span className="text-[10px] leading-none text-endfield-yellow border border-endfield-yellow/50 bg-endfield-yellow/10 px-1 py-0.5 rounded-sm whitespace-nowrap">
                          {t("gateShort")} {b.limiterSpeed}/{t("itemPerMin")}
                        </span>
                      ) : null}
                    </span>
                  );
                })}
                <span>)</span>
              </span>
            </>
          ) : (
            <>
              <span className="text-sm text-endfield-text">=</span>
              <span className="text-sm font-bold text-endfield-text-light">
                0w
              </span>
            </>
          )}
          <div className="ml-auto flex items-center gap-2">
            <div className="inline-flex border border-endfield-gray-light bg-endfield-gray/80">
              <button
                type="button"
                disabled={!hasOscillating}
                onClick={() => setMode("blueprint")}
                className={`px-2 py-1 text-xs transition-colors ${
                  !hasOscillating
                    ? "text-endfield-text/40 cursor-not-allowed"
                    : mode === "blueprint"
                    ? "text-endfield-yellow bg-endfield-yellow/10"
                    : "text-endfield-text-light hover:text-endfield-yellow"
                }`}
              >
                {t("blueprintMode")}
              </button>
              <button
                type="button"
                disabled={!hasOscillating}
                onClick={() => setMode("simple")}
                className={`px-2 py-1 text-xs border-l border-endfield-gray-light transition-colors ${
                  !hasOscillating
                    ? "text-endfield-text/40 cursor-not-allowed"
                    : mode === "simple"
                    ? "text-endfield-yellow bg-endfield-yellow/10"
                    : "text-endfield-text-light hover:text-endfield-yellow"
                }`}
              >
                {t("simpleMode")}
              </button>
            </div>
          </div>
        </div>

        {hasOscillating ? (
          <div className="relative">
            {canExportBlueprint && (
              <div className="absolute bottom-2 right-2 z-10">
                <button
                  type="button"
                  onClick={handleOpenExportModal}
                  className="inline-flex items-center gap-1.5 px-2 py-1 text-xs border border-endfield-gray-light text-endfield-text-light bg-endfield-gray/90 hover:text-endfield-yellow hover:border-endfield-yellow transition-colors"
                  title={t("exportBlueprintJson")}
                  aria-label={t("exportBlueprintJson")}
                >
                  <Icon name="download" className="w-4 h-4" />
                  <span className="hidden sm:inline">
                    {t("exportBlueprintJson")}
                  </span>
                </button>
              </div>
            )}

            <div
              className={`flex gap-3 p-2 sm:p-3 ${
                mode === "simple" ? "flex-col" : "flex-wrap justify-center"
              }`}
            >
              {oscillating.map((branch, idx) => (
                <div
                  key={`${branch.denominator}-${branch.power}-${
                    branch.phaseOffsetCells ?? 0
                  }-${idx}`}
                  className={
                    mode === "simple" ? "w-full" : "min-w-[min(100%,360px)]"
                  }
                  style={
                    mode === "blueprint" ? { zoom: blueprintZoom } : undefined
                  }
                >
                  {mode === "simple" ? (
                    <SimpleBranch
                      branch={branch}
                      t={t}
                      locale={locale}
                      showFuelLabel={
                        Boolean(solution.isMixed) ||
                        Boolean(
                          branch.fuelId &&
                            oscillatingFuel?.id &&
                            branch.fuelId !== oscillatingFuel.id
                        )
                      }
                    />
                  ) : (
                    <BlueprintBranch
                      branch={branch}
                      zoom={blueprintZoom}
                      onWheelZoom={handleBlueprintWheel}
                      onTouchStart={handleBlueprintTouchStart}
                      onTouchMove={handleBlueprintTouchMove}
                      onTouchEnd={handleBlueprintTouchEnd}
                    />
                  )}
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="p-2 sm:p-3 text-xs text-endfield-text/70">
            {t("noOscillatingBranchHint")}
          </div>
        )}
      </div>

      {hasOscillating && (
        <div className="border border-endfield-gray-light bg-endfield-gray/20 p-3 sm:p-4 space-y-4">
          <div>
            <div className="flex items-center justify-between gap-2 mb-2">
              <div className="text-xs font-bold text-endfield-text uppercase tracking-widest">
                {t("diagramLegend")}
              </div>
              <div className="text-[10px] sm:text-xs text-endfield-text/60">
                {mode === "blueprint" ? t("blueprintMode") : t("simpleMode")}
              </div>
            </div>
            {mode === "blueprint" ? (
              <BlueprintLegend t={t} />
            ) : (
              <SimpleLegend t={t} />
            )}
          </div>

          <div className="pt-3 border-t border-endfield-gray-light/70">
            <div className="flex items-center justify-between gap-2 mb-2">
              <div className="text-xs font-bold text-endfield-text uppercase tracking-widest">
                {t("diagramTutorial")}
              </div>
              <div className="text-[10px] sm:text-xs text-endfield-text/60">
                {mode === "blueprint" ? t("blueprintMode") : t("simpleMode")}
              </div>
            </div>
            <ol className="list-decimal list-inside space-y-1 text-xs text-endfield-text/80">
              <li>{t("diagramTutorialStep1")}</li>
              <li>{t("diagramTutorialStep2")}</li>
              <li>
                {mode === "blueprint"
                  ? t("diagramTutorialBlueprint")
                  : t("diagramTutorialSimple")}
              </li>
              <li>{t("diagramTutorialStep4")}</li>
            </ol>
          </div>
        </div>
      )}

      <BlueprintExportModal
        show={Boolean(hasOscillating && exportModalOpen)}
        t={t}
        branches={oscillating ?? []}
        onClose={handleCloseExportModal}
        onExportJson={handleExportSingleBranch}
        onExportPng={handleExportSingleBranchPng}
        onExportAllZip={handleExportAllBranchesZip}
        onExportCompleteImage={handleExportCompleteImage}
        preparingCompleteImage={preparingCompleteImage}
      />

      <ImagePreviewModal
        show={imagePreviewOpen}
        onClose={handleCloseImagePreview}
        blob={imagePreviewBlob}
        fileName={imagePreviewFileName}
        title={imagePreviewTitle}
      />
    </div>
  );
}
