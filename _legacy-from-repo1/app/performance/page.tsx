"use client";

import { useMemo, useState, Fragment } from "react";
import { useAudit } from "@/lib/state/AuditContext";
import { Card, EmptyState, MetricCard, PageHeader } from "@/components/ui";
import { downloadCsv } from "@/lib/format";
import type { AuditResult } from "@/lib/types";
import {
  ALT_STATUS_LABEL,
  explainImageIssue,
  flattenImages,
  formatBreakdown,
  formatBytes,
  imagePriorityScore,
  STATUS_COLOR_HEX,
  type ImageEntry,
} from "@/lib/imageAnalysis";
import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

const CWV_KEYS = ["ttfb", "fcp", "lcp", "cls", "tbt", "si", "inp"] as const;

const CWV_INFO: Record<string, { label: string; good: string; needsWork: string }> = {
  ttfb: { label: "Time to First Byte", good: "< 200ms", needsWork: "200–500ms" },
  fcp: { label: "First Contentful Paint", good: "< 1.8s", needsWork: "1.8–3s" },
  lcp: { label: "Largest Contentful Paint", good: "< 2.5s", needsWork: "2.5–4s" },
  cls: { label: "Cumulative Layout Shift", good: "< 0.1", needsWork: "0.1–0.25" },
  tbt: { label: "Total Blocking Time", good: "< 200ms", needsWork: "200–600ms" },
  si: { label: "Speed Index", good: "< 3.4s", needsWork: "3.4–5.8s" },
  inp: { label: "Interaction to Next Paint", good: "< 200ms", needsWork: "200–500ms" },
};

interface MobileCheck {
  id: string;
  name: string;
  category: string;
  status: string;
  value: string;
  detail: string;
}

interface PsiOpportunity {
  id: string;
  title: string;
  description: string;
  displayValue: string;
  score: number | null;
}

type AltFilter = "all" | ImageEntry["alt_status"];
type FormatFilter = "all" | string;
type ImageSort = "priority" | "file_size_bytes" | "name";

function cwvColor(status: string) {
  if (status === "pass") return { text: "var(--cwv-good-text)", bg: "var(--cwv-good-bg)" };
  if (status === "warning") return { text: "var(--cwv-needs-text)", bg: "var(--cwv-needs-bg)" };
  if (status === "fail") return { text: "var(--cwv-poor-text)", bg: "var(--cwv-poor-bg)" };
  return { text: "var(--seo-muted)", bg: "var(--seo-card-hover)" };
}

const CATEGORY_ORDER = [
  "Mobile Basics", "Responsiveness", "Usability", "Readability", "Navigation",
  "User Experience", "Conversion", "Performance", "Layout", "Accessibility",
];

function groupChecksByCategory(checks: MobileCheck[]) {
  const groups = new Map<string, MobileCheck[]>();
  for (const c of checks) {
    const list = groups.get(c.category) || [];
    list.push(c);
    groups.set(c.category, list);
  }
  return CATEGORY_ORDER.filter((cat) => groups.has(cat)).map((cat) => ({ category: cat, checks: groups.get(cat)! }));
}

