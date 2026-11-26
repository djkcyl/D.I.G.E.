import { useEffect, useRef, useState } from "react";
import { SITE_CONFIG } from "../../../config/site";
import { useI18n } from "../../../i18n";
import { hasUnreadAnnouncementOrChangelog } from "../../modals/Announcement";
import Button from "../../ui/Button";
import Icon from "../../ui/Icon";
import UnreadDot from "../../ui/UnreadDot";

export interface SidebarFooterProps {
  collapsed: boolean;
  onCalculate?: () => void;
  onOpenAnnouncement?: (tab: string) => void;
  onOpenPrivacyPolicy?: () => void;
  onOpenQA?: () => void;
  onClose?: () => void;
  locale: string;
  calcButtonRef: React.RefObject<HTMLButtonElement | null>;
  scrollContainerRef: React.RefObject<HTMLDivElement | null>;
}

export default function SidebarFooter({
  collapsed,
  onCalculate,
  onOpenAnnouncement,
  onOpenPrivacyPolicy,
  onOpenQA,
  onClose,
  locale,
  calcButtonRef,
  scrollContainerRef,
}: SidebarFooterProps) {
  const { t, changeLocale, languageOptions } = useI18n();
  const [showLangMenu, setShowLangMenu] = useState(false);
  const [calcButtonVisible, setCalcButtonVisible] = useState(true);
  const [scrollHintMounted, setScrollHintMounted] = useState(false);
  const [scrollHintVisible, setScrollHintVisible] = useState(false);
  const langMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        langMenuRef.current &&
        !langMenuRef.current.contains(event.target as Node)
      ) {
        setShowLangMenu(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    const button = calcButtonRef?.current;
    const container = scrollContainerRef?.current;
    if (!button || !container) return;
    const observer = new IntersectionObserver(
      ([entry]) => setCalcButtonVisible(entry.isIntersecting),
      { root: container, threshold: 0.5 },
    );
    observer.observe(button);
    return () => observer.disconnect();
  }, [calcButtonRef, scrollContainerRef]);

  const shouldShowHint = !calcButtonVisible && !collapsed;
  useEffect(() => {
    if (shouldShowHint) {
      setScrollHintMounted(true);
      requestAnimationFrame(() =>
        requestAnimationFrame(() => setScrollHintVisible(true)),
      );
    } else {
      setScrollHintVisible(false);
      const timer = setTimeout(() => setScrollHintMounted(false), 300);
      return () => clearTimeout(timer);
    }
  }, [shouldShowHint]);

  const scrollToCalcButton = () => {
    if (scrollContainerRef?.current) {
      scrollContainerRef.current.scrollTo({
        top: scrollContainerRef.current.scrollHeight,
        behavior: "smooth",
      });
    }
  };

  const currentLang = languageOptions.find((l) => l.code === locale);

  return (
    <>
      <Button
        ref={calcButtonRef}
        onClick={() => onCalculate?.()}
        variant="primary"
        fullWidth
        className="hidden md:flex mt-4 hover:-translate-y-0.5 uppercase glow-yellow shrink-0"
      >
        <Icon name="calculate" />
        {t("calculate")}
      </Button>

      <div className="md:hidden mt-4 pt-4 border-t border-endfield-gray-light space-y-3">
        <button
          type="button"
          onClick={() => {
            onOpenQA?.();
            onClose?.();
          }}
          className="w-full h-10 bg-endfield-gray border border-endfield-gray-light hover:border-endfield-yellow transition-colors flex items-center justify-center gap-2 text-endfield-text-light hover:text-endfield-yellow"
        >
          <Icon name="help_center" />
          <span className="text-sm">{t("qa")}</span>
        </button>
        <button
          type="button"
          onClick={() => {
            onOpenPrivacyPolicy?.();
            onClose?.();
          }}
          className="w-full h-10 bg-endfield-gray border border-endfield-gray-light hover:border-endfield-yellow transition-colors flex items-center justify-center gap-2 text-endfield-text-light hover:text-endfield-yellow"
        >
          <Icon name="policy" />
          <span className="text-sm">{t("privacyPolicyDetails")}</span>
        </button>
        <button
          type="button"
          onClick={() => {
            onOpenAnnouncement?.("announcement");
            onClose?.();
          }}
          className="relative w-full h-10 bg-endfield-gray border border-endfield-gray-light hover:border-endfield-yellow transition-colors flex items-center justify-center gap-2 text-endfield-text-light hover:text-endfield-yellow"
        >
          <Icon name="campaign" />
          <span className="text-sm">{t("announcement")}</span>
          {hasUnreadAnnouncementOrChangelog() && <UnreadDot />}
        </button>
        {locale === "zh" && (
          <a
            href={SITE_CONFIG.qqGroupUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full h-10 bg-endfield-gray border border-endfield-gray-light hover:border-endfield-yellow transition-colors flex items-center justify-center gap-2 text-endfield-text-light hover:text-endfield-yellow"
          >
            <Icon name="group" />
            <span className="text-sm">{t("joinQQGroup")}</span>
          </a>
        )}
        <a
          href={SITE_CONFIG.repoUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="w-full h-10 bg-endfield-gray border border-endfield-gray-light hover:border-endfield-yellow transition-colors flex items-center justify-center gap-2 text-endfield-text-light hover:text-endfield-yellow"
        >
          <Icon icon="mdi:github" />
          <span className="text-sm">GitHub</span>
        </a>
        <div className="relative" ref={langMenuRef}>
          <button
            type="button"
            onClick={() => setShowLangMenu(!showLangMenu)}
            className="w-full h-10 bg-endfield-gray border border-endfield-gray-light hover:border-endfield-yellow transition-colors flex items-center justify-center gap-2 text-sm text-endfield-text-light"
          >
            <Icon name="language" />
            <span>{currentLang?.nativeName || ""}</span>
          </button>
          {showLangMenu && (
            <div className="absolute left-0 right-0 bottom-full mb-1 bg-endfield-gray border border-endfield-gray-light z-50">
              {languageOptions.map((lang) => (
                <button
                  type="button"
                  key={lang.code}
                  onClick={() => {
                    changeLocale(lang.code);
                    setShowLangMenu(false);
                  }}
                  className={`w-full px-3 py-2 text-left text-sm hover:bg-endfield-gray-light transition-colors ${
                    locale === lang.code
                      ? "text-endfield-yellow"
                      : "text-endfield-text-light"
                  }`}
                >
                  {lang.nativeName}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {scrollHintMounted && (
        <div
          className={`hidden md:flex absolute bottom-0 left-0 right-0 h-20 bg-linear-to-t from-endfield-dark from-40% to-transparent items-end justify-center pb-3 pointer-events-none transition-all duration-300 ease-out ${
            scrollHintVisible
              ? "opacity-100 translate-y-0"
              : "opacity-0 translate-y-4"
          }`}
        >
          <button
            type="button"
            onClick={scrollToCalcButton}
            className="pointer-events-auto px-4 py-1.5 bg-endfield-yellow/15 border border-endfield-yellow/40 hover:bg-endfield-yellow/25 transition-colors flex items-center gap-1.5 text-xs text-endfield-yellow tracking-wider"
          >
            <Icon name="keyboard_double_arrow_down" />
            {t("scrollToCalculate")}
          </button>
        </div>
      )}
    </>
  );
}
