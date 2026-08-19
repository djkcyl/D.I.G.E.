import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { languageOptions, locales } from "./locales";

const I18nContext = createContext<{
  locale: string;
  t: (key: string, vars?: Record<string, string | number>) => string;
  changeLocale: (newLocale: string) => void;
  languageOptions: typeof languageOptions;
} | null>(null);

// 语言代码到 HTML lang 属性的映射
const langCodeMap: Record<string, string> = {
  zh: "zh-CN",
  en: "en",
  ja: "ja",
  ko: "ko",
  ru: "ru",
  fr: "fr",
  de: "de",
  id: "id",
};

// 从 URL 参数获取语言
function getLanguageFromURL(): string | null {
  const params = new URLSearchParams(window.location.search);
  const lang = params.get("lang");
  if (lang && locales[lang]) {
    return lang;
  }
  return null;
}

// 更新 URL 参数（不刷新页面）
function updateURLLanguage(lang: string): void {
  const url = new URL(window.location.href);
  url.searchParams.set("lang", lang);
  window.history.replaceState({}, "", url.toString());
}

// 更新 SEO 相关的 meta 标签
function updateSEOMeta(locale: string): void {
  const t = locales[locale] || locales.en;
  const title = t.seoTitle || "D.I.G.E.";
  const description = t.seoDescription || "";
  const htmlLang = langCodeMap[locale] || locale;

  // 更新 document.title
  document.title = title;

  // 更新 meta 标签的辅助函数
  const updateMeta = (selector: string, content: string) => {
    const el = document.querySelector(selector);
    if (el) el.setAttribute("content", content);
  };

  // 更新各种 meta 标签
  updateMeta('meta[name="title"]', title);
  updateMeta('meta[name="description"]', description);
  updateMeta('meta[property="og:title"]', title);
  updateMeta('meta[property="og:description"]', description);
  updateMeta('meta[property="og:locale"]', htmlLang.replace("-", "_"));
  updateMeta('meta[name="twitter:title"]', title);
  updateMeta('meta[name="twitter:description"]', description);
}

interface I18nProviderProps {
  children: React.ReactNode;
}

export function I18nProvider({
  children,
}: I18nProviderProps): React.ReactElement {
  const [locale, setLocale] = useState(() => {
    // 优先级：1. URL 参数 > 2. localStorage > 3. 浏览器语言 > 4. 默认英语
    const urlLang = getLanguageFromURL();
    if (urlLang) {
      localStorage.setItem("language", urlLang);
      return urlLang;
    }

    const saved = localStorage.getItem("language");
    if (saved && locales[saved]) return saved;

    const browserLang = navigator.language.split("-")[0];
    if (locales[browserLang]) return browserLang;

    return "en";
  });

  // 更新 HTML lang 属性、URL 参数和 SEO meta 标签
  useEffect(() => {
    const htmlLang = langCodeMap[locale] || locale;
    document.documentElement.lang = htmlLang;
    updateURLLanguage(locale);
    updateSEOMeta(locale);
  }, [locale]);

  // 监听 URL 变化（浏览器前进/后退）
  useEffect(() => {
    const handlePopState = () => {
      const urlLang = getLanguageFromURL();
      if (urlLang && urlLang !== locale) {
        setLocale(urlLang);
        localStorage.setItem("language", urlLang);
      }
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [locale]);

  const t = useCallback(
    (key: string, vars?: Record<string, string | number>) => {
      let text = locales[locale]?.[key] || locales.en[key] || key;
      if (vars) {
        for (const [name, value] of Object.entries(vars)) {
          text = text.split("{{" + name + "}}").join(String(value));
        }
      }
      return text;
    },
    [locale]
  );

  const changeLocale = useCallback((newLocale: string) => {
    if (locales[newLocale]) {
      setLocale(newLocale);
      localStorage.setItem("language", newLocale);
      updateURLLanguage(newLocale);
    }
  }, []);

  return (
    <I18nContext.Provider value={{ locale, t, changeLocale, languageOptions }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error("useI18n must be used within an I18nProvider");
  }
  return context;
}
