import { useState, useEffect, useCallback, useRef } from 'react';
import { I18nProvider, useI18n } from './i18n';
import Header from './components/Header';
import Sidebar from './components/Sidebar';
import SolutionList from './components/SolutionList';
import LoadingOverlay from './components/LoadingOverlay';
import ErrorState from './components/ErrorState';
import Announcement, { shouldShowAnnouncement } from './components/Announcement';
import PrivacyPolicyModal from './components/PrivacyPolicyModal';
import CloseButton from './components/CloseButton';
import ShareModal from './components/ShareModal';
import Icon from './components/Icon';
import { FactoryDesigner } from './utils/FactoryDesigner';
import { buildShareUrl, getShareParamsFromUrl } from './utils/shareParams';

// 生成随机目标发电量 (500 - 5000)
const getRandomTargetPower = () => Math.floor(Math.random() * 4500) + 500;
const PRIVACY_FOOTER_DISMISSED_KEY = 'dige-privacy-footer-dismissed';
const SHARE_STATUS_VISIBLE_MS = 1800;
const SHARE_STATUS_FADE_MS = 220;
const DEFAULT_PARAMS = {
  targetPower: 2656,
  minBatteryPercent: 5,
  maxWaste: 30,
  maxBranches: 3,
  primaryFuelId: 'wulingLow',
  secondaryFuelId: 'none',
  inputSourceId: 'warehouse',
};

const getInitialParams = () => {
  if (typeof window === 'undefined') return DEFAULT_PARAMS;
  const sharedParams = getShareParamsFromUrl();
  return sharedParams ? { ...DEFAULT_PARAMS, ...sharedParams } : DEFAULT_PARAMS;
};

