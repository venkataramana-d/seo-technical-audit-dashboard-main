"use client";

import { useState } from "react";
import { useAudit } from "@/lib/state/AuditContext";
import { Card, EmptyState, MetricCard, PageHeader } from "@/components/ui";

const CWV_KEYS = ["ttfb", "fcp", "lcp", "cls", "tbt", "si", "inp"] as const;

function cwvColor(status: string) {
  if (status === "pass") return { text: "var(--cwv-good-text)", bg: "var(--cwv-good-bg)" };
  if (status === "warning") return { text: "var(--cwv-needs-text)", bg: "var(--cwv-needs-bg)" };
  if (status === "fail") return { text: "var(--cwv-poor-text)", bg: "var(--cwv-poor-bg)" };
  return { text: "var(--seo-muted)", bg: "var(--seo-card-hover)" };
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
  const imgSummary = r.image_detail?.summary || r.image_detail || {};

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
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {CWV_KEYS.map((key) => {
                const metric = cwv[key];
                if (!metric) return null;
                const colors = cwvColor(metric.status);
                return (
                  <div
                    key={key}
                    className="rounded-lg p-3 text-center"
                    style={{ backgroundColor: colors.bg }}
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

          <Card>
            <h3 className="mb-2 text-sm font-semibold text-[var(--seo-subheading)]">
              Mobile Checks
            </h3>
            <div className="flex flex-col gap-2">
              {(mobile.checks || []).map((c: any, i: number) => (
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
          </Card>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <MetricCard label="Total Images" value={imgSummary.total ?? 0} />
          <MetricCard label="Missing Alt Text" value={imgSummary.missing_alt ?? 0} />
          <MetricCard label="Large Images" value={imgSummary.large_images ?? 0} />
          <MetricCard label="Missing Lazy Load" value={imgSummary.no_lazy ?? 0} />
        </div>
      )}
    </div>
  );
}