export default function PerformancePage() {
  const { results } = useAudit();
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [subTab, setSubTab] = useState<"Mobile" | "Image SEO">("Mobile");
  const [psiLoading, setPsiLoading] = useState(false);
  const [psiError, setPsiError] = useState<string | null>(null);
  const [livePsi, setLivePsi] = useState<Record<string, any> | null>(null);

  if (results.length === 0) {
    return (
      <div>
        <PageHeader title="⚡ Performance Audit" />
        <EmptyState title="No audits yet" hint="Run an audit to see performance data." />
      </div>
    );
  }

  const r = results[Math.min(selectedIdx, results.length - 1)];
  const mobile = r.mobile_audit || {};
  // /api/pagespeed (modules/pagespeed.py fetch_pagespeed) returns metrics as
  // flat top-level fields, not nested under a "cwv" key like mobile_audit.cwv does.
  const cwv = livePsi
    ? {
        ttfb: livePsi.ttfb,
        fcp: livePsi.fcp,
        lcp: livePsi.lcp,
        cls: livePsi.cls,
        tbt: livePsi.tbt,
        si: livePsi.si,
        inp: livePsi.inp,
        source: livePsi.source,
      }
    : mobile.cwv || {};
  const opportunities: PsiOpportunity[] = livePsi?.opportunities || [];

  const groupedChecks = groupChecksByCategory(mobile.checks || []);

  async function fetchLivePsi() {
    setPsiLoading(true);
    setPsiError(null);
    try {
      const res = await fetch("/api/pagespeed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: r.url, strategy: "mobile" }),
      });
      const data = await res.json();
      if (!res.ok || data.success === false) {
        setPsiError(data.error || "PageSpeed fetch failed.");
        return;
      }
      setLivePsi(data);
    } catch (err) {
      setPsiError(err instanceof Error ? err.message : "PageSpeed fetch failed.");
    } finally {
      setPsiLoading(false);
    }
  }

  return (
    <div>
      <PageHeader title="⚡ Performance Audit" subtitle={r.url} />

      {results.length > 1 ? (
        <select
          value={selectedIdx}
          onChange={(e) => {
            setSelectedIdx(Number(e.target.value));
            setLivePsi(null);
          }}
          className="mb-4 rounded-lg border border-[var(--seo-border-strong)] bg-white px-3 py-2 text-sm"
        >
          {results.map((res, i) => (
            <option key={res.url} value={i}>
              {res.url}
            </option>
          ))}
        </select>
      ) : null}

      <div className="mb-4 flex gap-1 border-b border-[var(--seo-border)]">
        {(["Mobile", "Image SEO"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setSubTab(t)}
            className={`rounded-t-lg px-3 py-2 text-sm font-medium ${
              subTab === t
                ? "border-b-2 border-[var(--seo-accent)] text-[var(--seo-accent)]"
                : "text-[var(--seo-text-light)] hover:text-[var(--seo-subheading)]"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {subTab === "Mobile" ? (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <MetricCard label="Mobile Score" value={mobile.mobile_score ?? "—"} />
            <MetricCard label="Mobile Friendly" value={mobile.is_mobile_friendly ? "Yes" : "No"} />
            <MetricCard
              label="Checks Passed"
              value={`${mobile.passed_checks ?? 0}/${mobile.total_checks ?? 0}`}
            />
            <MetricCard label="CWV Source" value={cwv.source || "—"} />
          </div>

          <Card>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-[var(--seo-subheading)]">
                Core Web Vitals
              </h3>
              <button
                type="button"
                onClick={fetchLivePsi}
                disabled={psiLoading}
                className="rounded-lg bg-[var(--seo-accent)] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
              >
                {psiLoading ? "Fetching…" : "Fetch Live PSI"}
              </button>
            </div>
            {psiError ? (
              <div className="mb-3 rounded-lg border border-[var(--seo-error-border)] bg-[var(--seo-error-bg)] px-3 py-2 text-xs text-[var(--seo-error)]">
                {psiError}
              </div>
            ) : null}
            {livePsi ? (
              <div className="mb-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <MetricCard label="Performance" value={livePsi.performance_score ?? "—"} />
                <MetricCard label="Accessibility" value={livePsi.accessibility_score ?? "—"} />
                <MetricCard label="SEO" value={livePsi.seo_score ?? "—"} />
                <MetricCard label="Best Practices" value={livePsi.best_practices_score ?? "—"} />
              </div>
            ) : null}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {CWV_KEYS.map((key) => {
                const metric = cwv[key];
                if (!metric) return null;
                const colors = cwvColor(metric.status);
                const info = CWV_INFO[key];
                return (
                  <div
                    key={key}
                    className="rounded-lg p-3 text-center"
                    style={{ backgroundColor: colors.bg }}
                    title={info ? `${info.label} — good: ${info.good}, needs improvement: ${info.needsWork}` : undefined}
                  >
                    <div className="text-xs uppercase text-[var(--seo-muted)]">{key}</div>
                    <div className="mt-1 text-lg font-bold" style={{ color: colors.text }}>
                      {metric.value}
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>

          {opportunities.length > 0 ? (
            <Card>
              <h3 className="mb-2 text-sm font-semibold text-[var(--seo-subheading)]">
                PageSpeed Opportunities
              </h3>
              <p className="mb-2 text-xs text-[var(--seo-text-light)]">
                Real Lighthouse findings from the live PSI fetch, ranked by potential impact.
              </p>
              <div className="flex flex-col gap-2">
                {opportunities.map((op, i) => (
                  <div key={i} className="border-b border-[var(--seo-border)] py-2 last:border-0">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium text-[var(--seo-subheading)]">{op.title}</span>
                      {op.displayValue ? (
                        <span className="text-xs font-semibold text-[var(--seo-warning)]">{op.displayValue}</span>
                      ) : null}
                    </div>
                    {op.description ? (
                      <p className="mt-0.5 text-xs text-[var(--seo-text-light)]">{op.description}</p>
                    ) : null}
                  </div>
                ))}
              </div>
            </Card>
          ) : null}

          <Card>
            <h3 className="mb-2 text-sm font-semibold text-[var(--seo-subheading)]">
              Mobile Checks
            </h3>
            <div className="flex flex-col gap-3">
              {groupedChecks.map(({ category, checks }) => (
                <div key={category}>
                  <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-[var(--seo-muted)]">
                    {category}
                  </h4>
                  {checks.map((c, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between border-b border-[var(--seo-border)] py-1.5 text-sm last:border-0"
                    >
                      <span className="text-[var(--seo-text)]">{c.name}</span>
                      <span
                        className="text-xs font-medium capitalize"
                        style={{
                          color:
                            c.status === "pass"
                              ? "var(--seo-success)"
                              : c.status === "fail"
                              ? "var(--seo-error)"
                              : "var(--seo-muted)",
                        }}
                      >
                        {c.status} {c.value ? `— ${c.value}` : ""}
                      </span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </Card>
        </div>
      ) : (
        <ImageSeoTab results={results} showSource={results.length > 1} />
      )}
    </div>
  );
}

function ImageSeoTab({ results, showSource }: { results: AuditResult[]; showSource: boolean }) {
  const images = useMemo(() => flattenImages(results), [results]);
  const formats = useMemo(() => formatBreakdown(images), [images]);
  const [altFilter, setAltFilter] = useState<AltFilter>("all");
  const [formatFilter, setFormatFilter] = useState<FormatFilter>("all");
  const [lcpOnly, setLcpOnly] = useState(false);
  const [issueOnly, setIssueOnly] = useState(false);
  const [brokenOnly, setBrokenOnly] = useState(false);
  const [sort, setSort] = useState<{ key: ImageSort; dir: 1 | -1 }>({ key: "priority", dir: -1 });
  const [expanded, setExpanded] = useState<number | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const missingAlt = images.filter((i) => i.alt_status === "missing").length;
  const largeImages = images.filter((i) => i.issues.includes("Large file size (> 200KB)")).length;
  // Derived from the per-image issues list (not a raw !has_lazy check) so this
  // matches modules/image_auditor.py's own exclusion of the LCP image from
  // the lazy-loading complaint — that image correctly should NOT be lazy.
  const noLazy = images.filter((i) => i.issues.includes("Missing lazy loading")).length;
  const brokenImages = images.filter((i) => i.is_broken === true).length;
  const formatOpportunities = images.filter((i) => i.issues.includes("Could be converted to WebP/AVIF"));
  const duplicateAlt = (() => {
    const seen = new Map<string, number>();
    for (const img of images) {
      const alt = (img.alt_text || "").trim().toLowerCase();
      if (alt) seen.set(alt, (seen.get(alt) || 0) + 1);
    }
    return [...seen.values()].filter((c) => c > 1).length;
  })();

  const withPriority = useMemo(
    () => images.map((img) => ({ ...img, __priority: imagePriorityScore(img) })),
    [images],
  );

  const filtered = useMemo(() => {
    return withPriority.filter((img) => {
      if (altFilter !== "all" && img.alt_status !== altFilter) return false;
      if (formatFilter !== "all" && img.format_label !== formatFilter) return false;
      if (lcpOnly && !img.is_lcp_candidate) return false;
      if (issueOnly && img.issues.length === 0) return false;
      if (brokenOnly && img.is_broken !== true) return false;
      return true;
    });
  }, [withPriority, altFilter, formatFilter, lcpOnly, issueOnly, brokenOnly]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => {
      let av: number | string = 0;
      let bv: number | string = 0;
      if (sort.key === "priority") {
        av = a.__priority;
        bv = b.__priority;
      } else if (sort.key === "file_size_bytes") {
        av = a.file_size_bytes ?? -1;
        bv = b.file_size_bytes ?? -1;
      } else {
        av = a.name;
        bv = b.name;
      }
      if (av < bv) return -sort.dir;
      if (av > bv) return sort.dir;
      return 0;
    });
    return arr;
  }, [filtered, sort]);

  function toggleSort(key: ImageSort) {
    setSort((s) => (s.key === key ? { key, dir: s.dir === 1 ? -1 : 1 } : { key, dir: -1 }));
  }

  function toggleSelect(i: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  }

  function toggleSelectAll() {
    if (selected.size === sorted.length && sorted.length > 0) setSelected(new Set());
    else setSelected(new Set(sorted.map((_, i) => i)));
  }

  function downloadView() {
    const rows: string[][] = [
      ["Name", "Source Page", "Format", "Alt Status", "Alt Text", "Dimensions", "Lazy", "File Size", "Broken", "LCP Candidate", "Issues"],
    ];
    const subset = selected.size > 0 ? sorted.filter((_, i) => selected.has(i)) : sorted;
    for (const img of subset) {
      rows.push([
        img.name,
        img.sourceUrl,
        img.format_label,
        img.alt_status,
        img.alt_text || "",
        img.has_dimensions ? `${img.width}×${img.height}` : "—",
        img.has_lazy ? "Yes" : "No",
        formatBytes(img.file_size_bytes),
        img.is_broken ? `Yes (${img.status_code ?? img.fetch_error ?? "unreachable"})` : "No",
        img.is_lcp_candidate ? "Yes" : "No",
        img.issues.join("; "),
      ]);
    }
    downloadCsv("image-seo-audit.csv", rows);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <MetricCard label="Total Images" value={images.length} />
        <MetricCard label="Missing Alt Text" value={missingAlt} onClick={() => setAltFilter("missing")} />
        <MetricCard label="Large Images (>200KB)" value={largeImages} onClick={() => setIssueOnly(true)} />
        <MetricCard label="Missing Lazy Load" value={noLazy} />
        <MetricCard label="Duplicate Alt Text" value={duplicateAlt} />
        <MetricCard label="Format Upgrade Candidates" value={formatOpportunities.length} />
        <MetricCard label="Broken Images" value={brokenImages} onClick={() => setBrokenOnly(true)} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <h3 className="mb-3 text-sm font-semibold text-[var(--seo-subheading)]">Format Breakdown</h3>
          {formats.length ? (
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={formats} dataKey="count" nameKey="format" outerRadius={75} fill="#8884d8" isAnimationActive={false} label>
                  {formats.map((_, i) => (
                    <Cell key={i} fill={["#0369A1", "#0284C7", "#059669", "#D97706", "#7C3AED", "#DC2626"][i % 6]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-sm text-[var(--seo-muted)]">No images found.</p>
          )}
        </Card>
        <Card>
          <h3 className="mb-2 text-sm font-semibold text-[var(--seo-subheading)]">
            Legacy Format Opportunities ({formatOpportunities.length})
          </h3>
          <p className="mb-2 text-xs text-[var(--seo-text-light)]">
            JPEG/PNG images that would likely be smaller as WebP or AVIF with no visible quality loss.
          </p>
          <ul className="text-sm text-[var(--seo-text)]">
            {formatOpportunities.slice(0, 8).map((img, i) => (
              <li key={i} className="truncate border-b border-[var(--seo-border)] py-1 last:border-0">
                {img.name} <span className="text-xs text-[var(--seo-muted)]">— {formatBytes(img.file_size_bytes)}</span>
              </li>
            ))}
            {formatOpportunities.length === 0 ? <li className="text-[var(--seo-muted)]">None found.</li> : null}
          </ul>
        </Card>
      </div>

      <Card>
        <div className="flex flex-wrap items-center gap-3">
          <select
            value={altFilter}
            onChange={(e) => setAltFilter(e.target.value as AltFilter)}
            className="rounded-lg border border-[var(--seo-border-strong)] px-3 py-1.5 text-sm"
          >
            <option value="all">All alt statuses</option>
            {Object.entries(ALT_STATUS_LABEL).map(([k, label]) => (
              <option key={k} value={k}>{label}</option>
            ))}
          </select>
          <select
            value={formatFilter}
            onChange={(e) => setFormatFilter(e.target.value)}
            className="rounded-lg border border-[var(--seo-border-strong)] px-3 py-1.5 text-sm"
          >
            <option value="all">All formats</option>
            {formats.map((f) => (
              <option key={f.format} value={f.format}>{f.format}</option>
            ))}
          </select>
          <label className="flex items-center gap-1.5 text-xs text-[var(--seo-text-light)]">
            <input type="checkbox" checked={lcpOnly} onChange={(e) => setLcpOnly(e.target.checked)} />
            LCP candidate only
          </label>
          <label className="flex items-center gap-1.5 text-xs text-[var(--seo-text-light)]">
            <input type="checkbox" checked={issueOnly} onChange={(e) => setIssueOnly(e.target.checked)} />
            Has issues only
          </label>
          <label className="flex items-center gap-1.5 text-xs text-[var(--seo-text-light)]">
            <input type="checkbox" checked={brokenOnly} onChange={(e) => setBrokenOnly(e.target.checked)} />
            Broken only
          </label>
          <span className="text-xs text-[var(--seo-muted)]">{sorted.length} image(s)</span>
          <button
            onClick={downloadView}
            className="ml-auto rounded-lg bg-[var(--seo-accent)] px-3 py-1.5 text-xs font-semibold text-white"
          >
            Download {selected.size > 0 ? `Selected (${selected.size})` : `This View (${sorted.length})`}
          </button>
        </div>
      </Card>

      <Card className="overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--seo-border)] bg-[var(--table-header-bg)] text-left text-xs uppercase tracking-wide text-[var(--seo-muted)]">
              <th className="px-3 py-3">
                <input type="checkbox" checked={selected.size > 0 && selected.size === sorted.length} onChange={toggleSelectAll} />
              </th>
              <th className="px-4 py-3">Preview</th>
              <th className="cursor-pointer px-4 py-3" onClick={() => toggleSort("name")}>
                Name {sort.key === "name" ? (sort.dir === 1 ? "▲" : "▼") : ""}
              </th>
              {showSource ? <th className="px-4 py-3">Source Page</th> : null}
              <th className="px-4 py-3">Alt Status</th>
              <th className="px-4 py-3">Format</th>
              <th className="px-4 py-3">Dimensions</th>
              <th className="cursor-pointer px-4 py-3" onClick={() => toggleSort("file_size_bytes")}>
                Size {sort.key === "file_size_bytes" ? (sort.dir === 1 ? "▲" : "▼") : ""}
              </th>
              <th className="cursor-pointer px-4 py-3" onClick={() => toggleSort("priority")}>
                Priority {sort.key === "priority" ? (sort.dir === 1 ? "▲" : "▼") : ""}
              </th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {sorted.slice(0, 200).map((img, i) => {
              const isExpanded = expanded === i;
              const explanations = img.issues.map((iss) => explainImageIssue(iss, img)).filter(Boolean);
              return (
                <Fragment key={i}>
                  <tr className="border-b border-[var(--table-row-border)]">
                    <td className="px-3 py-3">
                      <input type="checkbox" checked={selected.has(i)} onChange={() => toggleSelect(i)} />
                    </td>
                    <td className="px-4 py-3">
                      {img.url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={img.url} alt="" className="h-10 w-10 rounded object-cover" loading="lazy" onError={(e) => { (e.target as HTMLImageElement).style.visibility = "hidden"; }} />
                      ) : null}
                    </td>
                    <td className="max-w-[10rem] truncate px-4 py-3 text-[var(--seo-subheading)]" title={img.url}>
                      {img.name || "(unnamed)"}
                      {img.is_lcp_candidate ? (
                        <span className="ml-1 rounded-full bg-[var(--seo-accent-light)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--seo-accent)]">LCP</span>
                      ) : null}
                      {img.is_broken ? (
                        <span
                          className="ml-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold"
                          style={{ color: "var(--seo-error)", backgroundColor: "var(--seo-error-bg)" }}
                          title={img.fetch_error || (img.status_code ? `HTTP ${img.status_code}` : "Unreachable")}
                        >
                          Broken
                        </span>
                      ) : null}
                    </td>
                    {showSource ? (
                      <td className="max-w-[10rem] truncate px-4 py-3 text-xs text-[var(--seo-text-light)]">{img.sourceUrl}</td>
                    ) : null}
                    <td className="px-4 py-3">
                      <span
                        className="rounded-full px-2 py-0.5 text-xs font-medium"
                        style={{
                          color: img.alt_status === "ok" ? "var(--seo-success)" : img.alt_status === "missing" ? "var(--seo-error)" : "var(--seo-warning)",
                          backgroundColor: img.alt_status === "ok" ? "var(--seo-success-bg)" : img.alt_status === "missing" ? "var(--seo-error-bg)" : "var(--seo-warning-bg)",
                        }}
                      >
                        {ALT_STATUS_LABEL[img.alt_status]}
                      </span>
                    </td>
                    <td className="px-4 py-3">{img.format_label}</td>
                    <td className="px-4 py-3">{img.has_dimensions ? `${img.width}×${img.height}` : "—"}</td>
                    <td className="px-4 py-3">{formatBytes(img.file_size_bytes)}</td>
                    <td className="px-4 py-3">
                      {img.__priority > 0 ? (
                        <span
                          className="rounded-full px-2 py-0.5 text-xs font-semibold"
                          style={{
                            color: img.__priority >= 60 ? "var(--seo-error)" : "var(--seo-warning)",
                            backgroundColor: img.__priority >= 60 ? "var(--seo-error-bg)" : "var(--seo-warning-bg)",
                          }}
                        >
                          {img.__priority}
                        </span>
                      ) : (
                        <span className="text-[var(--seo-muted)]">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {explanations.length > 0 ? (
                        <button
                          onClick={() => setExpanded(isExpanded ? null : i)}
                          className="text-xs font-medium text-[var(--seo-accent)] hover:underline"
                        >
                          {isExpanded ? "Hide" : `Details (${explanations.length})`}
                        </button>
                      ) : (
                        <span className="text-xs text-[var(--seo-muted)]">No issues</span>
                      )}
                    </td>
                  </tr>
                  {isExpanded ? (
                    <tr className="border-b border-[var(--table-row-border)] bg-[var(--seo-card-alt)]">
                      <td colSpan={10} className="px-4 py-4">
                        <div className="flex flex-col gap-4">
                          {explanations.map((exp, idx) => exp && <ImageIssueDetail key={idx} explanation={exp} />)}
                        </div>
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              );
            })}
            {sorted.length === 0 ? (
              <tr>
                <td colSpan={10} className="px-4 py-6 text-center text-[var(--seo-muted)]">
                  No images match this filter.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

function ImageIssueDetail({ explanation }: { explanation: ReturnType<typeof explainImageIssue> }) {
  if (!explanation) return null;
  const color = STATUS_COLOR_HEX[explanation.status];
  return (
    <div className="flex flex-col gap-2 text-sm">
      <div className="flex items-center gap-2">
        <span className="rounded-full px-2 py-0.5 text-xs font-semibold" style={{ color, backgroundColor: `${color}18` }}>
          {explanation.issueName}
        </span>
        <span className="text-xs text-[var(--seo-muted)]">Severity: {explanation.severity}</span>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <h5 className="text-xs font-semibold uppercase tracking-wide text-[var(--seo-muted)]">What is it?</h5>
          <p className="text-[var(--seo-text)]">{explanation.whatIsIt}</p>
        </div>
        <div>
          <h5 className="text-xs font-semibold uppercase tracking-wide text-[var(--seo-muted)]">Why is it important?</h5>
          <p className="text-[var(--seo-text)]">{explanation.whyImportant}</p>
        </div>
        <div>
          <h5 className="text-xs font-semibold uppercase tracking-wide text-[var(--seo-muted)]">SEO Impact</h5>
          <p className="text-[var(--seo-text)]">{explanation.seoImpact}</p>
        </div>
        <div>
          <h5 className="text-xs font-semibold uppercase tracking-wide text-[var(--seo-muted)]">User Impact</h5>
          <p className="text-[var(--seo-text)]">{explanation.userImpact}</p>
        </div>
      </div>
      <div>
        <h5 className="text-xs font-semibold uppercase tracking-wide text-[var(--seo-muted)]">Recommended Fix</h5>
        <p className="text-[var(--seo-text)]">{explanation.recommendedFix}</p>
        {explanation.htmlExample ? (
          <pre className="mt-1 overflow-x-auto rounded-lg bg-[var(--seo-card-hover)] p-2 text-xs text-[var(--seo-subheading)]">
            {explanation.htmlExample}
          </pre>
        ) : null}
      </div>
    </div>
  );
}
