import { useCallback, useEffect, useRef, useState } from "react";
import Footer from "./components/Footer";
import Header from "./components/layout/Header";
import Sidebar from "./components/layout/Sidebar";
import Announcement, {
  shouldShowAnnouncement,
} from "./components/modals/Announcement";
import ErrorState from "./components/modals/ErrorState";
import PrivacyPolicyModal from "./components/modals/PrivacyPolicyModal";
import QAModal from "./components/modals/QAModal";
import ShareModal from "./components/modals/ShareModal";
import DirtyOverlay from "./components/overlays/DirtyOverlay";
import LoadingOverlay from "./components/overlays/LoadingOverlay";
import ShareStatusToast from "./components/overlays/ShareStatusToast";
import UpdateToast from "./components/overlays/UpdateToast";
import SolutionList from "./components/solution/SolutionList";
import { I18nProvider, useI18n } from "./i18n";
import type { CalcParams, SolutionResult } from "./types/calc";
import type { WorkerResponse } from "./utils/factoryDesigner.worker";
import {
  diagnoseNoSolution,
  type DiagnosisResult,
} from "./utils/failureDiagnose";
import {
  buildShareUrl,
  getShareParamsFromUrl,
  type ShareParams,
} from "./utils/shareParams";

const getRandomTargetPower = () => Math.floor(Math.random() * 4500) + 500;
const PRIVACY_FOOTER_DISMISSED_KEY = "dige-privacy-footer-dismissed";
const SHARE_STATUS_VISIBLE_MS = 1800;
const SHARE_STATUS_FADE_MS = 220;
const DEFAULT_PARAMS: CalcParams = {
  /** 中期玩家常用：约 5.8kW 电网 */
  targetPower: 5800,
  minBatteryPercent: 5,
  maxWaste: 300,
  maxBranches: 3,
  phaseOffsetBranch1: 0,
  phaseOffsetBranch2: 0,
  phaseOffsetBranch3: 0,
  excludeBelt: true,
  /** 排除物品准入口限速器：false=默认关=启用限速求解；true=开=忽略限速/满速 */
  excludeItemGateLimiter: false,
  /** 中容武陵 + 高容谷地，智能混编 + 自动常驻 */
  primaryFuelId: "wulingMid",
  secondaryFuelId: "valleyHigh",
  inputSourceId: "warehouse",
  multiFuelMode: "auto",
  autoPlanBasePools: true,
};

const getInitialParams = (): CalcParams => {
  if (typeof window === "undefined") return DEFAULT_PARAMS;
  const sharedParams = getShareParamsFromUrl();
  return sharedParams
    ? ({ ...DEFAULT_PARAMS, ...sharedParams } as CalcParams)
    : DEFAULT_PARAMS;
};

interface AppContentProps {
  onOpenAnnouncement: (tab: string) => void;
  onOpenPrivacyPolicy: () => void;
  onOpenQA: () => void;
}

