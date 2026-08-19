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
import ImportProfileModal from "./components/modals/ImportProfileModal";
import SaveProfileModal from "./components/modals/SaveProfileModal";
import ShareModal from "./components/modals/ShareModal";
import DirtyOverlay from "./components/overlays/DirtyOverlay";
import LoadingOverlay from "./components/overlays/LoadingOverlay";
import ShareStatusToast from "./components/overlays/ShareStatusToast";
import UpdateToast from "./components/overlays/UpdateToast";
import SolutionList from "./components/solution/SolutionList";
import { I18nProvider, useI18n } from "./i18n";
import type { CalcParams, SolutionResult } from "./types/calc";
import type { ProfileModalMode, ProfilesStorageState } from "./types/profile";
import { DEFAULT_PARAMS } from "./utils/defaultParams";
import type { WorkerResponse } from "./utils/factoryDesigner.worker";
import {
  diagnoseNoSolution,
  type DiagnosisResult,
} from "./utils/failureDiagnose";
import {
  createProfileId,
  getActiveProfile,
  loadProfilesStorage,
  saveProfilesStorage,
} from "./utils/profileStorage";
import { buildGridCode } from "./utils/gridCode";
import {
  buildShareUrl,
  getShareParamsFromUrl,
  type ShareParams,
} from "./utils/shareParams";

const getRandomTargetPower = () => Math.floor(Math.random() * 4500) + 500;
const PRIVACY_FOOTER_DISMISSED_KEY = "dige-privacy-footer-dismissed";
const SHARE_STATUS_VISIBLE_MS = 1800;
const SHARE_STATUS_FADE_MS = 220;
const PROFILE_AUTOSAVE_MS = 300;

interface BootstrapState {
  params: CalcParams;
  profileState: ProfilesStorageState;
  isUrlSession: boolean;
}

