"use client";

import { useMemo, useState } from "react";
import { useAudit } from "@/lib/state/AuditContext";
import { Card, EmptyState, MetricCard, PageHeader } from "@/components/ui";
import {
  anchorTextDistribution,
  flattenLinks,
  orphanAndLowLinkPages,
} from "@/lib/linkAnalysis";

const TABS = ["Overview", "Internal Links", "External Links", "Anchor Text", "Opportunities"] as const;
type Tab = (typeof TABS)[number];

export default function LinkAnalysisPage() {
  const { results } = useAudit();
  const [tab, setTab] = useState<Tab>("Overview");

  const internal = useMemo(() => flattenLinks(results, "internal"), [results]);
  const external = useMemo(() => flattenLinks(results, "external"), [results]);
  const anchorDist = useMemo(() => anchorTextDistribution([...internal, ...external]), [internal, external]);
  const { orphan, lowLink } = useMemo(() => orphanAndLowLinkPages(results), [results]);

  if (results.length === 0) {
    return (
      <div>
        <PageHeader title="🔗 Link Analysis" />
        <EmptyState title="No audits yet" hint="Run an audit to see link analysis." />
      </div>
    );
  }

  const brokenInternal = internal.filter((l) => l.is_broken).length;
  const brokenExternal = external.filter((l) => l.is_broken).length;
  const nofollowExternal = external.filter((l) => l.is_nofollow).length;

  return (
    <div>
      <PageHeader title="🔗 Link Analysis" subtitle={`Across ${results.length} audited URL(s)`} />

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

      {tab === "Overview" ? (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <MetricCard label="Internal Links" value={internal.length} />
          <MetricCard label="External Links" value={external.length} />
          <MetricCard label="Broken Internal" value={brokenInternal} />
          <MetricCard label="Broken External" value={brokenExternal} />
          <MetricCard label="Nofollow External" value={nofollowExternal} />
          <MetricCard label="Orphan Pages" value={orphan.length} />
        </div>
      ) : null}

      {tab === "Internal Links" || tab === "External Links" ? (
        <LinkTable links={tab === "Internal Links" ? internal : external} />
      ) : null}

      {tab === "Anchor Text" ? (
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--seo-border)] bg-[var(--table-header-bg)] text-left text-xs uppercase tracking-wide text-[var(--seo-muted)]">
                <th className="px-4 py-3">Anchor Text</th>
                <th className="px-4 py-3">Count</th>
                <th className="px-4 py-3">% of Links</th>
              </tr>
            </thead>
            <tbody>
              {anchorDist.map((a, i) => (
                <tr key={i} className="border-b border-[var(--table-row-border)]">
                  <td className="px-4 py-3">{a.anchor}</td>
                  <td className="px-4 py-3">{a.count}</td>
                  <td className="px-4 py-3">{a.pct}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      ) : null}

      {tab === "Opportunities" ? (
        <div className="flex flex-col gap-4">
          <Card>
            <h3 className="mb-2 text-sm font-semibold text-[var(--seo-subheading)]">
              Orphan Pages ({orphan.length})
            </h3>
            <p className="mb-2 text-xs text-[var(--seo-text-light)]">
              Audited pages with zero inbound internal links from other audited pages.
            </p>
            <ul className="list-inside list-disc text-sm text-[var(--seo-text)]">
              {orphan.map((url) => (
                <li key={url} className="truncate">{url}</li>
              ))}
            </ul>
          </Card>
          <Card>
            <h3 className="mb-2 text-sm font-semibold text-[var(--seo-subheading)]">
              Low Internal Links ({lowLink.length})
            </h3>
            <p className="mb-2 text-xs text-[var(--seo-text-light)]">
              Pages with fewer than 3 inbound internal links.
            </p>
            <ul className="list-inside list-disc text-sm text-[var(--seo-text)]">
              {lowLink.map((url) => (
                <li key={url} className="truncate">{url}</li>
              ))}
            </ul>
          </Card>
        </div>
      ) : null}
    </div>
  );
}

function LinkTable({ links }: { links: ReturnType<typeof flattenLinks> }) {
  return (
    <Card className="overflow-x-auto p-0">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[var(--seo-border)] bg-[var(--table-header-bg)] text-left text-xs uppercase tracking-wide text-[var(--seo-muted)]">
            <th className="px-4 py-3">URL</th>
            <th className="px-4 py-3">Anchor Text</th>
            <th className="px-4 py-3">Follow</th>
            <th className="px-4 py-3">Health</th>
          </tr>
        </thead>
        <tbody>
          {links.slice(0, 300).map((l, i) => (
            <tr key={i} className="border-b border-[var(--table-row-border)]">
              <td className="max-w-xs truncate px-4 py-3 text-[var(--seo-subheading)]">{l.url}</td>
              <td className="max-w-xs truncate px-4 py-3 text-[var(--seo-text-light)]">
                {l.anchor_text}
              </td>
              <td className="px-4 py-3">{l.is_dofollow ? "Dofollow" : "Nofollow"}</td>
              <td className="px-4 py-3 capitalize">
                <span
                  style={{
                    color: l.is_broken ? "var(--seo-error)" : "var(--seo-success)",
                  }}
                >
                  {l.health || (l.is_broken ? "broken" : "ok")}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}
