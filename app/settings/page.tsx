"use client";

import { useEffect, useState } from "react";
import { useAudit } from "@/lib/state/AuditContext";
import { Card, PageHeader } from "@/components/ui";

export default function SettingsPage() {
  const { results, clearAll } = useAudit();
  const [psiConfigured, setPsiConfigured] = useState<boolean | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);

  useEffect(() => {
    fetch("/api/config-status")
      .then((r) => r.json())
      .then((d) => setPsiConfigured(Boolean(d.psiConfigured)))
      .catch(() => setPsiConfigured(false));
  }, []);

  return (
    <div className="max-w-2xl">
      <PageHeader title="⚙️ Settings" />

      <Card className="mb-4">
        <h3 className="mb-2 text-sm font-semibold text-[var(--seo-subheading)]">
          PageSpeed Insights API Key
        </h3>
        <p className="mb-3 text-sm text-[var(--seo-text-light)]">
          Used for live Core Web Vitals data on the Performance Audit page. Without
          a key, PageSpeed still works via Google&apos;s anonymous quota (100
          requests/day per IP) — a key raises that to 25,000/day.
        </p>
        <div className="flex items-center gap-2 text-sm">
          <span
            className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold"
            style={{
              color: psiConfigured ? "var(--seo-success)" : "var(--seo-warning)",
              backgroundColor: psiConfigured ? "var(--seo-success-bg)" : "var(--seo-warning-bg)",
            }}
          >
            {psiConfigured === null ? "Checking…" : psiConfigured ? "Configured" : "Not configured"}
          </span>
        </div>
        <p className="mt-3 text-xs text-[var(--seo-muted)]">
          To set it: open this project in the Vercel dashboard → Settings →
          Environment Variables → add <code>PSI_API_KEY</code> → redeploy.
        </p>
      </Card>

      <Card>
        <h3 className="mb-2 text-sm font-semibold text-[var(--seo-subheading)]">
          Session Data
        </h3>
        <p className="mb-3 text-sm text-[var(--seo-text-light)]">
          {results.length} audit result(s) stored in this browser (localStorage).
        </p>
        <button
          type="button"
          onClick={() => {
            if (!confirmClear) {
              setConfirmClear(true);
              return;
            }
            clearAll();
            setConfirmClear(false);
          }}
          className="rounded-lg border border-[var(--seo-error-border)] px-3 py-1.5 text-sm font-medium text-[var(--seo-error)] hover:bg-[var(--seo-error-bg)]"
        >
          {confirmClear ? "Confirm clear all audit data?" : "Clear all audit data"}
        </button>
      </Card>
    </div>
  );
}
