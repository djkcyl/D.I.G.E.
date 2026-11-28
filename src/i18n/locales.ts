import de from "./locales.de.json";
import en from "./locales.en.json";
import fr from "./locales.fr.json";
import id from "./locales.id.json";
import ja from "./locales.ja.json";
import ko from "./locales.ko.json";
import ru from "./locales.ru.json";
import zh from "./locales.zh.json";

export const locales: Record<string, Record<string, string>> = {
  en,
  zh,
  ja,
  ko,
  ru,
  fr,
  de,
  id,
};

export const languageOptions = [
  { code: "en", nativeName: "English", i18nKey: "langEnglish", flag: "🇺🇸" },
  { code: "zh", nativeName: "中文", i18nKey: "langChinese", flag: "🇨🇳" },
  { code: "ja", nativeName: "日本語", i18nKey: "langJapanese", flag: "🇯🇵" },
  { code: "ko", nativeName: "한국어", i18nKey: "langKorean", flag: "🇰🇷" },
  { code: "ru", nativeName: "Русский", i18nKey: "langRussian", flag: "🇷🇺" },
  { code: "fr", nativeName: "Français", i18nKey: "langFrench", flag: "🇫🇷" },
  { code: "de", nativeName: "Deutsch", i18nKey: "langGerman", flag: "🇩🇪" },
  {
    code: "id",
    nativeName: "Bahasa Indonesia",
    i18nKey: "langIndonesian",
    flag: "🇮🇩",
  },
];
