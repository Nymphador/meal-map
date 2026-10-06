// Light or dark: follows the phone's setting unless the user picked one in Settings. It's a display
// preference, so it lives in localStorage rather than the app's data.
// index.html applies a saved choice before the page draws, so there's no flash of the wrong theme.

export type Theme = "system" | "light" | "dark";

const KEY = "mp_theme";
const systemDark = window.matchMedia("(prefers-color-scheme: dark)");

export function getTheme(): Theme {
  try {
    const v = localStorage.getItem(KEY);
    return v === "light" || v === "dark" ? v : "system";
  } catch {
    return "system";
  }
}

export function setTheme(theme: Theme) {
  try {
    if (theme === "system") localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, theme);
  } catch {
    // private window: the choice lasts until the page closes
  }
  applyTheme(theme);
}

export function applyTheme(theme: Theme = getTheme()) {
  const root = document.documentElement;
  if (theme === "system") delete root.dataset.theme;
  else root.dataset.theme = theme;
  const dark = theme === "dark" || (theme === "system" && systemDark.matches);
  // The browser bar / Android status bar colour.
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", dark ? "#111312" : "#168054");
}

systemDark.addEventListener("change", () => applyTheme());
