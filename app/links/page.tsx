"use client";

import { useMemo, useState } from "react";
import { useAudit } from "@/lib/state/AuditContext";
import { Card, EmptyState, MetricCard, PageHeader } from "@/components/ui";
import {
  anchorTextDistribution,
  externalDomainBreakdown,
  flattenLinks,
  linkHealthCounts,
  orphanAndLowLinkPages,
  securityGaps,
  type LinkEntry,
} from "@/lib/linkAnalysis";
import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

const TABS = ["Overview", "Internal Links", "External Links", "Anchor Text", "Opportunities"] as const;
type Tab = (typeof TABS)[number];

const HEALTH_COLORS: Record<string, string> = {
  ok: "#10B981",
  broken: "#DC2626",
  redirect: "#D97706",
  unknown: "#94A3B8",
};
const FOLLOW_COLORS = ["var(--seo-accent)", "#94A3B8"];

const PAGE_SIZE = 50;

type HealthFilter = "all" | "ok" | "broken" | "redirect";
type FollowFilter = "all" | "dofollow" | "nofollow";

export default function LinkAnalysisPage() {
  const { results } = useAudit();
  const [tab, setTab] = useState<Tab>("Overview");
  const [linkFilter, setLinkFilter] = useState<{ health?: HealthFilter; follow?: FollowFilter }>({});

  const internal = useMemo(() => flattenLinks(results, "internal"), [results]);
  const external = useMemo(() => flattenLinks(results, "external"), [results]);
  const allLinks = useMemo(() => [...internal, ...external], [internal, external]);
  const anchorDist = useMemo(() => anchorTextDistribution(allLinks), [allLinks]);
  const { orphan, lowLink } = useMemo(() => orphanAndLowLinkPages(results), [results]);
  const domainStats = useMemo(() => externalDomainBreakdown(external), [external]);
  const health = useMemo(() => linkHealthCounts(allLinks), [allLinks]);
  const gaps = useMemo(() => securityGaps(external), [external]);

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

  function goToTab(t: Tab, filter?: { health?: HealthFilter; follow?: FollowFilter }) {
    setLinkFilter(filter || {});
    setTab(t);
  }

  const healthData = [
    { name: "OK", value: health.ok, key: "ok" },
    { name: "Broken", value: health.broken, key: "broken" },
    { name: "Redirect", value: health.redirect, key: "redirect" },
    { name: "Unknown", value: health.unknown, key: "unknown" },
  ].filter((d) => d.value > 0);

  const followData = [
    { name: "Dofollow", value: allLinks.filter((l) => l.is_dofollow).length },
    { name: "Nofollow", value: allLinks.filter((l) => l.is_nofollow).length },
  ].filter((d) => d.value > 0);

  return (
    <div>
      <PageHeader title="🔗 Link Analysis" subtitle={`Across ${results.length} audited URL(s) · ${allLinks.length} total links`} />

      <div className="mb-4 flex flex-wrap gap-1 border-b border-[var(--seo-border)]">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => goToTab(t)}
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
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <MetricCard label="Internal Links" value={internal.length} onClick={() => goToTab("Internal Links")} />
            <MetricCard label="External Links" value={external.length} onClick={() => goToTab("External Links")} />
            <MetricCard
              label="Broken Internal"
              value={brokenInternal}
              onClick={() => goToTab("Internal Links", { health: "broken" })}
            />
            <MetricCard
              label="Broken External"
              value={brokenExternal}
              onClick={() => goToTab("External Links", { health: "broken" })}
            />
            <MetricCard
              label="Nofollow External"
              value={nofollowExternal}
              onClick={() => goToTab("External Links", { follow: "nofollow" })}
            />
            <MetricCard label="Orphan Pages" value={orphan.length} onClick={() => goToTab("Opportunities")} />
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card>
              <h3 className="mb-3 text-sm font-semibold text-[var(--seo-subheading)]">Link Health</h3>
              {healthData.length ? (
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie
                      data={healthData}
                      dataKey="value"
                      nameKey="name"
                      outerRadius={80}
                      fill="#8884d8"
                      isAnimationActive={false}
                      label
                    >
                      {healthData.map((d, i) => (
                        <Cell key={i} fill={HEALTH_COLORS[d.key]} />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              ) : null}
            </Card>
            <Card>
              <h3 className="mb-3 text-sm font-semibold text-[var(--seo-subheading)]">Dofollow vs Nofollow</h3>
              {followData.length ? (
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie
                      data={followData}
                      dataKey="value"
                      nameKey="name"
                      outerRadius={80}
                      fill="#8884d8"
                      isAnimationActive={false}
                      label
                    >
                      {followData.map((_, i) => (
                        <Cell key={i} fill={FOLLOW_COLORS[i % FOLLOW_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              ) : null}
            </Card>
          </div>

          <Card className="overflow-x-auto p-0">
            <h3 className="px-4 pt-4 text-sm font-semibold text-[var(--seo-subheading)]">
              Top External Domains
            </h3>
            <table className="mt-2 w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--seo-border)] bg-[var(--table-header-bg)] text-left text-xs uppercase tracking-wide text-[var(--seo-muted)]">
                  <th className="px-4 py-3">Domain</th>
                  <th className="px-4 py-3">Category</th>
                  <th className="px-4 py-3">Links</th>
                  <th className="px-4 py-3">Dofollow</th>
                  <th className="px-4 py-3">Broken</th>
                </tr>
              </thead>
              <tbody>
                {domainStats.map((d) => (
                  <tr key={d.domain} className="border-b border-[var(--table-row-border)]">
                    <td className="px-4 py-3 font-medium text-[var(--seo-subheading)]">{d.domain}</td>
                    <td className="px-4 py-3">
                      <span className="rounded-full bg-[var(--seo-accent-light)] px-2 py-0.5 text-xs font-medium text-[var(--seo-accent)]">
                        {d.category}
                      </span>
                    </td>
                    <td className="px-4 py-3">{d.count}</td>
                    <td className="px-4 py-3">{d.dofollow}</td>
                    <td className="px-4 py-3">{d.broken > 0 ? <span className="text-[var(--seo-error)]">{d.broken}</span> : 0}</td>
                  </tr>
                ))}
                {domainStats.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-6 text-center text-[var(--seo-muted)]">
                      No external links found.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </Card>
        </div>
      ) : null}

      {tab === "Internal Links" || tab === "External Links" ? (
        <LinkTable
          links={tab === "Internal Links" ? internal : external}
          showSource={results.length > 1}
          initialFilter={linkFilter}
        />
      ) : null}

      {tab === "Anchor Text" ? (
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--seo-border)] bg-[var(--table-header-bg)] text-left text-xs uppercase tracking-wide text-[var(--seo-muted)]">
                <th className="px-4 py-3">Anchor Text</th>
                <th className="px-4 py-3">Count</th>
                <th className="px-4 py-3">% of Links</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {anchorDist.map((a, i) => (
                <tr key={i} className="border-b border-[var(--table-row-border)]">
                  <td className="px-4 py-3">{a.anchor}</td>
                  <td className="px-4 py-3">{a.count}</td>
                  <td className="px-4 py-3">{a.pct}%</td>
                  <td className="px-4 py-3">
                    {a.isWeak ? (
                      <span className="rounded-full bg-[var(--seo-warning-bg)] px-2 py-0.5 text-xs font-medium text-[var(--seo-warning)]">
                        Weak
                      </span>
                    ) : null}
                  </td>
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
              {orphan.length === 0 ? <li className="text-[var(--seo-muted)]">None found.</li> : null}
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
              {lowLink.length === 0 ? <li className="text-[var(--seo-muted)]">None found.</li> : null}
            </ul>
          </Card>
          <Card>
            <h3 className="mb-2 text-sm font-semibold text-[var(--seo-subheading)]">
              Missing Security Attributes ({gaps.length})
            </h3>
            <p className="mb-2 text-xs text-[var(--seo-text-light)]">
              External links opening in a new tab without <code>rel=&quot;noopener noreferrer&quot;</code> —
              a tabnabbing / performance risk.
            </p>
            <ul className="text-sm text-[var(--seo-text)]">
              {gaps.slice(0, 25).map((l, i) => (
                <li key={i} className="truncate border-b border-[var(--seo-border)] py-1 last:border-0">
                  {l.url} <span className="text-xs text-[var(--seo-muted)]">— {l.anchor_text}</span>
                </li>
              ))}
              {gaps.length === 0 ? <li className="text-[var(--seo-muted)]">None found.</li> : null}
            </ul>
          </Card>
        </div>
      ) : null}
    </div>
  );
}

function LinkTable({
  links,
  showSource,
  initialFilter,
}: {
  links: LinkEntry[];
  showSource: boolean;
  initialFilter: { health?: HealthFilter; follow?: FollowFilter };
}) {
  const [search, setSearch] = useState("");
  const [followFilter, setFollowFilter] = useState<FollowFilter>(initialFilter.follow || "all");
  const [healthFilter, setHealthFilter] = useState<HealthFilter>(initialFilter.health || "all");
  const [page, setPage] = useState(0);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return links.filter((l) => {
      if (q && !l.url.toLowerCase().includes(q) && !(l.anchor_text || "").toLowerCase().includes(q)) return false;
      if (followFilter === "dofollow" && !l.is_dofollow) return false;
      if (followFilter === "nofollow" && !l.is_nofollow) return false;
      if (healthFilter === "broken" && !l.is_broken) return false;
      if (healthFilter === "redirect" && !l.is_redirect) return false;
      if (healthFilter === "ok" && (l.is_broken || l.is_redirect)) return false;
      return true;
    });
  }, [links, search, followFilter, healthFilter]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageSafe = Math.min(page, pageCount - 1);
  const pageLinks = filtered.slice(pageSafe * PAGE_SIZE, pageSafe * PAGE_SIZE + PAGE_SIZE);

  return (
    <div className="flex flex-col gap-3">
      <Card>
        <div className="flex flex-wrap items-center gap-3">
          <input
            type="text"
            placeholder="Search URL or anchor text…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(0);
            }}
            className="min-w-[220px] flex-1 rounded-lg border border-[var(--seo-border-strong)] px-3 py-1.5 text-sm"
          />
          <select
            value={followFilter}
            onChange={(e) => {
              setFollowFilter(e.target.value as FollowFilter);
              setPage(0);
            }}
            className="rounded-lg border border-[var(--seo-border-strong)] px-3 py-1.5 text-sm"
          >
            <option value="all">All follow types</option>
            <option value="dofollow">Dofollow only</option>
            <option value="nofollow">Nofollow only</option>
          </select>
          <select
            value={healthFilter}
            onChange={(e) => {
              setHealthFilter(e.target.value as HealthFilter);
              setPage(0);
            }}
            className="rounded-lg border border-[var(--seo-border-strong)] px-3 py-1.5 text-sm"
          >
            <option value="all">All health</option>
            <option value="ok">OK only</option>
            <option value="broken">Broken only</option>
            <option value="redirect">Redirects only</option>
          </select>
          <span className="text-xs text-[var(--seo-muted)]">{filtered.length} link(s)</span>
        </div>
      </Card>

      <Card className="overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--seo-border)] bg-[var(--table-header-bg)] text-left text-xs uppercase tracking-wide text-[var(--seo-muted)]">
              <th className="px-4 py-3">URL</th>
              {showSource ? <th className="px-4 py-3">Source Page</th> : null}
              <th className="px-4 py-3">Anchor Text</th>
              <th className="px-4 py-3">Follow</th>
              <th className="px-4 py-3">Health</th>
              <th className="px-4 py-3">Flags</th>
            </tr>
          </thead>
          <tbody>
            {pageLinks.map((l, i) => {
              const secGap = l.opens_new_tab && (!l.has_noopener || !l.has_noreferrer);
              return (
                <tr key={i} className="border-b border-[var(--table-row-border)]">
                  <td className="max-w-xs truncate px-4 py-3 text-[var(--seo-subheading)]">{l.url}</td>
                  {showSource ? (
                    <td className="max-w-[10rem] truncate px-4 py-3 text-xs text-[var(--seo-text-light)]">
                      {l.sourceUrl}
                    </td>
                  ) : null}
                  <td className="max-w-xs truncate px-4 py-3 text-[var(--seo-text-light)]">{l.anchor_text}</td>
                  <td className="px-4 py-3">{l.is_dofollow ? "Dofollow" : "Nofollow"}</td>
                  <td className="px-4 py-3 capitalize">
                    <span style={{ color: l.is_broken ? "var(--seo-error)" : "var(--seo-success)" }}>
                      {l.health || (l.is_broken ? "broken" : "ok")}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1">
                      {l.is_weak_anchor ? (
                        <span className="rounded-full bg-[var(--seo-warning-bg)] px-2 py-0.5 text-xs font-medium text-[var(--seo-warning)]">
                          Weak
                        </span>
                      ) : null}
                      {secGap ? (
                        <span className="rounded-full bg-[var(--seo-error-bg)] px-2 py-0.5 text-xs font-medium text-[var(--seo-error)]">
                          No noopener
                        </span>
                      ) : null}
                    </div>
                  </td>
                </tr>
              );
            })}
            {pageLinks.length === 0 ? (
              <tr>
                <td colSpan={showSource ? 6 : 5} className="px-4 py-6 text-center text-[var(--seo-muted)]">
                  No links match this filter.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
        {pageCount > 1 ? (
          <div className="flex items-center justify-between border-t border-[var(--seo-border)] px-4 py-2 text-xs text-[var(--seo-text-light)]">
            <span>
              Page {pageSafe + 1} of {pageCount}
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={pageSafe === 0}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                className="rounded border border-[var(--seo-border-strong)] px-2 py-1 disabled:opacity-40"
              >
                Prev
              </button>
              <button
                type="button"
                disabled={pageSafe >= pageCount - 1}
                onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
                className="rounded border border-[var(--seo-border-strong)] px-2 py-1 disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        ) : null}
      </Card>
    </div>
  );
}
