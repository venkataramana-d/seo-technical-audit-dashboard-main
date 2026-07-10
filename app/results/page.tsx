"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAudit } from "@/lib/state/AuditContext";
import { Card, EmptyState, PageHeader, ScoreBadge } from "@/components/ui";

export default function ResultsPage() {
  const { results, navFilter, setNavFilter, setSelectedUrlIndex, clearAll } = useAudit();
  const router = useRouter();

  const [scoreMax, setScoreMax] = useState(100);
  const [brokenOnly, setBrokenOnly] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);

  useEffect(() => {
    if (!navFilter) return;
    if (navFilter.kind === "score" && navFilter.key === "critical_urls") {
      setScoreMax(49);
    }
    setNavFilter(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navFilter]);

  const filtered = useMemo(() => {
    return results.filter((r) => {
      if ((r.seo_score ?? 0) > scoreMax) return false;
      if (brokenOnly) {
        const brokenInt = r.internal_links?.broken_count || 0;
        const brokenExt = r.external_links?.broken_count || 0;
        if (brokenInt + brokenExt === 0) return false;
      }
      return true;
    });
  }, [results, scoreMax, brokenOnly]);

  if (results.length === 0) {
    return (
      <div>
        <PageHeader title="📋 Audit Results" />
        <EmptyState title="No audits yet" hint="Run an audit to see results here." />
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="📋 Audit Results" subtitle={`${filtered.length} of ${results.length} URLs`} />

      <Card className="mb-4">
        <div className="flex flex-wrap items-end gap-6">
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--seo-muted)]">
              Max score: {scoreMax}
            </label>
            <input
              type="range"
              min={0}
              max={100}
              value={scoreMax}
              onChange={(e) => setScoreMax(Number(e.target.value))}
              className="w-48"
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-[var(--seo-text)]">
            <input
              type="checkbox"
              checked={brokenOnly}
              onChange={(e) => setBrokenOnly(e.target.checked)}
            />
            Broken links only
          </label>
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
            className="ml-auto rounded-lg border border-[var(--seo-error-border)] px-3 py-1.5 text-sm font-medium text-[var(--seo-error)] hover:bg-[var(--seo-error-bg)]"
          >
            {confirmClear ? "Confirm clear all results?" : "Clear All Results"}
          </button>
        </div>
      </Card>

      <Card className="overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--seo-border)] bg-[var(--table-header-bg)] text-left text-xs uppercase tracking-wide text-[var(--seo-muted)]">
              <th className="px-4 py-3">URL</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Score</th>
              <th className="px-4 py-3">Issues</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {filtered.map((r, idx) => {
              const originalIdx = results.indexOf(r);
              return (
                <tr
                  key={r.url + idx}
                  className="border-b border-[var(--table-row-border)] hover:bg-[var(--table-row-hover)]"
                >
                  <td className="max-w-xs truncate px-4 py-3 font-medium text-[var(--seo-subheading)]">
                    {r.url}
                  </td>
                  <td className="px-4 py-3 capitalize text-[var(--seo-text-light)]">
                    {r.audit_type}
                  </td>
                  <td className="px-4 py-3 text-[var(--seo-text-light)]">{r.status_code ?? "—"}</td>
                  <td className="px-4 py-3">
                    <ScoreBadge score={r.seo_score ?? 0} />
                  </td>
                  <td className="px-4 py-3 text-[var(--seo-text-light)]">
                    {r.all_issues?.length ?? 0}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedUrlIndex(originalIdx);
                        router.push("/detail");
                      }}
                      className="text-sm font-medium text-[var(--seo-accent)] hover:underline"
                    >
                      View Detail →
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
