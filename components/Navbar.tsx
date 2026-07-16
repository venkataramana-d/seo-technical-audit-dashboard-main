"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import type { ComponentType, SVGProps } from "react";
import { ThemeToggle } from "@/components/ThemeToggle";
import { GlobalSearch } from "@/components/GlobalSearch";
import {
  GaugeIcon,
  ListChecksIcon,
  PlusIcon,
  ScanIcon,
  SearchIcon,
  SettingsIcon,
  XIcon,
} from "@/components/icons";

type IconType = ComponentType<SVGProps<SVGSVGElement> & { size?: number }>;

interface NavItem {
  href: string;
  icon: IconType;
  label: string;
}

const NAV_ITEMS: NavItem[] = [
  { href: "/", icon: GaugeIcon, label: "Dashboard" },
  { href: "/technical-audit", icon: ScanIcon, label: "Technical Audit" },
  // Results is the single per-URL section: the list lives at /results and
  // the drill-down (with Links / Headings / Performance tabs) at /detail.
  { href: "/results", icon: ListChecksIcon, label: "Results" },
  { href: "/settings", icon: SettingsIcon, label: "Settings" },
];

// The detail drill-down (/detail) belongs to the Results section; highlight
// "Results" while on it.
function resolveActiveHref(pathname: string): string {
  return pathname === "/detail" ? "/results" : pathname;
}

function NavItemLink({
  item,
  pathname,
  onNavigate,
}: {
  item: NavItem;
  pathname: string;
  onNavigate?: () => void;
}) {
  const active = resolveActiveHref(pathname) === item.href;
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={`flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-[13px] font-medium transition-colors ${
        active
          ? "bg-[var(--seo-accent-light)] text-[var(--seo-accent)]"
          : "text-[var(--seo-text-light)] hover:bg-[var(--seo-card-hover)] hover:text-[var(--seo-heading)]"
      }`}
    >
      <Icon size={16} className="shrink-0" />
      <span>{item.label}</span>
    </Link>
  );
}

export function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const activeItem = NAV_ITEMS.find((item) => item.href === resolveActiveHref(pathname));

  return (
    <header className="sticky top-0 z-40 border-b border-[var(--seo-border)] bg-[color-mix(in_srgb,var(--seo-card-bg)_88%,transparent)] backdrop-blur-md">
      <div className="flex items-center gap-3 px-4 py-2.5 md:px-6">
        <Link href="/" className="flex shrink-0 items-center gap-2 pr-1">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--seo-accent)] text-white">
            <SearchIcon size={16} />
          </span>
          <span className="text-[15px] font-semibold tracking-tight text-[var(--seo-heading)] whitespace-nowrap">
            SEO Audit
          </span>
        </Link>

        <div className="mx-1 hidden h-5 w-px bg-[var(--seo-border)] md:block" />

        {/* Desktop nav links */}
        <nav className="hidden items-center gap-0.5 md:flex">
          {NAV_ITEMS.map((item) => (
            <NavItemLink key={item.href} item={item} pathname={pathname} />
          ))}
        </nav>

        <div className="flex-1" />

        {/* Desktop: search, quick action, session pill, theme toggle */}
        <div className="hidden items-center gap-2.5 md:flex">
          <GlobalSearch />
          <button
            type="button"
            onClick={() => router.push("/technical-audit")}
            className="flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg btn-gradient px-3 py-1.5 text-[13px] font-semibold text-white"
          >
            <PlusIcon size={15} />
            New Audit
          </button>
          <ThemeToggle />
        </div>

        {/* Mobile: hamburger */}
        <button
          type="button"
          aria-label={mobileOpen ? "Close menu" : "Open menu"}
          onClick={() => setMobileOpen((v) => !v)}
          className="rounded-lg p-2 text-[var(--seo-text)] hover:bg-[var(--seo-card-hover)] md:hidden"
        >
          {mobileOpen ? (
            <XIcon size={18} />
          ) : (
            <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" aria-hidden="true">
              <path d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          )}
        </button>
      </div>

      {/* Mobile active-page label, mirrors the old top bar */}
      {!mobileOpen ? (
        <div className="flex items-center gap-2 border-t border-[var(--seo-border)] px-4 py-2 text-sm font-semibold text-[var(--seo-heading)] md:hidden">
          {activeItem ? (
            <>
              <activeItem.icon size={16} className="text-[var(--seo-accent)]" />
              {activeItem.label}
            </>
          ) : (
            "SEO Audit"
          )}
        </div>
      ) : null}

      {/* Mobile dropdown menu */}
      {mobileOpen ? (
        <div className="flex flex-col gap-3 border-t border-[var(--seo-border)] bg-[var(--seo-card-bg)] px-4 py-4 md:hidden">
          <GlobalSearch onNavigate={() => setMobileOpen(false)} />
          <nav className="flex flex-col gap-1">
            {NAV_ITEMS.map((item) => (
              <NavItemLink
                key={item.href}
                item={item}
                pathname={pathname}
                onNavigate={() => setMobileOpen(false)}
              />
            ))}
          </nav>
          <button
            type="button"
            onClick={() => {
              setMobileOpen(false);
              router.push("/technical-audit");
            }}
            className="flex items-center justify-center gap-1.5 rounded-lg btn-gradient px-3 py-2 text-center text-sm font-semibold text-white"
          >
            <PlusIcon size={15} />
            New Audit
          </button>
          <div className="flex items-center justify-end border-t border-[var(--seo-border)] pt-3">
            <ThemeToggle />
          </div>
        </div>
      ) : null}
    </header>
  );
}
