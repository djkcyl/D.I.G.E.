import de from "./locales.de.json";
import en from "./locales.en.json";
import fr from "./locales.fr.json";
import id from "./locales.id.json";
import ja from "./locales.ja.json";
import ko from "./locales.ko.json";
import ru from "./locales.ru.json";
import zh from "./locales.zh.json";

export interface AnnouncementBlock {
  type: string;
  className?: string;
  text?: string;
  items?: string[];
  segments?: { text: string; link?: string }[];
}

export interface ChangelogSection {
  version: string;
  title: string;
  defaultOpen?: boolean;
  items: string[];
}

export interface AnnouncementLocaleContent {
  announcement?: { blocks?: AnnouncementBlock[] };
  changelog?: { sections?: ChangelogSection[] };
  [key: string]: unknown;
}

export const announcementLocales: Record<string, AnnouncementLocaleContent> = {
  en,
  zh,
  ja,
  ko,
  ru,
  fr,
  de,
  id,
};
