"use client";

import { useSyncExternalStore } from "react";
import { Select } from "@/components/ui/select";
import { THEME_CHANGE_EVENT, THEME_STORAGE_KEY, type ThemeChoice, isThemeChoice } from "./theme";

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(THEME_CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(THEME_CHANGE_EVENT, onChange);
  };
}

function readChoice(): ThemeChoice {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    return isThemeChoice(stored) ? stored : "system";
  } catch {
    return "system";
  }
}

function applyChoice(choice: ThemeChoice) {
  if (choice === "system") document.documentElement.removeAttribute("data-theme");
  else document.documentElement.setAttribute("data-theme", choice);
  try {
    if (choice === "system") localStorage.removeItem(THEME_STORAGE_KEY);
    else localStorage.setItem(THEME_STORAGE_KEY, choice);
  } catch {
    // Storage can be unavailable (private mode); the choice still applies for this page.
  }
  window.dispatchEvent(new Event(THEME_CHANGE_EVENT));
}

/** Theme picker: follow the system, or force light or dark. Remembered per browser. */
export function ThemeSelect() {
  const choice = useSyncExternalStore(subscribe, readChoice, () => "system" as ThemeChoice);

  return (
    <div className="flex items-center gap-2">
      <label htmlFor="theme-select" className="sr-only">
        Theme
      </label>
      <Select
        id="theme-select"
        value={choice}
        onChange={(event) => {
          const next = event.target.value;
          if (isThemeChoice(next)) applyChoice(next);
        }}
        className="h-8 w-auto py-0 pr-8 text-label"
      >
        <option value="system">System theme</option>
        <option value="light">Light theme</option>
        <option value="dark">Dark theme</option>
      </Select>
    </div>
  );
}
