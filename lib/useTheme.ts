"use client";

import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "seo-audit-theme";

// Sidebar ThemeToggle and the Settings page toggle can be mounted at the same
// time; a plain localStorage read only syncs on next mount/reload, so this
// pub-sub keeps every mounted instance in sync the moment either one flips.
type Listener = (dark: boolean) => void;
const listeners = new Set<Listener>();

function applyTheme(dark: boolean) {
  document.documentElement.classList.toggle("dark", dark);
}

function getInitial(): boolean {
  if (typeof window === "undefined") return false;
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored ? stored === "dark" : document.documentElement.classList.contains("dark");
}

export function useTheme() {
  const [dark, setDarkState] = useState(getInitial);

  useEffect(() => {
    const listener: Listener = (next) => setDarkState(next);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  const setDark = useCallback((next: boolean) => {
    applyTheme(next);
    try {
      localStorage.setItem(STORAGE_KEY, next ? "dark" : "light");
    } catch {
      /* ignore */
    }
    setDarkState(next);
    listeners.forEach((l) => l(next));
  }, []);

  const toggle = useCallback(() => setDark(!dark), [dark, setDark]);

  return { dark, setDark, toggle };
}

/** Inline script for app/layout.tsx <head>, sets .dark before hydration to avoid a flash of the wrong theme. */
export const themeInitScript = `
(function () {
  try {
    var stored = localStorage.getItem('${STORAGE_KEY}');
    var dark = stored ? stored === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
    if (dark) document.documentElement.classList.add('dark');
  } catch (e) {}
})();
`;
