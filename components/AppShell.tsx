"use client";

import type { ReactNode } from "react";
import { Navbar } from "@/components/Navbar";
import { useAudit } from "@/lib/state/AuditContext";

export function AppShell({ children }: { children: ReactNode }) {
  const { storageWarning } = useAudit();

  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />
      {/* Centered content column: every page renders inside a max-width
          container centered on the page (was pinned to the left edge with a
          large empty gap on wide screens). */}
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 md:px-8">
        {storageWarning ? (
          <div className="mb-4 rounded-lg border border-[var(--seo-warning-border)] bg-[var(--seo-warning-bg)] px-3 py-2 text-sm text-[var(--seo-warning)]">
            {storageWarning}
          </div>
        ) : null}
        {children}
      </main>
    </div>
  );
}
