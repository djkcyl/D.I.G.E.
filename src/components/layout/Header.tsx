import { QRCodeSVG } from "qrcode.react";
import {
  type RefObject,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { useI18n } from "../../i18n";
import { useTheme } from "../../utils/useTheme";
import { hasUnreadAnnouncementOrChangelog } from "../modals/Announcement";
import Button from "../ui/Button";
import Icon from "../ui/Icon";
import UnreadDot from "../ui/UnreadDot";
import HeaderMoreMenu from "./HeaderMoreMenu";

const BTN_ICON =
  "h-9 w-9 sm:h-10 sm:w-10 bg-endfield-gray border border-endfield-gray-light hover:border-endfield-yellow transition-colors flex items-center justify-center text-endfield-text-light hover:text-endfield-yellow";

const QQ_GROUP_URL = "https://qm.qq.com/q/zL6wp3emTQ";
const QQ_GROUP_NUMBER = "1084531249";
const MENU_ITEM_SELECTOR = '[role="menuitem"],[role="menuitemradio"]';
const LISTBOX_OPTION_SELECTOR = '[role="option"]';

export interface HeaderProps {
  onCalculate: () => void;
  onShare: () => void;
  onShowStatus?: (msg: string) => void;
  sidebarCollapsed: boolean;
  onToggleSidebar: () => void;
  onOpenAnnouncement: (tab: string) => void;
  onOpenPrivacyPolicy: () => void;
  onOpenQA: () => void;
}

function focusTrigger(
  triggerRef: RefObject<HTMLButtonElement | null>,
  useRaf: boolean = true
) {
  if (!triggerRef.current) return;
  if (
    useRaf &&
    typeof window !== "undefined" &&
    typeof window.requestAnimationFrame === "function"
  ) {
    window.requestAnimationFrame(() => triggerRef.current?.focus());
    return;
  }
  triggerRef.current.focus();
}

export default function Header({
  onCalculate,
  onShare,
  onShowStatus,
  sidebarCollapsed,
  onToggleSidebar,
  onOpenAnnouncement,
  onOpenPrivacyPolicy,
  onOpenQA,
}: HeaderProps) {
  const { t, locale, changeLocale, languageOptions } = useI18n();
  const { isLight, toggleTheme } = useTheme();
  const [showLangMenu, setShowLangMenu] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [showQrPopover, setShowQrPopover] = useState(false);
  const [qrExiting, setQrExiting] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  const langMenuRef = useRef<HTMLElement | null>(null);
  const moreMenuRef = useRef<HTMLElement | null>(null);
  const langMenuButtonRef = useRef<HTMLButtonElement | null>(null);
  const moreMenuButtonRef = useRef<HTMLButtonElement | null>(null);
  const langMenuListRef = useRef<HTMLDivElement | null>(null);
  const moreMenuListRef = useRef<HTMLDivElement | null>(null);
  const qrTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const langMenuOpenFocusRef = useRef<"selected" | "first" | "last">(
    "selected"
  );
  const moreMenuOpenFocusRef = useRef<"first" | "last">("first");

  const langMenuId = useId();
  const moreMenuId = useId();
  const langMenuButtonId = `${langMenuId}-button`;
  const moreMenuButtonId = `${moreMenuId}-button`;

  const currentLang = languageOptions.find((l) => l.code === locale);

  const getMenuItems = useCallback(
    (container: HTMLElement | null, selector: string) => {
      if (!container) return [];
      return Array.from(
        container.querySelectorAll<HTMLElement>(selector)
      ).filter(
        (item) =>
          !item.hasAttribute("disabled") &&
          (item.offsetWidth > 0 ||
            item.offsetHeight > 0 ||
            item.getClientRects().length > 0)
      );
    },
    []
  );

  const moveFocus = useCallback(
    (
      items: HTMLElement[],
      direction: "next" | "prev" | "first" | "last",
      activeElement: HTMLElement | null
    ) => {
      if (items.length === 0) return;

      let nextIndex = activeElement ? items.indexOf(activeElement) : -1;
      if (direction === "first") {
        nextIndex = 0;
      } else if (direction === "last") {
        nextIndex = items.length - 1;
      } else if (direction === "next") {
        nextIndex = nextIndex < 0 ? 0 : (nextIndex + 1) % items.length;
      } else {
        nextIndex =
          nextIndex < 0
            ? items.length - 1
            : (nextIndex - 1 + items.length) % items.length;
      }

      items[nextIndex]?.focus();
    },
    []
  );

  const closeLangMenu = useCallback((restoreFocus = false) => {
    setShowLangMenu(false);
    if (restoreFocus) {
      focusTrigger(langMenuButtonRef);
    }
  }, []);

  const closeMoreMenu = useCallback((restoreFocus = false) => {
    setShowMoreMenu(false);
    if (restoreFocus) {
      focusTrigger(moreMenuButtonRef);
    }
  }, []);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        langMenuRef.current &&
        !langMenuRef.current.contains(e.target as Node)
      ) {
        closeLangMenu(false);
      }
      if (
        moreMenuRef.current &&
        !moreMenuRef.current.contains(e.target as Node)
      ) {
        closeMoreMenu(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [closeLangMenu, closeMoreMenu]);

  useEffect(
    () => () => {
      if (qrTimerRef.current) clearTimeout(qrTimerRef.current);
    },
    []
  );

  useEffect(() => {
    const onEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;

      if (showLangMenu) {
        event.preventDefault();
        closeLangMenu(true);
        return;
      }

      if (showMoreMenu) {
        event.preventDefault();
        closeMoreMenu(true);
      }
    };

    document.addEventListener("keydown", onEscape);
    return () => document.removeEventListener("keydown", onEscape);
  }, [showLangMenu, showMoreMenu, closeLangMenu, closeMoreMenu]);

  useEffect(() => {
    if (!showMoreMenu) return;

    const items = getMenuItems(moreMenuListRef.current, MENU_ITEM_SELECTOR);
    if (items.length === 0) return;
    const target =
      moreMenuOpenFocusRef.current === "last"
        ? items[items.length - 1]
        : items[0];
    target.focus();
  }, [showMoreMenu, getMenuItems]);

  useEffect(() => {
    if (!showLangMenu) return;

    const options = getMenuItems(
      langMenuListRef.current,
      LISTBOX_OPTION_SELECTOR
    );
    if (options.length === 0) return;

    let target: HTMLElement = options[0];
    if (langMenuOpenFocusRef.current === "last") {
      target = options[options.length - 1];
    } else if (langMenuOpenFocusRef.current === "selected") {
      target =
        options.find(
          (option) => option.getAttribute("aria-selected") === "true"
        ) || options[0];
    }
    target.focus();
  }, [showLangMenu, getMenuItems]);

  const onQrEnter = () => {
    if (qrTimerRef.current) clearTimeout(qrTimerRef.current);
    setQrExiting(false);
    qrTimerRef.current = setTimeout(() => setShowQrPopover(true), 200);
  };

  const onQrLeave = () => {
    if (qrTimerRef.current) clearTimeout(qrTimerRef.current);
    if (!showQrPopover) return;
    setQrExiting(true);
    qrTimerRef.current = setTimeout(() => {
      setShowQrPopover(false);
      setQrExiting(false);
    }, 200);
  };

  const handleMoreMenuKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      const items = getMenuItems(moreMenuListRef.current, MENU_ITEM_SELECTOR);
      const active = document.activeElement as HTMLElement | null;

      switch (event.key) {
        case "ArrowDown":
          event.preventDefault();
          moveFocus(items, "next", active);
          break;
        case "ArrowUp":
          event.preventDefault();
          moveFocus(items, "prev", active);
          break;
        case "Home":
          event.preventDefault();
          moveFocus(items, "first", active);
          break;
        case "End":
          event.preventDefault();
          moveFocus(items, "last", active);
          break;
        case "Escape":
          event.preventDefault();
          closeMoreMenu(true);
          break;
        case "Tab":
          closeMoreMenu(false);
          break;
      }
    },
    [getMenuItems, moveFocus, closeMoreMenu]
  );

  const handleMoreMenuButtonKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLButtonElement>) => {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        moreMenuOpenFocusRef.current = "first";
        setShowMoreMenu(true);
        return;
      }

      if (event.key === "ArrowUp") {
        event.preventDefault();
        moreMenuOpenFocusRef.current = "last";
        setShowMoreMenu(true);
        return;
      }

      if (event.key === "Escape" && showMoreMenu) {
        event.preventDefault();
        closeMoreMenu(true);
      }
    },
    [showMoreMenu, closeMoreMenu]
  );

  const handleLangMenuKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      const options = getMenuItems(
        langMenuListRef.current,
        LISTBOX_OPTION_SELECTOR
      );
      const active = document.activeElement as HTMLElement | null;

      switch (event.key) {
        case "ArrowDown":
          event.preventDefault();
          moveFocus(options, "next", active);
          break;
        case "ArrowUp":
          event.preventDefault();
          moveFocus(options, "prev", active);
          break;
        case "Home":
          event.preventDefault();
          moveFocus(options, "first", active);
          break;
        case "End":
          event.preventDefault();
          moveFocus(options, "last", active);
          break;
        case " ":
        case "Enter":
          if (active && options.includes(active)) {
            event.preventDefault();
            active.click();
          }
          break;
        case "Escape":
          event.preventDefault();
          closeLangMenu(true);
          break;
        case "Tab":
          closeLangMenu(false);
          break;
      }
    },
    [getMenuItems, moveFocus, closeLangMenu]
  );

  const handleLangMenuButtonKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLButtonElement>) => {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        langMenuOpenFocusRef.current = "first";
        setShowLangMenu(true);
        return;
      }

      if (event.key === "ArrowUp") {
        event.preventDefault();
        langMenuOpenFocusRef.current = "last";
        setShowLangMenu(true);
        return;
      }

      if (event.key === "Escape" && showLangMenu) {
        event.preventDefault();
        closeLangMenu(true);
      }
    },
    [showLangMenu, closeLangMenu]
  );

  return (
    <header className="bg-endfield-dark border-b border-endfield-gray-light p-2 sm:p-4 flex items-center justify-between shrink-0 shadow-sm">
      <div className="flex items-center gap-2 sm:gap-3">
        <button
          type="button"
          onClick={onToggleSidebar}
          className="relative md:hidden w-8 h-8 flex items-center justify-center text-endfield-yellow"
          title={sidebarCollapsed ? t("expandSidebar") : t("collapseSidebar")}
          aria-label={
            sidebarCollapsed ? t("expandSidebar") : t("collapseSidebar")
          }
          aria-expanded={!sidebarCollapsed}
        >
          <Icon name={sidebarCollapsed ? "menu" : "close"} />
          {hasUnreadAnnouncementOrChangelog() && <UnreadDot />}
        </button>

        <button
          type="button"
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
          className="hidden md:flex w-4 items-center justify-center cursor-pointer self-stretch bg-transparent border-none p-0"
          onClick={onToggleSidebar}
          title={sidebarCollapsed ? t("expandSidebar") : t("collapseSidebar")}
          aria-label={
            sidebarCollapsed ? t("expandSidebar") : t("collapseSidebar")
          }
          aria-expanded={!sidebarCollapsed}
        >
          <div
            className="h-full transition-all duration-200 bg-endfield-yellow-bg animate-pulse-glow"
            style={{
              width: isHovered ? "12px" : "4px",
              clipPath: isHovered
                ? sidebarCollapsed
                  ? "polygon(0 0, 100% 50%, 0 100%)"
                  : "polygon(0 50%, 100% 0, 100% 100%)"
                : "none",
            }}
            aria-hidden="true"
          />
        </button>
        <div className="flex flex-col justify-center">
          <div className="flex items-center gap-2">
            <a
              href="https://github.com/djkcyl/D.I.G.E."
              target="_blank"
              rel="noopener noreferrer"
              className="group"
              title={t("github")}
              aria-label={t("openGithubProjectPage")}
            >
              <h1 className="text-base sm:text-lg font-bold text-endfield-text-light tracking-widest uppercase group-hover:text-endfield-yellow transition-colors">
                {t("appTitle")}
              </h1>
            </a>
            <button
              type="button"
              onClick={() => onOpenAnnouncement("changelog")}
              className="inline text-xs text-endfield-yellow border border-endfield-yellow/30 bg-endfield-yellow/5 px-1.5 py-px hover:bg-endfield-yellow/15 hover:border-endfield-yellow/50 cursor-pointer transition-colors"
              title={t("changelog")}
              aria-label={t("changelog")}
            >
              v{__APP_VERSION__}
            </button>
          </div>
          <p className="hidden md:block text-sm text-endfield-text tracking-wider mt-0.5">
            {t("appSubtitle")}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 sm:gap-3">
        <button
          type="button"
          onClick={onOpenPrivacyPolicy}
          className={`hidden lg:flex ${BTN_ICON}`}
          title={t("privacyPolicyDetails")}
          aria-label={t("privacyPolicyDetails")}
        >
          <Icon name="policy" />
        </button>

        <button
          type="button"
          onClick={onOpenQA}
          className={`hidden lg:flex ${BTN_ICON}`}
          title={t("qa")}
          aria-label={t("qa")}
        >
          <Icon name="help_center" />
        </button>

        <button
          type="button"
          onClick={onShare}
          className={BTN_ICON}
          title={t("share")}
          aria-label={t("share")}
        >
          <Icon name="share" />
        </button>

        <button
          type="button"
          onClick={() => onOpenAnnouncement("announcement")}
          className={`relative hidden md:flex ${BTN_ICON}`}
          title={t("announcement")}
          aria-label={t("announcement")}
        >
          <Icon name="campaign" />
          {hasUnreadAnnouncementOrChangelog() && <UnreadDot />}
        </button>

        {locale === "zh" && (
          <fieldset
            aria-label={t("joinQQGroup")}
            className="relative hidden md:block border-0 p-0 m-0"
            onMouseEnter={onQrEnter}
            onMouseLeave={onQrLeave}
          >
            <a
              href={QQ_GROUP_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="flex h-10 w-10 bg-endfield-gray border border-endfield-gray-light hover:border-endfield-yellow transition-colors items-center justify-center text-endfield-text-light hover:text-endfield-yellow"
              title={t("joinQQGroup")}
              aria-label={t("joinQQGroup")}
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
                      onShowStatus?.(t("qqGroupCopied"));
                    }
                  } catch {
                    // ignore
                  }
                }}
                className={`absolute right-0 top-full mt-2 px-3 pt-3 pb-2 bg-endfield-gray border border-endfield-yellow/50 shadow-xl z-50 animate-qr-enter origin-top-right transition-opacity duration-200 flex flex-col items-center cursor-pointer ${
                  qrExiting ? "opacity-0" : "opacity-100"
                }`}
                title={t("qqGroupCopyLabel")}
                aria-label={t("qqGroupCopyLabel")}
              >
                <QRCodeSVG
                  value={QQ_GROUP_URL}
                  size={160}
                  level="M"
                  bgColor="#ffffff"
                  fgColor="#0a0a0a"
                  marginSize={2}
                />
                <p className="mt-2 text-center text-xs text-endfield-text-light leading-none">
                  {t("scanToJoinGroup")}
                </p>
                <span className="mt-1.5 text-xs text-endfield-yellow hover:text-endfield-yellow-glow underline underline-offset-2 transition-colors">
                  1084531249
                </span>
              </button>
            )}
          </fieldset>
        )}

        <a
          href="https://github.com/djkcyl/D.I.G.E."
          target="_blank"
          rel="noopener noreferrer"
          className={`hidden lg:flex ${BTN_ICON}`}
          title={t("github")}
          aria-label={t("openGithubProjectPage")}
        >
          <Icon icon="mdi:github" />
        </a>

        <button
          type="button"
          onClick={toggleTheme}
          className={`hidden lg:flex ${BTN_ICON}`}
          title={isLight ? t("themeSwitchDark") : t("themeSwitchLight")}
          aria-label={isLight ? t("themeSwitchDark") : t("themeSwitchLight")}
        >
          <Icon name={isLight ? "dark_mode" : "light_mode"} />
        </button>

        <nav
          className="relative hidden md:block lg:hidden order-last"
          ref={moreMenuRef}
          aria-label={t("moreMenu")}
        >
          <button
            type="button"
            id={moreMenuButtonId}
            ref={moreMenuButtonRef}
            onClick={() => {
              moreMenuOpenFocusRef.current = "first";
              setShowMoreMenu((prev) => !prev);
            }}
            onKeyDown={handleMoreMenuButtonKeyDown}
            className={BTN_ICON}
            title={t("moreMenu")}
            aria-label={t("moreMenu")}
            aria-expanded={showMoreMenu}
            aria-haspopup="menu"
            aria-controls={showMoreMenu ? moreMenuId : undefined}
          >
            <Icon name="more_vert" />
          </button>
          {showMoreMenu && (
            <HeaderMoreMenu
              menuId={moreMenuId}
              menuButtonId={moreMenuButtonId}
              menuRef={moreMenuListRef}
              onMenuKeyDown={handleMoreMenuKeyDown}
              onClose={() => closeMoreMenu(false)}
              onOpenPrivacyPolicy={onOpenPrivacyPolicy}
              onOpenQA={onOpenQA}
              isLight={isLight}
              onToggleTheme={toggleTheme}
            />
          )}
        </nav>

        <nav
          className="relative hidden lg:block"
          ref={langMenuRef}
          aria-label={t("languageSwitcher")}
        >
          <button
            type="button"
            id={langMenuButtonId}
            ref={langMenuButtonRef}
            onClick={() => {
              langMenuOpenFocusRef.current = "selected";
              setShowLangMenu((prev) => !prev);
            }}
            onKeyDown={handleLangMenuButtonKeyDown}
            className="h-10 px-3 bg-endfield-gray border border-endfield-gray-light hover:border-endfield-yellow transition-colors flex items-center gap-2 text-sm text-endfield-text-light"
            aria-expanded={showLangMenu}
            aria-haspopup="listbox"
            aria-controls={showLangMenu ? langMenuId : undefined}
            aria-label={t("currentLanguageAriaLabel").replace(
              "{language}",
              currentLang ? currentLang.nativeName : ""
            )}
          >
            <Icon name="language" />
            <span>{currentLang ? currentLang.nativeName : ""}</span>
          </button>

          {showLangMenu && (
            <div
              id={langMenuId}
              ref={langMenuListRef}
              role="listbox"
              tabIndex={-1}
              onKeyDown={handleLangMenuKeyDown}
              aria-label={t("selectLanguage")}
              aria-labelledby={langMenuButtonId}
              className="absolute right-0 top-full mt-1 bg-endfield-gray border border-endfield-gray-light z-50 min-w-[140px] list-none p-0 m-0"
            >
              {languageOptions.map((lang) => (
                <button
                  key={lang.code}
                  type="button"
                  role="option"
                  aria-selected={locale === lang.code}
                  tabIndex={locale === lang.code ? 0 : -1}
                  onClick={() => {
                    changeLocale(lang.code);
                    closeLangMenu(true);
                  }}
                  className={`w-full px-3 py-2 text-left text-sm hover:bg-endfield-gray-light transition-colors ${
                    locale === lang.code
                      ? "text-endfield-yellow"
                      : "text-endfield-text-light"
                  }`}
                  lang={lang.code}
                >
                  {lang.nativeName}
                </button>
              ))}
            </div>
          )}
        </nav>

        <Button
          onClick={() => onCalculate()}
          variant="primary"
          className="md:hidden h-9 min-h-9 px-3 hover:-translate-y-0.5 uppercase glow-yellow"
          aria-label={t("calculate")}
        >
          <Icon name="calculate" />
          <span>{t("calculate")}</span>
        </Button>
      </div>
    </header>
  );
}
