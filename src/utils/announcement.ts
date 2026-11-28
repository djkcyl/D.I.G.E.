import { announcementLocales } from "../i18n/announcement/locales";

const CONTENT_ID_SCHEMA_VERSION = "v1";

export function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(obj[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function hashString(input: string): string {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

export function buildContentId(prefix: string, payload: unknown): string {
  const serialized = stableStringify(payload);
  return `${prefix}-${CONTENT_ID_SCHEMA_VERSION}-${hashString(serialized)}`;
}

export function pickLocalizedSection(
  sectionKey: string,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(announcementLocales).map(([localeCode, localeData]) => [
      localeCode,
      localeData?.[sectionKey] || null,
    ]),
  );
}

export const ANNOUNCEMENT_ID = buildContentId(
  "announcement",
  pickLocalizedSection("announcement"),
);
export const CHANGELOG_ID = buildContentId(
  "changelog",
  pickLocalizedSection("changelog"),
);

export const ANNOUNCEMENT_DISMISSED_KEY = "dige-announcement-dismissed";
export const ANNOUNCEMENT_VIEWED_KEY = "dige-announcement-viewed";
export const CHANGELOG_VIEWED_KEY = "dige-changelog-viewed";
