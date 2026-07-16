"use client";

import { useTheme } from "@/lib/useTheme";
import { MoonIcon, SunIcon } from "@/components/icons";

export { themeInitScript } from "@/lib/useTheme";

export function ThemeToggle() {
  const { dark, toggle } = useTheme();

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
      title={dark ? "Switch to light mode" : "Switch to dark mode"}
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[var(--seo-border)] text-[var(--seo-text-light)] transition-colors hover:bg-[var(--seo-card-hover)] hover:text-[var(--seo-heading)]"
    >
      {dark ? <MoonIcon size={16} /> : <SunIcon size={16} />}
    </button>
  );
}