function AppContent({
  onOpenAnnouncement,
  onOpenPrivacyPolicy,
  onOpenQA,
}: AppContentProps) {
  const { t } = useI18n();
  const [params, setParams] = useState<CalcParams>(getInitialParams);
  const [shareStatusMessage, setShareStatusMessage] = useState("");
  const [shareStatusVisible, setShareStatusVisible] = useState(false);
  const shareStatusTimer = useRef<{
    hide: ReturnType<typeof setTimeout> | null;
    clear: ReturnType<typeof setTimeout> | null;
    frame: number | null;
  }>({ hide: null, clear: null, frame: null });
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [shareUrl, setShareUrl] = useState("");

  const [solutions, setSolutions] = useState<SolutionResult[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [showError, setShowError] = useState(false);
  const [lastDiagnosis, setLastDiagnosis] = useState<DiagnosisResult | null>(
    null
  );
  const [showPrivacyFooter, setShowPrivacyFooter] = useState(() => {
    if (typeof window === "undefined") return true;
    return localStorage.getItem(PRIVACY_FOOTER_DISMISSED_KEY) !== "1";
  });
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [paramsDirty, setParamsDirty] = useState(false);
  const [showDirtyOverlay, setShowDirtyOverlay] = useState(false);
  const [dirtyDismissed, setDirtyDismissed] = useState(false);
  const lastCalcParamsRef = useRef<CalcParams | null>(null);
  const hasAutoCalculatedRef = useRef(false);
  const workerRef = useRef<Worker | null>(null);

  const setParamsWithDirty = useCallback(
    (updater: React.SetStateAction<CalcParams>) => {
      setParams(updater);
      setParamsDirty(true);
      setDirtyDismissed(false);
    },
    []
  );

  const runCalculation = useCallback(
    async (overrideParams: CalcParams | null = null) => {
      setIsLoading(true);
      setShowError(false);

      const calcParams = overrideParams || params;

      workerRef.current?.terminate();

      const worker = new Worker(
        new URL("./utils/factoryDesigner.worker.ts", import.meta.url),
        {
          type: "module",
        }
      );
      workerRef.current = worker;

      try {
        const results = await new Promise<SolutionResult[]>(
          (resolve, reject) => {
            worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
              const data = event.data;
              if (data.type === "result") {
                resolve(data.solutions);
              } else {
                reject(new Error(data.message));
              }
            };
            worker.onerror = (error) => {
              reject(new Error(error.message || "Worker error"));
            };
            worker.postMessage({ type: "solve", params: calcParams });
          }
        );

        setIsLoading(false);

        if (!results || results.length === 0) {
          const diagnosis = diagnoseNoSolution(calcParams, t);
          setLastDiagnosis(diagnosis);
          setShowError(true);
          setSolutions([]);
          return;
        }

        setLastDiagnosis(null);
        setSolutions(results);
        setSelectedIndex(0);
        setParamsDirty(false);
        setShowDirtyOverlay(false);
        setDirtyDismissed(false);
        lastCalcParamsRef.current = { ...calcParams };
      } catch (error) {
        console.error("Calculation failed:", error);
        setIsLoading(false);
        setLastDiagnosis(null);
        setShowError(true);
        setSolutions([]);
      } finally {
        worker.terminate();
        if (workerRef.current === worker) {
          workerRef.current = null;
        }
      }
    },
    [params, t]
  );

  useEffect(() => {
    return () => {
      workerRef.current?.terminate();
    };
  }, []);

  useEffect(() => {
    return () => {
      if (shareStatusTimer.current.hide)
        clearTimeout(shareStatusTimer.current.hide);
      if (shareStatusTimer.current.clear)
        clearTimeout(shareStatusTimer.current.clear);
      if (
        shareStatusTimer.current.frame &&
        typeof cancelAnimationFrame === "function"
      ) {
        cancelAnimationFrame(shareStatusTimer.current.frame);
      }
    };
  }, []);

  const showShareStatus = useCallback((message: string) => {
    if (!message) return;
    if (shareStatusTimer.current.hide)
      clearTimeout(shareStatusTimer.current.hide);
    if (shareStatusTimer.current.clear)
      clearTimeout(shareStatusTimer.current.clear);
    if (
      shareStatusTimer.current.frame &&
      typeof cancelAnimationFrame === "function"
    ) {
      cancelAnimationFrame(shareStatusTimer.current.frame);
    }

    setShareStatusMessage(message);
    setShareStatusVisible(false);
    if (
      typeof window !== "undefined" &&
      typeof window.requestAnimationFrame === "function"
    ) {
      shareStatusTimer.current.frame = window.requestAnimationFrame(() =>
        setShareStatusVisible(true)
      );
    } else {
      setShareStatusVisible(true);
    }

    shareStatusTimer.current.hide = setTimeout(
      () => setShareStatusVisible(false),
      SHARE_STATUS_VISIBLE_MS
    );
    shareStatusTimer.current.clear = setTimeout(
      () => setShareStatusMessage(""),
      SHARE_STATUS_VISIBLE_MS + SHARE_STATUS_FADE_MS
    );
  }, []);

  const getCopyErrorReason = useCallback(
    (error: Error) => {
      const name = error?.name || "";
      if (name === "NotAllowedError") return t("copyFailedReasonPermission");
      if (name === "SecurityError") return t("copyFailedReasonInsecure");
      if (name === "NotFoundError") return t("copyFailedReasonUnavailable");
      return t("copyFailedReasonUnknown");
    },
    [t]
  );

  const handleOpenShareModal = useCallback(() => {
    const nextUrl = buildShareUrl(params as ShareParams);
    if (!nextUrl) {
      showShareStatus(t("shareFailed"));
      return;
    }

    window.history.replaceState({}, "", nextUrl);
    setShareUrl(nextUrl);
    setShareModalOpen(true);
  }, [params, showShareStatus, t]);

  const handleCloseShareModal = useCallback(() => {
    setShareModalOpen(false);
  }, []);

  const handleCopyShareUrl = useCallback(async () => {
    if (!shareUrl) {
      showShareStatus(t("shareFailed"));
      return;
    }

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareUrl);
        showShareStatus(t("shareCopied"));
      } else {
        window.prompt(t("shareCopyPrompt"), shareUrl);
        showShareStatus(t("shareCopied"));
      }
    } catch (error) {
      console.error("Share error:", error);
      const reason = getCopyErrorReason(error as Error);
      showShareStatus(`${t("copyFailed")}: ${reason}`);
    }
  }, [shareUrl, showShareStatus, t, getCopyErrorReason]);

  const handleNativeShare = useCallback(async () => {
    if (!shareUrl || !navigator.share) return;
    try {
      await navigator.share({ title: document.title, url: shareUrl });
    } catch (error) {
      if ((error as Error)?.name === "AbortError") return;
      console.error("Share error:", error);
      showShareStatus(t("shareFailed"));
    }
  }, [shareUrl, showShareStatus, t]);

  const handleRandomCalculate = useCallback(() => {
    const newPower = getRandomTargetPower();
    const newParams = { ...params, targetPower: newPower };
    setParams(newParams);
    runCalculation(newParams);
  }, [params, runCalculation]);

  useEffect(() => {
    if (hasAutoCalculatedRef.current) return;
    hasAutoCalculatedRef.current = true;
    const timer = setTimeout(() => {
      runCalculation();
    }, 300);
    return () => clearTimeout(timer);
  }, [runCalculation]);

  const handleDismissPrivacyFooter = () => {
    setShowPrivacyFooter(false);
    localStorage.setItem(PRIVACY_FOOTER_DISMISSED_KEY, "1");
  };

  return (
    <div className="bg-endfield-black text-endfield-text-light font-sans h-screen flex flex-col overflow-hidden">
      <Header
        onCalculate={runCalculation}
        onShare={handleOpenShareModal}
        onShowStatus={showShareStatus}
        sidebarCollapsed={sidebarCollapsed}
        onToggleSidebar={() => setSidebarCollapsed(!sidebarCollapsed)}
        onOpenAnnouncement={onOpenAnnouncement}
        onOpenPrivacyPolicy={onOpenPrivacyPolicy}
        onOpenQA={onOpenQA}
      />

      <ShareStatusToast
        message={shareStatusMessage}
        visible={shareStatusVisible}
      />

      <div className="flex-1 flex overflow-hidden">
        <Sidebar
          params={params}
          setParams={setParamsWithDirty}
          collapsed={sidebarCollapsed}
          onClose={() => setSidebarCollapsed(true)}
          onCalculate={runCalculation}
          onRandomCalculate={handleRandomCalculate}
          onOpenAnnouncement={onOpenAnnouncement}
          onOpenPrivacyPolicy={onOpenPrivacyPolicy}
          onOpenQA={onOpenQA}
        />

        <section
          aria-label={t("mainContentArea")}
          className="flex-1 overflow-hidden border-0 p-0 m-0 min-w-0 bg-[radial-gradient(circle_at_85%_20%,rgba(255,250,0,0.08),transparent_40%),repeating-linear-gradient(135deg,rgba(255,250,0,0.04)_0_1px,transparent_1px_14px),linear-gradient(180deg,rgba(255,250,0,0.02),transparent_35%,rgba(255,250,0,0.015))] relative"
          onMouseEnter={() =>
            paramsDirty && !dirtyDismissed && setShowDirtyOverlay(true)
          }
          onMouseLeave={() => setShowDirtyOverlay(false)}
        >
          <main className="mx-auto w-full max-w-[1800px] h-full flex flex-col min-w-0 bg-endfield-black/92 backdrop-blur-[1px] relative overflow-hidden">
            <SolutionList
              solutions={solutions}
              selectedIndex={selectedIndex}
              onSelectSolution={setSelectedIndex}
              params={params}
              diagnosis={lastDiagnosis}
            />

            <LoadingOverlay isLoading={isLoading} />
          </main>

          <DirtyOverlay
            show={showDirtyOverlay && paramsDirty}
            canRestore={!!lastCalcParamsRef.current}
            onCalculate={() => {
              runCalculation();
              setShowDirtyOverlay(false);
            }}
            onRestore={() => {
              if (lastCalcParamsRef.current) {
                setParams({ ...lastCalcParamsRef.current });
              }
              setParamsDirty(false);
              setShowDirtyOverlay(false);
            }}
            onDismiss={() => {
              setShowDirtyOverlay(false);
              setDirtyDismissed(true);
            }}
          />
        </section>
      </div>

      <Footer
        show={showPrivacyFooter}
        onDismiss={handleDismissPrivacyFooter}
        onOpenPrivacyPolicy={onOpenPrivacyPolicy}
      />

      <ShareModal
        show={shareModalOpen}
        shareUrl={shareUrl}
        onClose={handleCloseShareModal}
        onCopy={handleCopyShareUrl}
        onShare={handleNativeShare}
        closeOnBackdrop={true}
      />
      <ErrorState
        show={showError}
        onDismiss={() => setShowError(false)}
        closeOnBackdrop={false}
        diagnosis={lastDiagnosis}
      />
    </div>
  );
}

