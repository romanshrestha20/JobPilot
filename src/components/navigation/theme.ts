export type ThemeChoice = "system" | "light" | "dark";

export const THEME_STORAGE_KEY = "jobpilot-theme";
export const THEME_CHANGE_EVENT = "jobpilot-theme-change";

export function isThemeChoice(value: unknown): value is ThemeChoice {
  return value === "system" || value === "light" || value === "dark";
}

/**
 * Runs before first paint (inline in <head>) so a saved choice never flashes the other theme.
 * "system" is the absence of `data-theme`, which leaves the OS preference in charge.
 */
export const THEME_INIT_SCRIPT = `try{var t=localStorage.getItem(${JSON.stringify(
  THEME_STORAGE_KEY,
)});if(t==="light"||t==="dark")document.documentElement.setAttribute("data-theme",t)}catch(e){}`;
