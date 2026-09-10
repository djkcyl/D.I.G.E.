import type { KeyboardEventHandler, RefObject } from "react";
import { useI18n } from "../../i18n";
import Icon from "../ui/Icon";

const MENU_ITEM_CLASS =
  "w-full px-3 py-2.5 flex items-center gap-2 text-left text-sm text-endfield-text-light hover:bg-endfield-gray-light hover:text-endfield-yellow";

export interface HeaderMoreMenuProps {
  menuId: string;
  menuButtonId: string;
  menuRef: RefObject<HTMLDivElement | null>;
  onMenuKeyDown: KeyboardEventHandler<HTMLDivElement>;
  onClose: () => void;
  onOpenPrivacyPolicy: () => void;
  onOpenQA: () => void;
  isLight: boolean;
  onToggleTheme: () => void;
}

export default function HeaderMoreMenu({
  menuId,
  menuButtonId,
  menuRef,
  onMenuKeyDown,
  onClose,
  onOpenPrivacyPolicy,
  onOpenQA,
  isLight,
  onToggleTheme,
}: HeaderMoreMenuProps) {
  const { t, locale, changeLocale, languageOptions } = useI18n();

  const closeAnd = (fn: () => void) => () => {
    fn();
    onClose();
  };

  return (
    <div
      id={menuId}
      ref={menuRef}
      role="menu"
      aria-labelledby={menuButtonId}
      tabIndex={-1}
      onKeyDown={onMenuKeyDown}
      className="absolute right-0 top-full mt-1 bg-endfield-gray border border-endfield-gray-light z-50 min-w-[180px] list-none p-0 m-0 shadow-xl"
    >
      <div role="none">
        <button
          type="button"
          onClick={closeAnd(onOpenPrivacyPolicy)}
          className={MENU_ITEM_CLASS}
          role="menuitem"
        >
          <Icon name="policy" className="text-base" />
          {t("privacyPolicyDetails")}
        </button>
      </div>
      <div role="none">
        <button
          type="button"
          onClick={closeAnd(onOpenQA)}
          className={MENU_ITEM_CLASS}
          role="menuitem"
        >
          <Icon name="help_center" className="text-base" />
          {t("qa")}
        </button>
      </div>
      <div role="none">
        <a
          href="https://github.com/djkcyl/D.I.G.E."
          target="_blank"
          rel="noopener noreferrer"
          onClick={onClose}
          className={MENU_ITEM_CLASS}
          role="menuitem"
        >
          <Icon icon="mdi:github" className="text-base" />
          {t("github")}
        </a>
      </div>
      <div role="none">
        <button
          type="button"
          onClick={closeAnd(onToggleTheme)}
          className={MENU_ITEM_CLASS}
          role="menuitem"
        >
          <Icon
            name={isLight ? "dark_mode" : "light_mode"}
            className="text-base"
          />
          {isLight ? t("themeSwitchDark") : t("themeSwitchLight")}
        </button>
      </div>
      <div className="border-t border-endfield-gray-light" role="none">
        <div className="px-3 py-2 text-xs text-endfield-text/70">
          {t("language")}
        </div>
        {languageOptions.map((lang) => (
          <button
            type="button"
            key={lang.code}
            onClick={() => {
              changeLocale(lang.code);
              onClose();
            }}
            className={`w-full px-3 py-1.5 pl-6 text-left text-sm hover:bg-endfield-gray-light transition-colors ${
              locale === lang.code
                ? "text-endfield-yellow"
                : "text-endfield-text-light"
            }`}
            role="menuitemradio"
            aria-checked={locale === lang.code}
            lang={lang.code}
          >
            {lang.nativeName}
          </button>
        ))}
      </div>
    </div>
  );
}
