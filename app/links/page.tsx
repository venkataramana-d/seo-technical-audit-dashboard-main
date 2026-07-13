"use client";

import { useMemo, useState } from "react";
import { useAudit } from "@/lib/state/AuditContext";
import { Card, EmptyState, MetricCard, PageHeader } from "@/components/ui";
import {
  anchorTextDistribution,
  buildExecutiveSummary,
  externalDomainBreakdown,
  flattenLinks,
  flattenSpecialLinks,
  linkCertainty,
  linkHealthCounts,
  orphanAndLowLinkPages,
  priorityScore,
  securityGaps,
  type LinkEntry,
  type SpecialLinkEntry,
} from "@/lib/linkAnalysis";
import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

const TABS = [
  "Overview",
  "Internal Links",
  "External Links",
  "Special Links",
  "Anchor Text",
  "Opportunities",
] as const;
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
type CategoryFilter = "all" | "page" | "pdf" | "download" | "image";
type SortKey = "priority" | "response_time_ms" | "url" | "health";

function downloadCsv(filename: string, rows: string[][]) {
  const csv = rows
    .map((row) => row.map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`).join(","))
    .join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function LinkAnalysisPage() {
  const { results } = useAudit();
  const [tab, setTab] = useState<Tab>("Overview");
  const [linkFilter, setLinkFilter] = useState<{ health?: HealthFilter; follow?: FollowFilter }>({});

  const internal = useMemo(() => flattenLinks(results, "internal"), [results]);
  const external = useMemo(() => flattenLinks(results, "external"), [results]);
  const allLinks = useMemo(() => [...internal, ...external], [internal, external]);
  const specialLinks = useMemo(() => flattenSpecialLinks(results), [results]);
  const anchorDist = useMemo(() => anchorTextDistribution(allLinks), [allLinks]);
  const { orphan, lowLink } = useMemo(() => orphanAndLowLinkPages(results), [results]);
  const domainStats = useMemo(() => externalDomainBreakdown(external), [external]);
  const health = useMemo(() => linkHealthCounts(allLinks), [allLinks]);
  const gaps = useMemo(() => securityGaps(external), [external]);
  const summary = useMemo(() => buildExecutiveSummary(allLinks, orphan.length), [allLinks, orphan.length]);
  const homepageUrl = results[0]?.url;

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
      <PageHeader
        title="🔗 Link Analysis"
        subtitle={`Across ${results.length} audited URL(s) · ${allLinks.length} links · ${specialLinks.length} special links (mailto/tel/anchor/js)`}
      />

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
          <Card>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-[var(--seo-subheading)]">
                Executive Summary
              </h3>
              <span className="text-xs text-[var(--seo-muted)]" title="Computed deterministically from the audit data below — not an LLM-generated write-up.">
                Rule-based summary
              </span>
            </div>
            <div className="mb-3 flex items-center gap-3">
              <span
                className="text-3xl font-bold"
                style={{ color: summary.linkHealthScore >= 90 ? "var(--seo-success)" : summary.linkHealthScore >= 70 ? "var(--seo-accent)" : summary.linkHealthScore >= 50 ? "var(--seo-warning)" : "var(--seo-error)" }}
              >
                {summary.linkHealthScore}
              </span>
              <span className="text-sm text-[var(--seo-text-light)]">Link Health Score</span>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-[var(--seo-muted)]">
                  Top Priority Fixes
                </h4>
                {summary.topPriorityFixes.length ? (
                  <ul className="list-inside list-disc text-sm text-[var(--seo-text)]">
                    {summary.topPriorityFixes.map((f, i) => (
                      <li key={i}>{f}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-[var(--seo-muted)]">No broken or redirecting links found.</p>
                )}
              </div>
              <div>
                <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-[var(--seo-muted)]">
                  Quick Wins
                </h4>
                {summary.quickWins.length ? (
                  <ul className="list-inside list-disc text-sm text-[var(--seo-text)]">
                    {summary.quickWins.map((f, i) => (
                      <li key={i}>{f}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-[var(--seo-muted)]">Nothing quick to fix — nice work.</p>
                )}
              </div>
            </div>
          </Card>

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
            <MetricCard label="Special Links" value={specialLinks.length} onClick={() => goToTab("Special Links")} />
            <MetricCard label="Security Gaps" value={gaps.length} onClick={() => goToTab("Opportunities")} />
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
          kind={tab === "Internal Links" ? "internal" : "external"}
          showSource={results.length > 1}
          initialFilter={linkFilter}
          homepageUrl={homepageUrl}
        />
      ) : null}

      {tab === "Special Links" ? <SpecialLinksTable links={specialLinks} showSource={results.length > 1} /> : null}

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
  kind,
  showSource,
  initialFilter,
  homepageUrl,
}: {
  links: LinkEntry[];
  kind: "internal" | "external";
  showSource: boolean;
  initialFilter: { health?: HealthFilter; follow?: FollowFilter };
  homepageUrl?: string;
}) {
  const [search, setSearch] = useState("");
  const [followFilter, setFollowFilter] = useState<FollowFilter>(initialFilter.follow || "all");
  const [healthFilter, setHealthFilter] = useState<HealthFilter>(initialFilter.health || "all");
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>("all");
  const [showDetails, setShowDetails] = useState(false);
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "priority", dir: -1 });
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const withPriority = useMemo(
    () =>
      links.map((l) => ({
        ...l,
        __priority: priorityScore(l, kind, homepageUrl ? l.sourceUrl === homepageUrl : false),
      })),
    [links, kind, homepageUrl],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return withPriority.filter((l) => {
      if (q && !l.url.toLowerCase().includes(q) && !(l.anchor_text || "").toLowerCase().includes(q)) return false;
      if (followFilter === "dofollow" && !l.is_dofollow) return false;
      if (followFilter === "nofollow" && !l.is_nofollow) return false;
      if (healthFilter === "broken" && !l.is_broken) return false;
      if (healthFilter === "redirect" && !l.is_redirect) return false;
      if (healthFilter === "ok" && (l.is_broken || l.is_redirect)) return false;
      if (categoryFilter !== "all" && (l.link_category || "page") !== categoryFilter) return false;
      return true;
    });
  }, [withPriority, search, followFilter, healthFilter, categoryFilter]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => {
      let av: number | string = 0;
      let bv: number | string = 0;
      if (sort.key === "priority") {
        av = a.__priority;
        bv = b.__priority;
      } else if (sort.key === "response_time_ms") {
        av = a.response_time_ms ?? -1;
        bv = b.response_time_ms ?? -1;
      } else if (sort.key === "url") {
        av = a.url;
        bv = b.url;
      } else if (sort.key === "health") {
        av = a.health || "";
        bv = b.health || "";
      }
      if (av < bv) return -sort.dir;
      if (av > bv) return sort.dir;
      return 0;
    });
    return arr;
  }, [filtered, sort]);

  const pageCount = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const pageSafe = Math.min(page, pageCount - 1);
  const pageLinks = sorted.slice(pageSafe * PAGE_SIZE, pageSafe * PAGE_SIZE + PAGE_SIZE);

  function toggleSort(key: SortKey) {
    setSort((s) => (s.key === key ? { key, dir: s.dir === 1 ? -1 : 1 } : { key, dir: -1 }));
  }

  function toggleSelectAll() {
    if (selected.size === pageLinks.length && pageLinks.length > 0) {
      setSelected(new Set());
    } else {
      setSelected(new Set(pageLinks.map((_, i) => i)));
    }
  }

  function toggleSelect(i: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  }

  const selectedLinks = pageLinks.filter((_, i) => selected.has(i));

  function exportSelected() {
    const rows: string[][] = [["URL", "Anchor Text", "Follow", "Health", "Priority", "Source Page"]];
    for (const l of selectedLinks) {
      rows.push([l.url, l.anchor_text, l.is_dofollow ? "Dofollow" : "Nofollow", l.health || "unknown", String(l.__priority), l.sourceUrl]);
    }
    downloadCsv(`${kind}-links-selected.csv`, rows);
  }

  function copySelectedUrls() {
    const text = selectedLinks.map((l) => l.url).join("\n");
    navigator.clipboard?.writeText(text);
  }

  function openSelected() {
    selectedLinks.slice(0, 10).forEach((l) => window.open(l.url, "_blank", "noopener,noreferrer"));
  }

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
          <select
            value={categoryFilter}
            onChange={(e) => {
              setCategoryFilter(e.target.value as CategoryFilter);
              setPage(0);
            }}
            className="rounded-lg border border-[var(--seo-border-strong)] px-3 py-1.5 text-sm"
          >
            <option value="all">All link types</option>
            <option value="page">Page</option>
            <option value="pdf">PDF</option>
            <option value="download">Download</option>
            <option value="image">Image</option>
          </select>
          <label className="flex items-center gap-1.5 text-xs text-[var(--seo-text-light)]">
            <input type="checkbox" checked={showDetails} onChange={(e) => setShowDetails(e.target.checked)} />
            Show technical details
          </label>
          <span className="text-xs text-[var(--seo-muted)]">{sorted.length} link(s)</span>
        </div>
      </Card>

      {selected.size > 0 ? (
        <Card className="flex flex-wrap items-center gap-2 py-2">
          <span className="text-xs font-medium text-[var(--seo-text-light)]">{selected.size} selected</span>
          <button onClick={exportSelected} className="rounded border border-[var(--seo-border-strong)] px-2 py-1 text-xs hover:bg-[var(--seo-card-hover)]">
            Export Selected
          </button>
          <button onClick={copySelectedUrls} className="rounded border border-[var(--seo-border-strong)] px-2 py-1 text-xs hover:bg-[var(--seo-card-hover)]">
            Copy URLs
          </button>
          <button onClick={openSelected} className="rounded border border-[var(--seo-border-strong)] px-2 py-1 text-xs hover:bg-[var(--seo-card-hover)]">
            Open (max 10)
          </button>
        </Card>
      ) : null}

      <Card className="overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--seo-border)] bg-[var(--table-header-bg)] text-left text-xs uppercase tracking-wide text-[var(--seo-muted)]">
              <th className="px-3 py-3">
                <input
                  type="checkbox"
                  checked={selected.size > 0 && selected.size === pageLinks.length}
                  onChange={toggleSelectAll}
                />
              </th>
              <th className="cursor-pointer px-4 py-3" onClick={() => toggleSort("url")}>
                URL {sort.key === "url" ? (sort.dir === 1 ? "▲" : "▼") : ""}
              </th>
              {showSource ? <th className="px-4 py-3">Source Page</th> : null}
              <th className="px-4 py-3">Anchor Text</th>
              <th className="px-4 py-3">Follow</th>
              <th className="cursor-pointer px-4 py-3" onClick={() => toggleSort("health")}>
                Health {sort.key === "health" ? (sort.dir === 1 ? "▲" : "▼") : ""}
              </th>
              <th className="cursor-pointer px-4 py-3" onClick={() => toggleSort("priority")}>
                Priority {sort.key === "priority" ? (sort.dir === 1 ? "▲" : "▼") : ""}
              </th>
              {showDetails ? (
                <>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Location</th>
                  <th className="cursor-pointer px-4 py-3" onClick={() => toggleSort("response_time_ms")}>
                    Response {sort.key === "response_time_ms" ? (sort.dir === 1 ? "▲" : "▼") : ""}
                  </th>
                  <th className="px-4 py-3">Certainty</th>
                </>
              ) : null}
              <th className="px-4 py-3">Flags</th>
            </tr>
          </thead>
          <tbody>
            {pageLinks.map((l, i) => {
              const secGap = l.opens_new_tab && (!l.has_noopener || !l.has_noreferrer);
              return (
                <tr key={i} className="border-b border-[var(--table-row-border)]">
                  <td className="px-3 py-3">
                    <input type="checkbox" checked={selected.has(i)} onChange={() => toggleSelect(i)} />
                  </td>
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
                    {l.__priority > 0 ? (
                      <span
                        className="rounded-full px-2 py-0.5 text-xs font-semibold"
                        style={{
                          color: l.__priority >= 70 ? "var(--seo-error)" : "var(--seo-warning)",
                          backgroundColor: l.__priority >= 70 ? "var(--seo-error-bg)" : "var(--seo-warning-bg)",
                        }}
                      >
                        {l.__priority}
                      </span>
                    ) : (
                      <span className="text-[var(--seo-muted)]">—</span>
                    )}
                  </td>
                  {showDetails ? (
                    <>
                      <td className="px-4 py-3 capitalize">{l.link_category || "page"}</td>
                      <td className="px-4 py-3 capitalize">{l.location || "body"}</td>
                      <td className="px-4 py-3">{l.response_time_ms != null ? `${l.response_time_ms} ms` : "—"}</td>
                      <td className="px-4 py-3 text-xs">{linkCertainty(l)}</td>
                    </>
                  ) : null}
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
                      {l.missing_target ? (
                        <span className="rounded-full bg-[var(--seo-card-hover)] px-2 py-0.5 text-xs font-medium text-[var(--seo-muted)]">
                          No target
                        </span>
                      ) : null}
                    </div>
                  </td>
                </tr>
              );
            })}
            {pageLinks.length === 0 ? (
              <tr>
                <td colSpan={showSource ? (showDetails ? 12 : 8) : showDetails ? 11 : 7} className="px-4 py-6 text-center text-[var(--seo-muted)]">
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

function SpecialLinksTable({ links, showSource }: { links: SpecialLinkEntry[]; showSource: boolean }) {
  const [kindFilter, setKindFilter] = useState<"all" | SpecialLinkEntry["kind"]>("all");

  const filtered = useMemo(
    () => links.filter((l) => kindFilter === "all" || l.kind === kindFilter),
    [links, kindFilter],
  );

  const counts = useMemo(() => {
    const c: Record<string, number> = { mailto: 0, tel: 0, anchor: 0, javascript: 0 };
    for (const l of links) c[l.kind] = (c[l.kind] || 0) + 1;
    return c;
  }, [links]);

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <MetricCard label="Mailto Links" value={counts.mailto} onClick={() => setKindFilter("mailto")} />
        <MetricCard label="Tel Links" value={counts.tel} onClick={() => setKindFilter("tel")} />
        <MetricCard label="Anchor Links" value={counts.anchor} onClick={() => setKindFilter("anchor")} />
        <MetricCard label="JS Links" value={counts.javascript} onClick={() => setKindFilter("javascript")} />
      </div>
      <Card>
        <select
          value={kindFilter}
          onChange={(e) => setKindFilter(e.target.value as typeof kindFilter)}
          className="rounded-lg border border-[var(--seo-border-strong)] px-3 py-1.5 text-sm"
        >
          <option value="all">All kinds</option>
          <option value="mailto">Mailto</option>
          <option value="tel">Tel</option>
          <option value="anchor">Anchor (#)</option>
          <option value="javascript">JavaScript</option>
        </select>
      </Card>
      <Card className="overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--seo-border)] bg-[var(--table-header-bg)] text-left text-xs uppercase tracking-wide text-[var(--seo-muted)]">
              <th className="px-4 py-3">Href</th>
              <th className="px-4 py-3">Anchor Text</th>
              <th className="px-4 py-3">Kind</th>
              <th className="px-4 py-3">Location</th>
              {showSource ? <th className="px-4 py-3">Source Page</th> : null}
            </tr>
          </thead>
          <tbody>
            {filtered.slice(0, 300).map((l, i) => (
              <tr key={i} className="border-b border-[var(--table-row-border)]">
                <td className="max-w-xs truncate px-4 py-3 text-[var(--seo-subheading)]">{l.href}</td>
                <td className="max-w-xs truncate px-4 py-3 text-[var(--seo-text-light)]">{l.anchor_text}</td>
                <td className="px-4 py-3 capitalize">{l.kind}</td>
                <td className="px-4 py-3 capitalize">{l.location}</td>
                {showSource ? (
                  <td className="max-w-[10rem] truncate px-4 py-3 text-xs text-[var(--seo-text-light)]">{l.sourceUrl}</td>
                ) : null}
              </tr>
            ))}
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={showSource ? 5 : 4} className="px-4 py-6 text-center text-[var(--seo-muted)]">
                  No special links found.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
