"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Card, PageHeader, ScoreCircle } from "@/components/ui";
import { GlobeIcon } from "@/components/icons";
import { formatDate } from "@/lib/format";

interface CrawlStatus {
  id: number;
  rootUrl: string | null;
  status: string;
  healthScore: number | null;
  seoScoreAvg: number | null;
  pagesCrawled: number;
  pagesTotalEstimate: number | null;
  startedAt: string | null;
  finishedAt: string | null;
}

interface ThemeIssue {
  issue: string;
  severity: string;
  recommendation: string;
}

interface ThemeReport {
  count: number;
  by_severity: Record<string, number>;
  issues: ThemeIssue[];
}

const POLL_INTERVAL_MS = 3000;
const FINISHED_STATUSES = new Set(["completed", "failed"]);

const SEVERITY_STYLE: Record<string, { color: string; bg: string }> = {
  error: { color: "var(--seo-error)", bg: "var(--seo-error-bg)" },
  warning: { color: "var(--seo-warning)", bg: "var(--seo-warning-bg)" },
  notice: { color: "var(--seo-accent)", bg: "var(--seo-accent-light)" },
};

function SeverityChip({ severity, count }: { severity: string; count: number }) {
  const s = SEVERITY_STYLE[severity] ?? SEVERITY_STYLE.notice;
  return (
    <span className="pill" style={{ color: s.color, backgroundColor: s.bg }}>
      {count} {severity}
    </span>
  );
}

async function postCrawlsAction<T>(body: Record<string, unknown>): Promise<T> {
  const res = await fetch("/api/crawls", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Request failed.");
  return data as T;
}

export default function CrawlDetailPage() {
  const params = useParams();
  const router = useRouter();
  const crawlId = Number(params.id);

  const [status, setStatus] = useState<CrawlStatus | null>(null);
  const [themes, setThemes] = useState<Record<string, ThemeReport> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pollCount, setPollCount] = useState(0);
  const themesLoadedFor = useRef<number | null>(null);

  useEffect(() => {
    if (!Number.isFinite(crawlId)) return;
    let cancelled = false;

    async function poll() {
      try {
        const data = await postCrawlsAction<CrawlStatus>({ action: "status", crawlId });
        if (cancelled) return;
        setStatus(data);
        setError(null);
        setPollCount((c) => c + 1);

        if (data.status === "completed" && themesLoadedFor.current !== crawlId) {
          themesLoadedFor.current = crawlId;
          const themeData = await postCrawlsAction<{ themes: Record<string, ThemeReport> }>({
            action: "thematic",
            crawlId,
          });
          if (!cancelled) setThemes(themeData.themes);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load crawl status.");
      }
    }

    poll();
    const interval = setInterval(() => {
      if (status && FINISHED_STATUSES.has(status.status)) return;
      poll();
    }, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [crawlId]);

  if (!Number.isFinite(crawlId)) {
    return <p className="text-sm text-[var(--seo-error)]">Invalid crawl id.</p>;
  }

  return (
    <div>
      <PageHeader
        icon={<GlobeIcon size={18} />}
        title={status?.rootUrl ?? `Crawl #${crawlId}`}
        subtitle={status ? `Status: ${status.status}` : "Loading…"}
        actions={
          <button
            type="button"
            onClick={() => router.push("/site-crawls")}
            className="rounded-lg border border-[var(--seo-border)] px-3 py-1.5 text-sm font-medium text-[var(--seo-text)] hover:bg-[var(--seo-card-hover)]"
          >
            ← All crawls
          </button>
        }
      />

      {error ? <p className="mb-4 text-sm text-[var(--seo-error)]">{error}</p> : null}

      {!status ? null : status.status === "failed" ? (
        <Card>
          <div className="text-sm font-semibold text-[var(--seo-error)]">This crawl failed.</div>
          <p className="mt-1 text-xs text-[var(--seo-muted)]">
            Check the worker process logs (`python -m worker`) for the error.
          </p>
        </Card>
      ) : status.status !== "completed" ? (
        <Card>
          <div className="flex items-center gap-3">
            <span className="h-2.5 w-2.5 shrink-0 animate-pulse rounded-full bg-[var(--seo-accent)]" />
            <div>
              <div className="text-sm font-semibold text-[var(--seo-heading)]">
                {status.status === "queued" ? "Queued" : "Crawling…"} — {status.pagesCrawled} page
                {status.pagesCrawled === 1 ? "" : "s"} crawled
                {status.pagesTotalEstimate ? ` of up to ${status.pagesTotalEstimate}` : ""}
              </div>
              {status.status === "queued" && pollCount >= 3 ? (
                <p className="mt-1 text-xs text-[var(--seo-muted)]">
                  Still queued after a few checks — make sure the worker process (
                  <code className="font-mono">python -m worker</code>) is running.
                </p>
              ) : null}
            </div>
          </div>
        </Card>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Card className="flex items-center gap-4">
              <ScoreCircle score={status.healthScore ?? 0} size={64} label="Health Score" />
              <div className="text-xs text-[var(--seo-muted)]">
                % of crawled pages with zero error-severity issues
              </div>
            </Card>
            <Card className="flex items-center gap-4">
              <ScoreCircle score={status.seoScoreAvg ?? 0} size={64} label="SEO Score (avg)" />
              <div className="text-xs text-[var(--seo-muted)]">
                Weighted per-page score, averaged across the crawl
              </div>
            </Card>
          </div>

          <Card>
            <h2 className="mb-3 text-sm font-semibold text-[var(--seo-heading)]">Thematic report</h2>
            {themes === null ? (
              <p className="text-xs text-[var(--seo-muted)]">Loading…</p>
            ) : Object.keys(themes).length === 0 ? (
              <p className="text-xs text-[var(--seo-muted)]">No issues found.</p>
            ) : (
              <div className="flex flex-col gap-2.5">
                {Object.entries(themes).map(([theme, report]) => (
                  <div
                    key={theme}
                    className="flex flex-wrap items-center gap-2 border-b border-[var(--seo-border)] pb-2.5 last:border-0 last:pb-0"
                  >
                    <span className="min-w-[140px] text-sm font-medium text-[var(--seo-subheading)]">
                      {theme}
                    </span>
                    <span className="text-xs text-[var(--seo-muted)]">{report.count} issue{report.count === 1 ? "" : "s"}</span>
                    <div className="ml-auto flex gap-1.5">
                      {Object.entries(report.by_severity).map(([severity, count]) => (
                        <SeverityChip key={severity} severity={severity} count={count} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <p className="text-xs text-[var(--seo-muted)]">
            Finished {formatDate(status.finishedAt)} · {status.pagesCrawled} pages crawled
          </p>
        </div>
      )}
    </div>
  );
}
