"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

const NAV_ITEMS = [
  { href: "/", icon: "📊", label: "Dashboard Overview" },
  { href: "/new-audit", icon: "🚀", label: "New Audit" },
  { href: "/results", icon: "📋", label: "Audit Results" },
  { href: "/detail", icon: "🔎", label: "URL Detail" },
  { href: "/links", icon: "🔗", label: "Link Analysis" },
  { href: "/performance", icon: "⚡", label: "Performance Audit" },
  { href: "/headings", icon: "📝", label: "Heading Analysis" },
  { href: "/export", icon: "📤", label: "Export Reports" },
  { href: "/settings", icon: "⚙️", label: "Settings" },
];

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="flex min-h-screen">
      <aside className="w-64 shrink-0 border-r border-[var(--seo-border)] bg-[var(--seo-card-bg)] px-4 py-6">
        <div className="mb-6 px-2">
          <h1 className="text-lg font-bold text-[var(--seo-heading)] tracking-tight">
            🔍 SEO Audit
          </h1>
          <p className="mt-1 text-xs text-[var(--seo-muted)]">
            Technical Audit Dashboard
          </p>
        </div>
        <nav className="flex flex-col gap-1">
          {NAV_ITEMS.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  active
                    ? "bg-[var(--seo-accent-light)] text-[var(--seo-accent)]"
                    : "text-[var(--seo-text-light)] hover:bg-[var(--seo-card-hover)]"
                }`}
              >
                <span>{item.icon}</span>
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </aside>
      <main className="flex-1 px-8 py-6">{children}</main>
    </div>
  );
}
