"use client";

import { useState } from "react";
import { useAudit } from "@/lib/state/AuditContext";
import { Card, EmptyState, IssueRow, MetricCard, PageHeader } from "@/components/ui";

const TABS = ["Hierarchy Tree", "Heading List", "H1 Across Site", "Issues"] as const;
type Tab = (typeof TABS)[number];

function downloadCsv(filename: string, rows: string[][]) {
  const csv = rows
    .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
    .join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function HeadingsPage() {
  const { results } = useAudit();
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [tab, setTab] = useState<Tab>("Hierarchy Tree");

  if (results.length === 0) {
    return (
      <div>
        <PageHeader title="📝 Heading Analysis" />
        <EmptyState title="No audits yet" hint="Run an audit to see heading structure." />
      </div>
    );
  }

  const r = results[Math.min(selectedIdx, results.length - 1)];
  const hd = r.heading_detail || {};
  const headings: any[] = hd.headings || [];
  const counts = hd.counts || {};
  const issues = hd.issues || [];

  function exportUrlCsv() {
    const rows = [["Level", "Text", "Length", "Empty"]];
    for (const h of headings) rows.push([`H${h.level}`, h.text, String(h.length), h.is_empty ? "Yes" : "No"]);
    downloadCsv(`headings-${r.url.replace(/[^a-z0-9]/gi, "-")}.csv`, rows);
  }

  function exportSiteH1Csv() {
    const rows = [["URL", "H1 Text", "H1 Count"]];
    for (const res of results) {
      rows.push([res.url, res.heading_detail?.h1_text || "", String(res.heading_detail?.counts?.h1 ?? 0)]);
    }
    downloadCsv("site-h1-report.csv", rows);
  }

  return (
    <div>
      <PageHeader title="📝 Heading Analysis" subtitle={r.url} />

      {results.length > 1 ? (
        <select
          value={selectedIdx}
          onChange={(e) => setSelectedIdx(Number(e.target.value))}
          className="mb-4 rounded-lg border border-[var(--seo-border-strong)] bg-white px-3 py-2 text-sm"
        >
          {results.map((res, i) => (
            <option key={res.url} value={i}>
              {res.url}
            </option>
          ))}
        </select>
      ) : null}

      <div className="mb-4 grid grid-cols-3 gap-4 md:grid-cols-6">
        {(["h1", "h2", "h3", "h4", "h5", "h6"] as const).map((lvl) => (
          <MetricCard key={lvl} label={lvl.toUpperCase()} value={counts[lvl] ?? 0} />
        ))}
      </div>

      <div className="mb-4 flex flex-wrap gap-1 border-b border-[var(--seo-border)]">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-t-lg px-3 py-2 text-sm font-medium ${
              tab === t
                ? "border-b-2 border-[var(--seo-accent)] text-[var(--seo-accent)]"
                : "text-[var(--seo-text-light)] hover:text-[var(--seo-subheading)]"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "Hierarchy Tree" ? (
        <Card>
          <div className="flex flex-col gap-1">
            {headings.map((h, i) => (
              <div
                key={i}
                className="text-sm"
                style={{ paddingLeft: `${(h.level - 1) * 1.25}rem` }}
              >
                <span className="mr-2 rounded bg-[var(--seo-accent-light)] px-1.5 py-0.5 text-xs font-semibold text-[var(--seo-accent)]">
                  H{h.level}
                </span>
                <span className={h.is_empty ? "text-[var(--seo-error)] italic" : "text-[var(--seo-text)]"}>
                  {h.is_empty ? "(empty heading)" : h.text}
                </span>
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      {tab === "Heading List" ? (
        <Card className="overflow-x-auto p-0">
          <div className="flex justify-end p-3">
            <button
              onClick={exportUrlCsv}
              className="rounded-lg border border-[var(--seo-border-strong)] px-3 py-1.5 text-xs font-medium hover:bg-[var(--seo-card-hover)]"
            >
              Export CSV
            </button>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--seo-border)] bg-[var(--table-header-bg)] text-left text-xs uppercase tracking-wide text-[var(--seo-muted)]">
                <th className="px-4 py-3">Level</th>
                <th className="px-4 py-3">Text</th>
                <th className="px-4 py-3">Length</th>
              </tr>
            </thead>
            <tbody>
              {headings.map((h, i) => (
                <tr key={i} className="border-b border-[var(--table-row-border)]">
                  <td className="px-4 py-3">H{h.level}</td>
                  <td className="px-4 py-3">{h.is_empty ? <em>(empty)</em> : h.text}</td>
                  <td className="px-4 py-3">{h.length}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      ) : null}

      {tab === "H1 Across Site" ? (
        <Card className="overflow-x-auto p-0">
          <div className="flex justify-end p-3">
            <button
              onClick={exportSiteH1Csv}
              className="rounded-lg border border-[var(--seo-border-strong)] px-3 py-1.5 text-xs font-medium hover:bg-[var(--seo-card-hover)]"
            >
              Export CSV
            </button>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--seo-border)] bg-[var(--table-header-bg)] text-left text-xs uppercase tracking-wide text-[var(--seo-muted)]">
                <th className="px-4 py-3">URL</th>
                <th className="px-4 py-3">H1 Text</th>
                <th className="px-4 py-3">H1 Count</th>
              </tr>
            </thead>
            <tbody>
              {results.map((res) => (
                <tr key={res.url} className="border-b border-[var(--table-row-border)]">
                  <td className="max-w-xs truncate px-4 py-3">{res.url}</td>
                  <td className="px-4 py-3">{res.heading_detail?.h1_text || <em>none</em>}</td>
                  <td className="px-4 py-3">{res.heading_detail?.counts?.h1 ?? 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      ) : null}

      {tab === "Issues" ? (
        <Card>
          {issues.map((issue: any, i: number) => (
            <IssueRow key={i} issue={issue} />
          ))}
          {issues.length === 0 ? (
            <div className="py-4 text-sm text-[var(--seo-muted)]">No heading issues found.</div>
          ) : null}
        </Card>
      ) : null}
    </div>
  );
}