function App() {
  const [showAnnouncement, setShowAnnouncement] = useState(() =>
    shouldShowAnnouncement()
  );
  const [announcementInitialTab, setAnnouncementInitialTab] =
    useState("announcement");
  const [showPrivacyPolicy, setShowPrivacyPolicy] = useState(false);
  const [showQA, setShowQA] = useState(false);

  const openAnnouncement = (initialTab = "announcement") => {
    setAnnouncementInitialTab(initialTab);
    setShowAnnouncement(true);
  };

  return (
    <I18nProvider>
      <AppContent
        onOpenAnnouncement={openAnnouncement}
        onOpenPrivacyPolicy={() => setShowPrivacyPolicy(true)}
        onOpenQA={() => setShowQA(true)}
      />
      <Announcement
        show={showAnnouncement}
        initialTab={announcementInitialTab}
        onClose={() => setShowAnnouncement(false)}
        closeOnBackdrop={false}
      />
      <PrivacyPolicyModal
        show={showPrivacyPolicy}
        onClose={() => setShowPrivacyPolicy(false)}
        closeOnBackdrop={true}
      />
      <QAModal
        show={showQA}
        onClose={() => setShowQA(false)}
        closeOnBackdrop={true}
      />
      <UpdateToast />
    </I18nProvider>
  );
}

export default App;
