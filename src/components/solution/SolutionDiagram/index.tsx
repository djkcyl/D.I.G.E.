import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "../../../i18n";
import type { CalcParams, SolutionResult } from "../../../types/calc";
import {
  FUEL_OPTIONS,
  INPUT_SOURCE_OPTIONS,
  resolveFuel,
  SECONDARY_FUEL_OPTIONS,
} from "../../../utils/constants";
import {
  buildEndfieldBlueprintPng,
  buildEndfieldCompleteImage,
  downloadEndfieldBlueprint,
  downloadEndfieldBlueprintZip,
} from "../../../utils/endfieldBlueprint";
import { buildBranchBlueprint } from "../../../utils/FactoryDesigner";
import {
  branchDeviceCount,
  deviceCostOfDenominator,
  poolPowerForRate,
} from "../../../utils/oscBudget";
import { buildShareUrl, type ShareParams } from "../../../utils/shareParams";
import Icon from "../../ui/Icon";
import ImagePreviewModal from "../../ui/ImagePreview/ImagePreviewModal";
import BlueprintBranch from "./BlueprintBranch";
import BlueprintExportModal from "./BlueprintExportModal";
import BlueprintLegend from "./BlueprintLegend";
import DiagramConfig from "./DiagramConfig";
import PoolBandDiagram from "./PoolBandDiagram";
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
  /** 自定义震荡池单独一份模式，跟随全局切换，但可单独改 */
  const [poolMode, setPoolMode] = useState<"blueprint" | "simple">("blueprint");
  const [blueprintZoom, setBlueprintZoom] = useState(1);
  // 全局模式切换时，池子模式跟着走（之后仍可单独改）
  useEffect(() => {
    setPoolMode(mode);
  }, [mode]);
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
    [],
  );

  const handleBlueprintWheel = useCallback(
    (e: React.WheelEvent) => {
      if (mode !== "blueprint") return;
      e.preventDefault();
      const delta = -e.deltaY * 0.002;
      setBlueprintZoom((z) => clampZoom(z + delta));
    },
    [mode, clampZoom],
  );

  const handleBlueprintTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (mode !== "blueprint" || e.touches.length !== 2) return;
      const dist = Math.hypot(
        e.touches[1].clientX - e.touches[0].clientX,
        e.touches[1].clientY - e.touches[0].clientY,
      );
      pinchRef.current = { initialDistance: dist, initialZoom: blueprintZoom };
    },
    [mode, blueprintZoom],
  );

  const handleBlueprintTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (e.touches.length !== 2 || !pinchRef.current.initialDistance) return;
      e.preventDefault();
      const dist = Math.hypot(
        e.touches[1].clientX - e.touches[0].clientX,
        e.touches[1].clientY - e.touches[0].clientY,
      );
      const { initialDistance, initialZoom } = pinchRef.current;
      const scale = dist / initialDistance;
      setBlueprintZoom(clampZoom(initialZoom * scale));
    },
    [clampZoom],
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
    [t],
  );

  const oscillating = solution?.oscillating ?? [];
  const oscillatingFuel = solution?.oscillatingFuel as
    | { id?: string; name?: Record<string, string> }
    | undefined
    | null;
  const inputSourceId = solution?.inputSourceId;
  const excludeBelt = solution?.excludeBelt;
  const showPackerWarning = inputSourceId === "packer";
  const showExcludeBeltWarning = excludeBelt === false;
  const hasOscillating = Array.isArray(oscillating) && oscillating.length > 0;

  /** 按分支燃料聚合表头文案，避免混合方案误显示「N × 单一 oscillatingFuel」 */
  const oscillatingHeaderFuelLabel = useMemo(() => {
    if (!hasOscillating) return "";

    const fallbackFuelId =
      oscillatingFuel?.id ||
      (solution?.fuel as { id?: string } | null | undefined)?.id;
    const fallbackFuelName =
      oscillatingFuel?.name?.[locale] ||
      oscillatingFuel?.name?.en ||
      (solution?.fuel as { name?: Record<string, string> } | null | undefined)
        ?.name?.[locale] ||
      (solution?.fuel as { name?: Record<string, string> } | null | undefined)
        ?.name?.en ||
      "";

    const groups = new Map<string, { count: number; label: string }>();
    for (const branch of oscillating) {
      const fuelId = branch.fuelId || fallbackFuelId || "__unknown__";
      const meta =
        FUEL_OPTIONS.find((f) => f.id === fuelId) ||
        SECONDARY_FUEL_OPTIONS.find((f) => f.id === fuelId);
      const label =
        meta?.name?.[locale] ||
        meta?.name?.en ||
        (fuelId !== "__unknown__" ? fuelId : fallbackFuelName) ||
        fallbackFuelName ||
        fuelId;
      const prev = groups.get(fuelId);
      if (prev) {
        prev.count += 1;
      } else {
        groups.set(fuelId, { count: 1, label });
      }
    }

    const parts = Array.from(groups.values()).map(
      (g) => `${g.count}×${g.label}`,
    );
    // 单燃料：保留「x 燃料名」由外层 count 展示；这里只返回燃料名
    // 多燃料：返回完整「1×A + 1×B」，外层不再重复写单一燃料名
    if (groups.size <= 1) {
      return parts[0]?.replace(/^\d+×/, "") || fallbackFuelName;
    }
    return parts.join(" + ");
  }, [hasOscillating, locale, oscillating, oscillatingFuel, solution?.fuel]);

  const oscillatingHasMultipleFuels = useMemo(() => {
    if (!hasOscillating) return false;
    const fallbackFuelId =
      oscillatingFuel?.id ||
      (solution?.fuel as { id?: string } | null | undefined)?.id;
    const ids = new Set(
      oscillating.map((b) => b.fuelId || fallbackFuelId || "__unknown__"),
    );
    return (
      Boolean(solution?.isMixed) ||
      ids.size > 1 ||
      oscillating.some(
        (b) =>
          Boolean(b.fuelId) &&
          oscillatingFuel?.id != null &&
          b.fuelId !== oscillatingFuel.id,
      )
    );
  }, [
    hasOscillating,
    oscillating,
    oscillatingFuel,
    solution?.fuel,
    solution?.isMixed,
  ]);
  /** 自定义震荡池：每条按吸附后的分母出一支图 */
  const poolRows = useMemo(() => {
    const rows: Array<{
      id: string;
      watt: number;
      perMinute: number;
      fullBands: number;
      bandsSummary: string;
      bandWatt: number;
      bandPorts: number;
      bandSplitters: number;
      bandPerMinute: number;
      bandDeviceCost: number;
      remainderPerMin: number;
      remainderWatt: number;
      remainderDeviceCost: number;
      remainderDenominator: number | null;
      bands: number;
      bandBranch: {
        denominator: number;
        power: number;
        fuelId: string;
        phaseOffsetCells: number;
        splitterCount: { split2: number; split3: number; total: number };
        blueprint: (Record<string, unknown> | null)[][];
        description: string;
      } | null;
      deviceCost: number;
      fuelId: string;
      branch: {
        denominator: number;
        power: number;
        fuelId: string;
        phaseOffsetCells: number;
        splitterCount: { split2: number; split3: number; total: number };
        blueprint: (Record<string, unknown> | null)[][];
        description: string;
      } | null;
    }> = [];
    for (const pool of params.oscPools ?? []) {
      if (!pool || pool.enabled === false) continue;
      if (!pool.fuelId || pool.fuelId === "none") continue;
      const fuel = resolveFuel(pool.fuelId);
      const perMin = Number(pool.maxPerMin) || 0;
      if (!fuel || !(perMin > 0)) continue;
      const rated = poolPowerForRate(fuel, perMin, {
        deviceLimit: pool.deviceLimit,
      });
      const cost =
        rated.remainderDenominator != null
          ? deviceCostOfDenominator(rated.remainderDenominator)
          : null;
      const split2 = cost?.two ?? 0;
      const split3 = cost?.three ?? 0;
      rows.push({
        id: pool.id,
        watt: rated.watt,
        perMinute: perMin,
        fullBands: rated.bands.generators,
        bandsSummary:
          rated.bands.generators > 0
            ? t("oscPoolBandBreakdown", {
                ports: rated.bands.ports,
                splitters: rated.bands.splitters,
                generators: rated.bands.generators,
              })
            : "",
        bandWatt: rated.bands.watt,
        bandPorts: rated.bands.ports,
        bandSplitters: rated.bands.splitters,
        bandPerMinute: 60 / Math.max(fuel.burnTime, 1e-9),
        bandDeviceCost: rated.bands.deviceCost,
        remainderPerMin: rated.remainderPerMin,
        remainderWatt: rated.remainderWatt,
        remainderDeviceCost: rated.remainderDeviceCost,
        remainderDenominator: rated.remainderDenominator,
        bands: rated.bands.generators,
        bandBranch:
          rated.bands.generators === 1
            ? {
                denominator: 1,
                power: rated.bands.watt,
                fuelId: fuel.id,
                phaseOffsetCells: 0,
                splitterCount: { split2: 0, split3: 0, total: 0 },
                blueprint: buildBranchBlueprint(
                  0,
                  0,
                  Boolean(solution?.excludeBelt),
                ),
                description: `${(60 / Math.max(fuel.burnTime, 1e-9)).toFixed(2)}${t("itemPerMin")} · ${t("diagramDevices")} ${rated.bands.deviceCost}`,
              }
            : null,
        deviceCost: rated.deviceCost,
        fuelId: fuel.id,
        branch:
          rated.remainderDenominator != null
            ? {
                denominator: rated.remainderDenominator,
                power: rated.remainderWatt,
                fuelId: fuel.id,
                phaseOffsetCells: 0,
                splitterCount: { split2, split3, total: split2 + split3 },
                blueprint: buildBranchBlueprint(
                  split3,
                  split2,
                  Boolean(solution?.excludeBelt),
                ),
                description: `${rated.maxPerMin.toFixed(2)}${t("itemPerMin")} · ${t("diagramDevices")} ${branchDeviceCount(split2, split3, 0, false)}`,
              }
            : null,
      });
    }
    return rows;
  }, [params.oscPools, solution?.excludeBelt, t]);

  const canExportBlueprint = mode === "blueprint" && hasOscillating;

  /** 方案设备占用：每支 取货口1 + 存货口2 + 热能池1 + 分流器/汇流器各1 */
  const totalDeviceCount = useMemo(() => {
    if (!hasOscillating) return 0;
    return oscillating.reduce((sum, branch) => {
      const split2 = branch.splitterCount?.split2 ?? 0;
      const split3 = branch.splitterCount?.split3 ?? 0;
      return (
        sum +
        branchDeviceCount(split2, split3, 0, Boolean(branch.requiresLimiter))
      );
    }, 0);
  }, [hasOscillating, oscillating]);
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
    [oscillating],
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
    [openImagePreview, oscillating, t],
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
        FUEL_OPTIONS.map((option) => [option.id, getLocalizedName(option)]),
      );
      const secondaryFuelNameMap = Object.fromEntries(
        SECONDARY_FUEL_OPTIONS.map((option) => [
          option.id,
          getLocalizedName(option),
        ]),
      );
      const inputSourceNameMap = Object.fromEntries(
        INPUT_SOURCE_OPTIONS.map((option) => [
          option.id,
          getLocalizedName(option),
        ]),
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
          {!hasOscillating || !oscillatingHasMultipleFuels ? (
            <span className="text-sm font-bold text-endfield-text-light">
              {hasOscillating ? oscillating.length : 0}
            </span>
          ) : null}
          {hasOscillating ? (
            <>
              <span className="text-sm text-endfield-text">
                {oscillatingHasMultipleFuels ? (
                  oscillatingHeaderFuelLabel
                ) : (
                  <>
                    x{" "}
                    {oscillatingHeaderFuelLabel ||
                      oscillatingFuel?.name?.[locale] ||
                      oscillatingFuel?.name?.en ||
                      (solution.fuel as { name?: Record<string, string> })
                        ?.name?.[locale] ||
                      (solution.fuel as { name?: Record<string, string> })?.name
                        ?.en}
                  </>
                )}
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
                <span className="text-sm font-bold text-endfield-text-light">
                  · {t("diagramDevices")} {totalDeviceCount}
                </span>
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
                            branch.fuelId !== oscillatingFuel.id,
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

      {/* 第三行：自定义震荡池（用户自选的电池 + 预算，复用震荡支路画法） */}
      {poolRows.length > 0 ? (
        <div className="border border-endfield-gray-light bg-endfield-gray/20">
          <div className="flex flex-wrap items-center gap-2 p-3 border-b border-endfield-gray-light bg-endfield-gray/50">
            <Icon name="insights" className="text-endfield-yellow" />
            <span className="text-sm text-endfield-text uppercase">
              {t("oscPool")}:
            </span>
            <span className="text-sm font-bold text-endfield-text-light">
              {poolRows.reduce((sum, row) => sum + row.watt, 0).toFixed(0)}w
            </span>
            <span className="text-xs text-endfield-text/70 flex flex-wrap items-center gap-x-1 gap-y-0.5">
              <span>(</span>
              {poolRows.map((row, index) => (
                <span key={row.id} className="inline-flex items-center gap-1">
                  {index > 0 ? (
                    <span className="text-endfield-text/50">+</span>
                  ) : null}
                  {row.bands > 0 ? (
                    <span>
                      {row.fullBands} {t("oscPoolGenerators")}（I+T）·
                      {row.bandWatt.toFixed(0)}w
                    </span>
                  ) : null}
                  {row.remainderDenominator != null ? (
                    <span>
                      {row.remainderPerMin.toFixed(2)}
                      {t("itemPerMin")} · 1/{row.remainderDenominator} ·{" "}
                      {row.remainderWatt.toFixed(0)}w
                    </span>
                  ) : null}
                </span>
              ))}
              <span>)</span>
            </span>
            <span className="text-sm font-bold text-endfield-text-light">
              · {t("diagramDevices")}{" "}
              {poolRows.reduce((sum, row) => sum + row.deviceCost, 0)}
            </span>
            <div className="ml-auto inline-flex border border-endfield-gray-light bg-endfield-gray/80">
              <button
                type="button"
                onClick={() => setPoolMode("blueprint")}
                className={`px-2 py-1 text-xs transition-colors ${
                  poolMode === "blueprint"
                    ? "text-endfield-yellow bg-endfield-yellow/10"
                    : "text-endfield-text-light hover:text-endfield-yellow"
                }`}
              >
                {t("blueprintMode")}
              </button>
              <button
                type="button"
                onClick={() => setPoolMode("simple")}
                className={`px-2 py-1 text-xs border-l border-endfield-gray-light transition-colors ${
                  poolMode === "simple"
                    ? "text-endfield-yellow bg-endfield-yellow/10"
                    : "text-endfield-text-light hover:text-endfield-yellow"
                }`}
              >
                {t("simpleMode")}
              </button>
            </div>
          </div>
          <div className="p-2 sm:p-3 flex flex-wrap gap-4">
            {poolRows.map((row) => {
              const branch = row.branch;
              return (
                <div
                  key={row.id}
                  className={
                    poolMode === "blueprint"
                      ? "relative min-w-[min(100%,360px)] pb-8"
                      : "relative min-w-[min(100%,320px)] pb-8"
                  }
                  style={
                    poolMode === "blueprint"
                      ? { zoom: blueprintZoom }
                      : undefined
                  }
                >
                  {row.bands > 0 ? (
                    <div className="mb-2">
                      <PoolBandDiagram
                        ports={row.bandPorts}
                        splitters={row.bandSplitters}
                        generators={row.bands}
                        watt={row.bandWatt}
                        perMinute={row.bandPerMinute}
                      />
                    </div>
                  ) : null}
                  {!branch ? (
                    <div className="p-2 text-xs text-endfield-text/70">
                      {row.bandsSummary} · {row.watt.toFixed(0)}w
                    </div>
                  ) : poolMode === "blueprint" ? (
                    <BlueprintBranch
                      branch={branch}
                      zoom={blueprintZoom}
                      onWheelZoom={handleBlueprintWheel}
                      onTouchStart={handleBlueprintTouchStart}
                      onTouchMove={handleBlueprintTouchMove}
                      onTouchEnd={handleBlueprintTouchEnd}
                    />
                  ) : (
                    <SimpleBranch
                      branch={branch}
                      t={t}
                      locale={locale}
                      showFuelLabel
                    />
                  )}
                  {branch ? (
                    <div className="absolute bottom-2 right-2 z-10">
                      <button
                        type="button"
                        onClick={() => {
                          try {
                            downloadEndfieldBlueprint(branch, {
                              filename: `dige_pool_${row.id}_1_${branch.denominator}.json`,
                            });
                          } catch (error) {
                            console.error(
                              "Pool blueprint export failed:",
                              error,
                            );
                          }
                        }}
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
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

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
