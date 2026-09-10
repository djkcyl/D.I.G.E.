import { useEffect, useState } from "react";

export type ThemeMode = "dark" | "light";

const THEME_STORAGE_KEY = "dige_theme";

type ThemeListener = (theme: ThemeMode) => void;
const listeners = new Set<ThemeListener>();

function notifyTheme(theme: ThemeMode) {
  listeners.forEach((listener) => listener(theme));
}

/**
 * 根据本地时间获取默认主题 (6:00 - 18:00 白天工业白，其余极夜暗黑)
 */
export function getAutoThemeByTime(): ThemeMode {
  const hour = new Date().getHours();
  return hour >= 6 && hour < 18 ? "light" : "dark";
}

function readStoredTheme(): ThemeMode | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    return saved === "light" || saved === "dark" ? saved : null;
  } catch {
    return null;
  }
}

function resolvePreferredTheme(): ThemeMode {
  return readStoredTheme() ?? getAutoThemeByTime();
}

function readDomTheme(): ThemeMode {
  if (typeof document === "undefined") return getAutoThemeByTime();
  return document.documentElement.classList.contains("light")
    ? "light"
    : "dark";
}

function applyTheme(nextTheme: ThemeMode, persist = true) {
  if (typeof document === "undefined") return;
  document.documentElement.classList.remove("dark", "light");
  document.documentElement.classList.add(nextTheme);
  document.documentElement.style.colorScheme = nextTheme;
  const themeColor = nextTheme === "light" ? "#ebecef" : "#0a0a0a";
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", themeColor);
  const tile = document.querySelector('meta[name="msapplication-TileColor"]');
  if (tile) tile.setAttribute("content", themeColor);
  if (persist) {
    try {
      localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
    } catch {
      // ignore quota / private mode
    }
  }
  notifyTheme(nextTheme);
}

export function useTheme() {
  const [theme, setTheme] = useState<ThemeMode>(() => resolvePreferredTheme());

  useEffect(() => {
    const onChange = (nextTheme: ThemeMode) => setTheme(nextTheme);
    listeners.add(onChange);
    const preferred = resolvePreferredTheme();
    if (preferred !== readDomTheme()) {
      applyTheme(preferred, false);
    } else {
      setTheme(preferred);
    }

    const onStorage = (event: StorageEvent) => {
      if (event.key !== THEME_STORAGE_KEY) return;
      if (event.newValue === "light" || event.newValue === "dark") {
        applyTheme(event.newValue, false);
        return;
      }
      applyTheme(getAutoThemeByTime(), false);
    };
    window.addEventListener("storage", onStorage);

    return () => {
      listeners.delete(onChange);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const toggleTheme = () => {
    const nextTheme: ThemeMode = readDomTheme() === "dark" ? "light" : "dark";
    applyTheme(nextTheme, true);
  };

  return { theme, isLight: theme === "light", toggleTheme };
}
