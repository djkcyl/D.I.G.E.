import { useState, useEffect, useRef } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { useI18n } from '../i18n';
import { hasUnreadAnnouncementOrChangelog } from './Announcement';
import Icon from './Icon';

const QQ_GROUP_URL = 'https://qm.qq.com/q/zL6wp3emTQ';
const QQ_GROUP_NUMBER = '1084531249';

export default function Header({ onCalculate, onShare, onShowStatus, sidebarCollapsed, onToggleSidebar, onOpenAnnouncement, onOpenPrivacyPolicy }) {
  const { t, locale, changeLocale, languageOptions } = useI18n();
  const [showLangMenu, setShowLangMenu] = useState(false);
  const [showQrPopover, setShowQrPopover] = useState(false);
  const [qrExiting, setQrExiting] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const langMenuRef = useRef(null);
  const qrTimerRef = useRef(null);

  const currentLang = languageOptions.find(l => l.code === locale);

  // 点击外部关闭下拉菜单
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (langMenuRef.current && !langMenuRef.current.contains(event.target)) {
        setShowLangMenu(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => () => { if (qrTimerRef.current) clearTimeout(qrTimerRef.current); }, []);

  const onQrEnter = () => {
    if (qrTimerRef.current) clearTimeout(qrTimerRef.current);
    setQrExiting(false);
    qrTimerRef.current = setTimeout(() => setShowQrPopover(true), 200);
  };
  const onQrLeave = () => {
    if (qrTimerRef.current) clearTimeout(qrTimerRef.current);
    if (!showQrPopover) return;
    setQrExiting(true);
    qrTimerRef.current = setTimeout(() => { setShowQrPopover(false); setQrExiting(false); }, 200);
  };

  return (
    <header 
      className="bg-endfield-dark border-b border-endfield-gray-light p-2 sm:p-4 flex items-center justify-between shrink-0"
      role="banner"
    >
      <div className="flex items-center gap-2 sm:gap-3">
        {/* 移动端：汉堡菜单按钮 */}
        <button
          onClick={onToggleSidebar}
          className="relative md:hidden w-8 h-8 flex items-center justify-center text-endfield-yellow"
          title={sidebarCollapsed ? t('expandSidebar') : t('collapseSidebar')}
          aria-label={sidebarCollapsed ? t('expandSidebar') : t('collapseSidebar')}
          aria-expanded={!sidebarCollapsed}
        >
          <Icon name={sidebarCollapsed ? 'menu' : 'close'} />
          {hasUnreadAnnouncementOrChangelog() && (
            <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-red-500 rounded-full animate-pulse" aria-hidden="true" />
          )}
        </button>
        
        {/* 桌面端：黄色竖条/箭头 */}
        <button
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
          className="hidden md:flex w-4 items-center justify-center cursor-pointer self-stretch bg-transparent border-none p-0"
          onClick={onToggleSidebar}
          title={sidebarCollapsed ? t('expandSidebar') : t('collapseSidebar')}
          aria-label={sidebarCollapsed ? t('expandSidebar') : t('collapseSidebar')}
          aria-expanded={!sidebarCollapsed}
        >
          <div
            className="h-full transition-all duration-200 bg-endfield-yellow animate-pulse-glow"
            style={{
              width: isHovered ? '12px' : '4px',
              clipPath: isHovered 
                ? (sidebarCollapsed 
                    ? 'polygon(0 0, 100% 50%, 0 100%)' 
                    : 'polygon(0 50%, 100% 0, 100% 100%)')
                : 'none',
            }}
            aria-hidden="true"
          />
        </button>
        {/* 标题区域 */}
        <div className="flex flex-col justify-center">
          <div className="flex items-center gap-2">
            <a
              href="https://github.com/djkcyl/D.I.G.E."
              target="_blank"
              rel="noopener noreferrer"
              className="group"
              title="GitHub"
              aria-label="Open project GitHub homepage"
            >
              <h1 className="text-base sm:text-lg font-bold text-endfield-text-light tracking-widest uppercase group-hover:text-endfield-yellow transition-colors">
                {t('appTitle')}
              </h1>
            </a>
            <button
              type="button"
              onClick={() => onOpenAnnouncement('changelog')}
              className="inline text-xs text-endfield-yellow border border-endfield-yellow/30 bg-endfield-yellow/5 px-1.5 py-px hover:bg-endfield-yellow/15 hover:border-endfield-yellow/50 cursor-pointer transition-colors"
              title={t('changelog')}
              aria-label={t('changelog')}
            >
              v{__APP_VERSION__}
            </button>
          </div>
          <p className="hidden md:block text-sm text-endfield-text tracking-wider mt-0.5">
            {t('appSubtitle')}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 sm:gap-3">
        <button
          onClick={onOpenPrivacyPolicy}
          className="hidden md:flex h-9 w-9 sm:h-10 sm:w-10 bg-endfield-gray border border-endfield-gray-light hover:border-endfield-yellow transition-colors items-center justify-center text-endfield-text-light hover:text-endfield-yellow"
          title={t('privacyPolicyDetails')}
          aria-label={t('privacyPolicyDetails')}
        >
          <Icon name="policy" />
        </button>

        <button
          onClick={onShare}
          className="h-9 w-9 sm:h-10 sm:w-10 bg-endfield-gray border border-endfield-gray-light hover:border-endfield-yellow transition-colors flex items-center justify-center text-endfield-text-light hover:text-endfield-yellow"
          title={t('share')}
          aria-label={t('share')}
        >
          <Icon name="share" />
        </button>

        {/* Announcement Button - 桌面端显示 */}
        <button
          onClick={() => onOpenAnnouncement('announcement')}
          className="relative hidden md:flex h-10 w-10 bg-endfield-gray border border-endfield-gray-light hover:border-endfield-yellow transition-colors items-center justify-center text-endfield-text-light hover:text-endfield-yellow"
          title={t('announcement')}
          aria-label={t('announcement')}
        >
          <Icon name="campaign" />
          {hasUnreadAnnouncementOrChangelog() && (
            <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-red-500 rounded-full animate-pulse" />
          )}
        </button>

        {/* 加入 QQ 群 - 仅中文显示，悬停延迟显示二维码 */}
        {locale === 'zh' && (
          <div
            className="relative hidden md:block"
            onMouseEnter={onQrEnter}
            onMouseLeave={onQrLeave}
          >
            <a
              href={QQ_GROUP_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="flex h-10 w-10 bg-endfield-gray border border-endfield-gray-light hover:border-endfield-yellow transition-colors items-center justify-center text-endfield-text-light hover:text-endfield-yellow"
              title={t('joinQQGroup')}
              aria-label={t('joinQQGroup')}
            >
              <Icon name="group" />
            </a>
            {showQrPopover && (
              <button
                type="button"
                onClick={async (e) => {
                  e.preventDefault();
                  try {
                    if (navigator.clipboard?.writeText) {
                      await navigator.clipboard.writeText(QQ_GROUP_NUMBER);
                      onShowStatus?.(t('qqGroupCopied'));
                    }
                  } catch {
                    // ignore
                  }
                }}
                className={`absolute right-0 top-full mt-2 px-3 pt-3 pb-2 bg-endfield-gray border border-endfield-yellow/50 shadow-xl z-50 animate-qr-enter origin-top-right transition-opacity duration-200 flex flex-col items-center cursor-pointer ${
                  qrExiting ? 'opacity-0' : 'opacity-100'
                }`}
                title={t('qqGroupCopyLabel')}
                aria-label={t('qqGroupCopyLabel')}
              >
                <QRCodeSVG
                  value={QQ_GROUP_URL}
                  size={160}
                  level="M"
                  bgColor="#ffffff"
                  fgColor="#0a0a0a"
                  marginSize={2}
                />
                <p className="mt-2 text-center text-xs text-endfield-text-light leading-none">{t('scanToJoinGroup')}</p>
                <span className="mt-1.5 text-xs text-endfield-yellow hover:text-endfield-yellow-glow underline underline-offset-2 transition-colors">
                  1084531249
                </span>
              </button>
            )}
          </div>
        )}

        {/* GitHub Link - 桌面端显示 */}
        <a
          href="https://github.com/djkcyl/D.I.G.E."
          target="_blank"
          rel="noopener noreferrer"
          className="hidden md:flex h-10 w-10 bg-endfield-gray border border-endfield-gray-light hover:border-endfield-yellow transition-colors items-center justify-center text-endfield-text-light hover:text-endfield-yellow"
          title="GitHub"
          aria-label="GitHub 项目页面"
        >
          <Icon icon="mdi:github" />
        </a>

        {/* Language Switcher - 桌面端显示 */}
        <nav className="relative hidden md:block" ref={langMenuRef} aria-label="语言切换">
          <button
            onClick={() => setShowLangMenu(!showLangMenu)}
            className="h-10 px-3 bg-endfield-gray border border-endfield-gray-light hover:border-endfield-yellow transition-colors flex items-center gap-2 text-sm text-endfield-text-light"
            aria-expanded={showLangMenu}
            aria-haspopup="listbox"
            aria-label={`当前语言: ${currentLang ? currentLang.nativeName : ''}, 点击切换语言`}
          >
            <Icon name="language" />
            <span>{currentLang ? currentLang.nativeName : ''}</span>
          </button>

          {showLangMenu && (
            <ul className="absolute right-0 top-full mt-1 bg-endfield-gray border border-endfield-gray-light z-50 min-w-[140px] list-none p-0 m-0" role="listbox" aria-label="选择语言">
              {languageOptions.map((lang) => (
                <li key={lang.code} role="option" aria-selected={locale === lang.code}>
                  <button
                    onClick={() => {
                      changeLocale(lang.code);
                      setShowLangMenu(false);
                    }}
                    className={`w-full px-3 py-2 text-left text-sm hover:bg-endfield-gray-light transition-colors
                      ${locale === lang.code ? 'text-endfield-yellow' : 'text-endfield-text-light'}`}
                    lang={lang.code}
                  >
                    {lang.nativeName}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </nav>

        {/* 移动端计算按钮 */}
        <button
          onClick={() => onCalculate()}
          className="md:hidden h-9 px-3 bg-endfield-yellow hover:bg-endfield-yellow-glow hover:-translate-y-0.5 text-endfield-black font-bold tracking-wider uppercase transition-all flex items-center gap-1.5 text-sm glow-yellow"
          aria-label={t('calculate')}
        >
          <Icon name="calculate" />
          <span>{t('calculate')}</span>
        </button>
      </div>
    </header>
  );
}
