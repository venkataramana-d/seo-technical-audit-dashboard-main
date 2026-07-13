"use client";

import { useState } from "react";
import { useAudit } from "@/lib/state/AuditContext";
import { Card, EmptyState, PageHeader, ScoreBadge } from "@/components/ui";

const FORMATS = [
  { id: "csv", label: "CSV", desc: "Flat summary — one row per URL." },
  { id: "xlsx", label: "Excel", desc: "Multi-sheet workbook: Summary, Issues, Links." },
  { id: "pdf", label: "PDF", desc: "Formatted report for sharing." },
  { id: "json", label: "JSON", desc: "Full raw audit data for every URL." },
] as const;

export default function ExportPage() {
  const { results } = useAudit();
  const [loadingFormat, setLoadingFormat] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (results.length === 0) {
    return (
      <div>
        <PageHeader title="📤 Export Reports" />
        <EmptyState title="No audits yet" hint="Run an audit to export a report." />
      </div>
    );
  }

  async function handleExport(format: string) {
    setLoadingFormat(format);
    setError(null);
    try {
      const res = await fetch("/api/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ results, format }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Export failed.");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `seo-audit-report.${format}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Export failed.");
    } finally {
      setLoadingFormat(null);
    }
  }

  return (
    <div>
      <PageHeader title="📤 Export Reports" subtitle={`${results.length} URL(s) in this session`} />

      {error ? (
        <div className="mb-4 rounded-lg border border-[var(--seo-error-border)] bg-[var(--seo-error-bg)] px-3 py-2 text-sm text-[var(--seo-error)]">
          {error}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {FORMATS.map((f) => (
          <Card key={f.id}>
            <h3 className="text-sm font-semibold text-[var(--seo-subheading)]">{f.label}</h3>
            <p className="mt-1 text-xs text-[var(--seo-text-light)]">{f.desc}</p>
            <button
              type="button"
              onClick={() => handleExport(f.id)}
              disabled={loadingFormat !== null}
              className="mt-3 w-full rounded-lg bg-[var(--seo-accent)] px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
            >
              {loadingFormat === f.id ? "Generating…" : `Download ${f.label}`}
            </button>
          </Card>
        ))}
      </div>

      <Card className="mt-6 overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--seo-border)] bg-[var(--table-header-bg)] text-left text-xs uppercase tracking-wide text-[var(--seo-muted)]">
              <th className="px-4 py-3">URL</th>
              <th className="px-4 py-3">Score</th>
              <th className="px-4 py-3">Issues</th>
            </tr>
          </thead>
          <tbody>
            {results.map((r) => (
              <tr key={r.url} className="border-b border-[var(--table-row-border)]">
                <td className="max-w-md truncate px-4 py-3">{r.url}</td>
                <td className="px-4 py-3">
                  <ScoreBadge score={r.seo_score ?? 0} />
                </td>
                <td className="px-4 py-3">{r.all_issues?.length ?? 0}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