const getBootstrapState = (): BootstrapState => {
  const profileState = loadProfilesStorage();
  if (typeof window === "undefined") {
    const active = getActiveProfile(profileState);
    return {
      params: active ? { ...active.params } : { ...DEFAULT_PARAMS },
      profileState,
      isUrlSession: false,
    };
  }
  const sharedParams = getShareParamsFromUrl();
  if (sharedParams) {
    return {
      params: { ...DEFAULT_PARAMS, ...sharedParams } as CalcParams,
      profileState,
      isUrlSession: true,
    };
  }
  const active = getActiveProfile(profileState);
  return {
    params: active ? { ...active.params } : { ...DEFAULT_PARAMS },
    profileState,
    isUrlSession: false,
  };
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
  const bootstrapRef = useRef<BootstrapState | null>(null);
  if (!bootstrapRef.current) {
    bootstrapRef.current = getBootstrapState();
  }
  const bootstrap = bootstrapRef.current;

  const [params, setParams] = useState<CalcParams>(() => bootstrap.params);
  const [profileState, setProfileState] = useState<ProfilesStorageState>(
    () => bootstrap.profileState
  );
  const [isUrlSession, setIsUrlSession] = useState(
    () => bootstrap.isUrlSession
  );
  const [shareStatusMessage, setShareStatusMessage] = useState("");
  const [shareStatusVisible, setShareStatusVisible] = useState(false);
  const shareStatusTimer = useRef<{
    hide: ReturnType<typeof setTimeout> | null;
    clear: ReturnType<typeof setTimeout> | null;
    frame: number | null;
  }>({ hide: null, clear: null, frame: null });
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [shareUrl, setShareUrl] = useState("");
  const [shareGridCode, setShareGridCode] = useState("");
  const [importModalOpen, setImportModalOpen] = useState(false);

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
  const skipNextAutosaveRef = useRef(true);

  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [profileModalMode, setProfileModalMode] =
    useState<ProfileModalMode>("saveAs");
  const [profileModalInitialName, setProfileModalInitialName] = useState("");
  const [renameTargetId, setRenameTargetId] = useState<string | null>(null);

  const commitProfileState = useCallback((next: ProfilesStorageState) => {
    setProfileState(next);
    saveProfilesStorage(next);
  }, []);

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
    const nextCode = buildGridCode(params as ShareParams);
    if (!nextUrl && !nextCode) {
      showShareStatus(t("shareFailed"));
      return;
    }

    if (nextUrl) {
      window.history.replaceState({}, "", nextUrl);
      setShareUrl(nextUrl);
    } else {
      setShareUrl("");
    }
    setShareGridCode(nextCode || "");
    setShareModalOpen(true);
  }, [params, showShareStatus, t]);

  const handleCloseShareModal = useCallback(() => {
    setShareModalOpen(false);
  }, []);

  const copyTextToClipboard = useCallback(
    async (text: string, successKey: string) => {
      if (!text) {
        showShareStatus(t("shareFailed"));
        return;
      }
      try {
        if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(text);
          showShareStatus(t(successKey));
        } else {
          window.prompt(t("shareCopyPrompt"), text);
          showShareStatus(t(successKey));
        }
      } catch (error) {
        console.error("Copy error:", error);
        const reason = getCopyErrorReason(error as Error);
        showShareStatus(`${t("copyFailed")}: ${reason}`);
      }
    },
    [showShareStatus, t, getCopyErrorReason]
  );

  const handleCopyShareUrl = useCallback(async () => {
    await copyTextToClipboard(shareUrl, "shareCopied");
  }, [shareUrl, copyTextToClipboard]);

  const handleCopyGridCode = useCallback(async () => {
    await copyTextToClipboard(shareGridCode, "gridCodeCopied");
  }, [shareGridCode, copyTextToClipboard]);

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

  /** 300ms 防抖自动写入当前激活存档（URL 会话跳过） */
  useEffect(() => {
    if (isUrlSession) return;
    if (skipNextAutosaveRef.current) {
      skipNextAutosaveRef.current = false;
      return;
    }
    const timer = setTimeout(() => {
      setProfileState((prev) => {
        const next: ProfilesStorageState = {
          ...prev,
          profiles: prev.profiles.map((p) =>
            p.id === prev.activeProfileId
              ? { ...p, params: { ...params }, updatedAt: Date.now() }
              : p
          ),
        };
        saveProfilesStorage(next);
        return next;
      });
    }, PROFILE_AUTOSAVE_MS);
    return () => clearTimeout(timer);
  }, [params, isUrlSession]);

  const clearUrlSessionFlag = useCallback(() => {
    setIsUrlSession(false);
    if (typeof window !== "undefined") {
      try {
        const url = new URL(window.location.href);
        if (url.searchParams.has("p")) {
          url.searchParams.delete("p");
          window.history.replaceState(
            {},
            "",
            url.pathname + url.search + url.hash
          );
        }
      } catch {
        /* ignore */
      }
    }
  }, []);

  const handleSelectProfile = useCallback(
    (id: string) => {
      const target = profileState.profiles.find((p) => p.id === id);
      if (!target) return;
      skipNextAutosaveRef.current = true;
      const nextParams = { ...target.params };
      const nextState: ProfilesStorageState = {
        ...profileState,
        activeProfileId: id,
      };
      commitProfileState(nextState);
      setParams(nextParams);
      setParamsDirty(false);
      setShowDirtyOverlay(false);
      setDirtyDismissed(false);
      clearUrlSessionFlag();
      runCalculation(nextParams);
    },
    [profileState, commitProfileState, clearUrlSessionFlag, runCalculation]
  );

  const openSaveAsModal = useCallback(() => {
    const active = getActiveProfile(profileState);
    setProfileModalMode("saveAs");
    setRenameTargetId(null);
    setProfileModalInitialName(active?.name ? `${active.name}` : "");
    setProfileModalOpen(true);
  }, [profileState]);

  const openRenameModal = useCallback(
    (id: string) => {
      const target = profileState.profiles.find((p) => p.id === id);
      if (!target) return;
      setProfileModalMode("rename");
      setRenameTargetId(id);
      setProfileModalInitialName(target.name);
      setProfileModalOpen(true);
    },
    [profileState]
  );

  const handleProfileModalConfirm = useCallback(
    (name: string) => {
      const now = Date.now();
      if (profileModalMode === "rename" && renameTargetId) {
        const next: ProfilesStorageState = {
          ...profileState,
          profiles: profileState.profiles.map((p) =>
            p.id === renameTargetId ? { ...p, name, updatedAt: now } : p
          ),
        };
        commitProfileState(next);
        return;
      }

      const newId = createProfileId();
      const newProfile = {
        id: newId,
        name,
        createdAt: now,
        updatedAt: now,
        params: { ...params },
      };
      const next: ProfilesStorageState = {
        ...profileState,
        activeProfileId: newId,
        profiles: [...profileState.profiles, newProfile],
      };
      skipNextAutosaveRef.current = true;
      commitProfileState(next);
      clearUrlSessionFlag();
      setParamsDirty(false);
    },
    [
      profileModalMode,
      renameTargetId,
      profileState,
      params,
      commitProfileState,
      clearUrlSessionFlag,
    ]
  );

  const handleDeleteProfile = useCallback(
    (id: string) => {
      if (profileState.profiles.length <= 1) return;
      const remaining = profileState.profiles.filter((p) => p.id !== id);
      if (remaining.length === 0) return;

      const deletedActive = profileState.activeProfileId === id;
      const nextActiveId = deletedActive
        ? remaining[0].id
        : profileState.activeProfileId;
      const next: ProfilesStorageState = {
        version: profileState.version,
        activeProfileId: nextActiveId,
        profiles: remaining,
      };
      commitProfileState(next);

      if (deletedActive) {
        const target =
          remaining.find((p) => p.id === nextActiveId) ?? remaining[0];
        skipNextAutosaveRef.current = true;
        const nextParams = { ...target.params };
        setParams(nextParams);
        setParamsDirty(false);
        setShowDirtyOverlay(false);
        setDirtyDismissed(false);
        clearUrlSessionFlag();
        runCalculation(nextParams);
      }
    },
    [profileState, commitProfileState, clearUrlSessionFlag, runCalculation]
  );

  const handleSaveUrlSessionToLocal = useCallback(() => {
    openSaveAsModal();
  }, [openSaveAsModal]);

  const openImportModal = useCallback(() => {
    setImportModalOpen(true);
  }, []);

  const handleImportConfirm = useCallback(
    ({
      name,
      params: importedShare,
      prefixMismatch,
      actualPower,
    }: {
      name: string;
      params: ShareParams;
      prefixMismatch: boolean;
      actualPower?: number;
    }) => {
      const now = Date.now();
      const newId = createProfileId();
      const nextParams = {
        ...DEFAULT_PARAMS,
        ...importedShare,
      } as CalcParams;
      const newProfile = {
        id: newId,
        name: name.slice(0, 32),
        createdAt: now,
        updatedAt: now,
        params: { ...nextParams },
      };
      const next: ProfilesStorageState = {
        ...profileState,
        activeProfileId: newId,
        profiles: [...profileState.profiles, newProfile],
      };
      skipNextAutosaveRef.current = true;
      commitProfileState(next);
      clearUrlSessionFlag();
      setParams(nextParams);
      setParamsDirty(false);
      setShowDirtyOverlay(false);
      setDirtyDismissed(false);
      runCalculation(nextParams);

      if (prefixMismatch) {
        const powerLabel =
          actualPower != null && Number.isFinite(actualPower)
            ? String(Math.round(actualPower))
            : String(nextParams.targetPower ?? "");
        showShareStatus(
          t("importCodePrefixMismatch").replace("{power}", powerLabel)
        );
      } else {
        showShareStatus(t("importCodeSuccess"));
      }
    },
    [
      profileState,
      commitProfileState,
      clearUrlSessionFlag,
      runCalculation,
      showShareStatus,
      t,
    ]
  );

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
              profile={{
                profiles: profileState.profiles,
                activeProfileId: profileState.activeProfileId,
                isUrlSession,
                onSelectProfile: handleSelectProfile,
                onSaveAs: openSaveAsModal,
                onRename: openRenameModal,
                onDelete: handleDeleteProfile,
                onSaveUrlSessionToLocal: handleSaveUrlSessionToLocal,
                onImportCode: openImportModal,
              }}
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
        gridCode={shareGridCode}
        onClose={handleCloseShareModal}
        onCopyUrl={handleCopyShareUrl}
        onCopyGridCode={handleCopyGridCode}
        onShare={handleNativeShare}
        closeOnBackdrop={true}
      />
      <ErrorState
        show={showError}
        onDismiss={() => setShowError(false)}
        closeOnBackdrop={false}
        diagnosis={lastDiagnosis}
      />
      <SaveProfileModal
        show={profileModalOpen}
        mode={profileModalMode}
        initialName={profileModalInitialName}
        onClose={() => setProfileModalOpen(false)}
        onConfirm={handleProfileModalConfirm}
      />
      <ImportProfileModal
        show={importModalOpen}
        onClose={() => setImportModalOpen(false)}
        onConfirm={handleImportConfirm}
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