function AppContent({ onOpenAnnouncement, onOpenPrivacyPolicy }) {
  const { t } = useI18n();
  const [params, setParams] = useState(getInitialParams);
  const [shareStatusMessage, setShareStatusMessage] = useState('');
  const [shareStatusVisible, setShareStatusVisible] = useState(false);
  const shareStatusTimer = useRef({ hide: null, clear: null, frame: null });
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [shareUrl, setShareUrl] = useState('');

  const [solutions, setSolutions] = useState([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [showError, setShowError] = useState(false);
  const [showPrivacyFooter, setShowPrivacyFooter] = useState(() => {
    if (typeof window === 'undefined') return true;
    return localStorage.getItem(PRIVACY_FOOTER_DISMISSED_KEY) !== '1';
  });
  // 默认展开侧边栏
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  // 追踪参数是否修改但未计算
  const [paramsDirty, setParamsDirty] = useState(false);
  const [showDirtyOverlay, setShowDirtyOverlay] = useState(false);
  const [dirtyDismissed, setDirtyDismissed] = useState(false);
  const lastCalcParamsRef = useRef(null);

  // 包装 setParams，自动标记脏状态
  const setParamsWithDirty = useCallback((updater) => {
    setParams(updater);
    setParamsDirty(true);
    setDirtyDismissed(false);
  }, []);

  const runCalculation = useCallback(async (overrideParams = null) => {
    setIsLoading(true);
    setShowError(false);

    // Allow UI to update
    await new Promise(r => setTimeout(r, 50));

    try {
      const calcParams = overrideParams || params;
      const designer = new FactoryDesigner(calcParams);
      const results = designer.solve();

      setIsLoading(false);

      if (!results || results.length === 0) {
        setShowError(true);
        setSolutions([]);
        return;
      }

      setSolutions(results);
      setSelectedIndex(0);
      setParamsDirty(false);
      setShowDirtyOverlay(false);
      setDirtyDismissed(false);
      lastCalcParamsRef.current = { ...calcParams };
    } catch (error) {
      console.error('Calculation error:', error);
      setIsLoading(false);
      setShowError(true);
      setSolutions([]);
      setParamsDirty(false);
      setShowDirtyOverlay(false);
      setDirtyDismissed(false);
    }
  }, [params]);

  useEffect(() => {
    return () => {
      if (shareStatusTimer.current.hide) clearTimeout(shareStatusTimer.current.hide);
      if (shareStatusTimer.current.clear) clearTimeout(shareStatusTimer.current.clear);
      if (shareStatusTimer.current.frame && typeof cancelAnimationFrame === 'function') {
        cancelAnimationFrame(shareStatusTimer.current.frame);
      }
    };
  }, []);

  const showShareStatus = useCallback((message) => {
    if (!message) return;
    if (shareStatusTimer.current.hide) clearTimeout(shareStatusTimer.current.hide);
    if (shareStatusTimer.current.clear) clearTimeout(shareStatusTimer.current.clear);
    if (shareStatusTimer.current.frame && typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(shareStatusTimer.current.frame);
    }

    setShareStatusMessage(message);
    setShareStatusVisible(false);
    if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
      shareStatusTimer.current.frame = window.requestAnimationFrame(() => setShareStatusVisible(true));
    } else {
      setShareStatusVisible(true);
    }

    shareStatusTimer.current.hide = setTimeout(() => setShareStatusVisible(false), SHARE_STATUS_VISIBLE_MS);
    shareStatusTimer.current.clear = setTimeout(
      () => setShareStatusMessage(''),
      SHARE_STATUS_VISIBLE_MS + SHARE_STATUS_FADE_MS
    );
  }, []);

  const getCopyErrorReason = useCallback((error) => {
    const name = error?.name || '';
    if (name === 'NotAllowedError') return t('copyFailedReasonPermission');
    if (name === 'SecurityError') return t('copyFailedReasonInsecure');
    if (name === 'NotFoundError') return t('copyFailedReasonUnavailable');
    return t('copyFailedReasonUnknown');
  }, [t]);

  const handleOpenShareModal = useCallback(() => {
    const nextUrl = buildShareUrl(params);
    if (!nextUrl) {
      showShareStatus(t('shareFailed'));
      return;
    }

    window.history.replaceState({}, '', nextUrl);
    setShareUrl(nextUrl);
    setShareModalOpen(true);
  }, [params, showShareStatus, t]);

  const handleCloseShareModal = useCallback(() => {
    setShareModalOpen(false);
  }, []);

  const handleCopyShareUrl = useCallback(async () => {
    if (!shareUrl) {
      showShareStatus(t('shareFailed'));
      return;
    }

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareUrl);
        showShareStatus(t('shareCopied'));
      } else {
        window.prompt(t('shareCopyPrompt'), shareUrl);
        showShareStatus(t('shareCopied'));
      }
    } catch (error) {
      console.error('Share error:', error);
      const reason = getCopyErrorReason(error);
      showShareStatus(`${t('copyFailed')}: ${reason}`);
    }
  }, [shareUrl, showShareStatus, t, getCopyErrorReason]);

  const handleNativeShare = useCallback(async () => {
    if (!shareUrl || !navigator.share) return;
    try {
      await navigator.share({ title: document.title, url: shareUrl });
    } catch (error) {
      if (error?.name === 'AbortError') return;
      console.error('Share error:', error);
      showShareStatus(t('shareFailed'));
    }
  }, [shareUrl, showShareStatus, t]);

  // 随机生成目标功率并立即计算
  const handleRandomCalculate = useCallback(() => {
    const newPower = getRandomTargetPower();
    const newParams = { ...params, targetPower: newPower };
    setParams(newParams);
    runCalculation(newParams);
  }, [params, runCalculation]);

  // Run calculation on initial load
  useEffect(() => {
    const timer = setTimeout(runCalculation, 300);
    return () => clearTimeout(timer);
  }, []);

  const handleDismissPrivacyFooter = () => {
    setShowPrivacyFooter(false);
    localStorage.setItem(PRIVACY_FOOTER_DISMISSED_KEY, '1');
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
        />

        {shareStatusMessage && (
          <div className="fixed top-3 left-1/2 -translate-x-1/2 z-[60] pointer-events-none">
            <div
              className={`bg-endfield-gray border border-endfield-yellow/50 text-endfield-yellow text-xs sm:text-sm px-3 py-2 shadow-[0_10px_30px_rgba(0,0,0,0.35)] transition-opacity duration-200 ease-out ${
                shareStatusVisible ? 'opacity-100' : 'opacity-0'
              }`}
              role="status"
              aria-live="polite"
            >
              {shareStatusMessage}
            </div>
          </div>
        )}

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
          />

          <div
            className="flex-1 overflow-hidden bg-[radial-gradient(circle_at_85%_20%,rgba(255,250,0,0.08),transparent_40%),repeating-linear-gradient(135deg,rgba(255,250,0,0.04)_0_1px,transparent_1px_14px),linear-gradient(180deg,rgba(255,250,0,0.02),transparent_35%,rgba(255,250,0,0.015))] relative"
            onMouseEnter={() => paramsDirty && !dirtyDismissed && setShowDirtyOverlay(true)}
            onMouseLeave={() => setShowDirtyOverlay(false)}
          >
            <main className="mx-auto w-full max-w-[1800px] h-full flex flex-col min-w-0 bg-endfield-black/92 backdrop-blur-[1px] relative overflow-hidden">
              <SolutionList
                solutions={solutions}
                selectedIndex={selectedIndex}
                onSelectSolution={setSelectedIndex}
                params={params}
              />

              <LoadingOverlay isLoading={isLoading} />
            </main>

            {/* 参数已修改未计算时的遮罩提示 */}
            {showDirtyOverlay && paramsDirty && (
              <div className="absolute inset-0 z-40 bg-endfield-black/80 backdrop-blur-sm flex flex-col items-center justify-center gap-4">
                <Icon name="sync_problem" className="text-endfield-yellow" />
                <p className="text-lg font-bold text-endfield-text-light tracking-wider">{t('paramsChanged')}</p>
                <p className="text-sm text-endfield-text">{t('clickCalculateToUpdate')}</p>
                <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-3 w-72 sm:w-[28rem]">
                  <button
                    onClick={() => { runCalculation(); setShowDirtyOverlay(false); }}
                    className="min-h-10 px-3 py-2 bg-endfield-yellow hover:bg-endfield-yellow-glow hover:-translate-y-0.5 text-endfield-black font-bold tracking-wider uppercase transition-all flex items-center justify-center text-sm glow-yellow"
                  >
                    <span className="inline-flex items-center gap-2">
                      <Icon name="calculate" />
                      {t('calculate')}
                    </span>
                  </button>
                  {lastCalcParamsRef.current && (
                    <button
                      onClick={() => {
                        setParams({ ...lastCalcParamsRef.current });
                        setParamsDirty(false);
                        setShowDirtyOverlay(false);
                      }}
                      className="min-h-10 px-3 py-2 border border-endfield-yellow/40 text-endfield-yellow font-bold tracking-wider uppercase hover:bg-endfield-yellow/10 hover:-translate-y-0.5 transition-all flex items-center justify-center text-sm"
                    >
                      <span className="inline-flex items-center gap-2">
                        <Icon name="undo" />
                        {t('restoreParams')}
                      </span>
                    </button>
                  )}
                </div>
                <button
                  onClick={() => {
                    setShowDirtyOverlay(false);
                    setDirtyDismissed(true);
                  }}
                  className="text-xs text-endfield-text hover:text-endfield-text-light transition-colors tracking-wider"
                >
                  {t('ignoreWarning')}
                </button>
              </div>
            )}
          </div>
        </div>

        {showPrivacyFooter && (
          <footer className="shrink-0 relative border-t border-endfield-gray-light bg-endfield-dark px-3 py-2 text-[11px] sm:text-xs text-endfield-text leading-relaxed">
            <div className="pr-8 text-center">
              {t('privacyFooterNotice')}
              {' '}
              <button
                type="button"
                onClick={onOpenPrivacyPolicy}
                className="text-endfield-yellow hover:text-endfield-yellow-glow underline underline-offset-2 cursor-pointer"
              >
                {t('privacyPolicyDetails')}
              </button>
              {' '}|{' '}
              <a
                href="https://privacy.microsoft.com/privacystatement"
                target="_blank"
                rel="noopener noreferrer"
                className="text-endfield-yellow hover:text-endfield-yellow-glow underline underline-offset-2"
              >
                {t('microsoftPrivacyStatement')}
              </a>
              {' '}|{' '}
              <a
                href="https://sentry.io/privacy/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-endfield-yellow hover:text-endfield-yellow-glow underline underline-offset-2"
              >
                {t('sentryPrivacyStatement')}
              </a>
            </div>

            <CloseButton
              onClick={handleDismissPrivacyFooter}
              label={t('close')}
              sizeClass="w-5 h-5"
              className="absolute right-3 top-1/2 -translate-y-1/2"
            />
          </footer>
        )}

        <ShareModal
          show={shareModalOpen}
          shareUrl={shareUrl}
          onClose={handleCloseShareModal}
          onCopy={handleCopyShareUrl}
          onShare={handleNativeShare}
        />
        <ErrorState show={showError} onDismiss={() => setShowError(false)} />
    </div>
  );
}

function App() {
  const [showAnnouncement, setShowAnnouncement] = useState(() => shouldShowAnnouncement());
  const [announcementInitialTab, setAnnouncementInitialTab] = useState('announcement');
  const [showPrivacyPolicy, setShowPrivacyPolicy] = useState(false);

  const openAnnouncement = (initialTab = 'announcement') => {
    setAnnouncementInitialTab(initialTab);
    setShowAnnouncement(true);
  };

  return (
    <I18nProvider>
      <AppContent
        onOpenAnnouncement={openAnnouncement}
        onOpenPrivacyPolicy={() => setShowPrivacyPolicy(true)}
      />
      <Announcement show={showAnnouncement} initialTab={announcementInitialTab} onClose={() => setShowAnnouncement(false)} />
      <PrivacyPolicyModal show={showPrivacyPolicy} onClose={() => setShowPrivacyPolicy(false)} />
    </I18nProvider>
  );
}

export default App;
