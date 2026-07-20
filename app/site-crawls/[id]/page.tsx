"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Card, PageHeader, ScoreCircle, TabBar } from "@/components/ui";
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

interface PageRow {
  id: number;
  url: string;
  statusCode: number | null;
  title: string | null;
  seoScore: number | null;
  fetchedAt: string | null;
  issueCounts: Record<string, number>;
}

interface PagesResponse {
  pages: PageRow[];
  total: number;
  page: number;
  pageSize: number;
}

interface IssueRow {
  id: number;
  issueType: string;
  severity: string;
  category: string;
  recommendation: string;
  impactScore: number | null;
  effortLevel: string | null;
  pageUrl: string | null;
  createdAt: string | null;
}

interface IssuesResponse {
  issues: IssueRow[];
  total: number;
  page: number;
  pageSize: number;
  categories: string[];
}

const POLL_INTERVAL_MS = 3000;
const FINISHED_STATUSES = new Set(["completed", "failed"]);
const TABS = ["Overview", "Pages", "Issues"] as const;
type Tab = (typeof TABS)[number];

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

function SeverityBadge({ severity }: { severity: string }) {
  const s = SEVERITY_STYLE[severity] ?? SEVERITY_STYLE.notice;
  return (
    <span className="pill capitalize" style={{ color: s.color, backgroundColor: s.bg }}>
      {severity}
    </span>
  );
}

function PaginationControls({
  page,
  totalPages,
  onChange,
}: {
  page: number;
  totalPages: number;
  onChange: (page: number) => void;
}) {
  if (totalPages <= 1) return null;
  return (
    <div className="mt-3 flex items-center justify-end gap-2 text-xs">
      <button
        type="button"
        disabled={page <= 1}
        onClick={() => onChange(page - 1)}
        className="rounded-lg border border-[var(--seo-border)] px-2.5 py-1 text-[var(--seo-text)] hover:bg-[var(--seo-card-hover)] disabled:opacity-40"
      >
        Prev
      </button>
      <span className="text-[var(--seo-muted)]">
        Page {page} of {totalPages}
      </span>
      <button
        type="button"
        disabled={page >= totalPages}
        onClick={() => onChange(page + 1)}
        className="rounded-lg border border-[var(--seo-border)] px-2.5 py-1 text-[var(--seo-text)] hover:bg-[var(--seo-card-hover)] disabled:opacity-40"
      >
        Next
      </button>
    </div>
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

/** Shared fetch-on-filter-change plumbing for the Pages/Issues tabs — same
 * action-dispatch call, just a different action name and filter shape. */
function useCrawlListing<T>(action: "pages" | "issues", crawlId: number, filters: Record<string, unknown>) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const filtersKey = JSON.stringify(filters);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    postCrawlsAction<T>({ action, crawlId, ...filters })
      .then((result) => {
        if (!cancelled) {
          setData(result);
          setError(null);
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [action, crawlId, filtersKey]);

  return { data, error, loading };
}

function OverviewTab({
  status,
  themes,
}: {
  status: CrawlStatus;
  themes: Record<string, ThemeReport> | null;
}) {
  return (
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
                <span className="text-xs text-[var(--seo-muted)]">
                  {report.count} issue{report.count === 1 ? "" : "s"}
                </span>
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
  );
}

function PagesTab({ crawlId }: { crawlId: number }) {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 25;

  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const { data, error, loading } = useCrawlListing<PagesResponse>("pages", crawlId, {
    search: debouncedSearch,
    page,
    pageSize,
  });
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <Card>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search URLs…"
          className="min-w-0 flex-1 rounded-lg border border-[var(--seo-border-strong)] bg-[var(--seo-card-bg)] px-2.5 py-1.5 text-sm text-[var(--seo-text)] outline-none focus:border-[var(--seo-accent)]"
        />
        {data ? (
          <span className="text-xs text-[var(--seo-muted)]">
            {data.total} page{data.total === 1 ? "" : "s"}
          </span>
        ) : null}
      </div>
      {error ? <p className="text-xs text-[var(--seo-error)]">{error}</p> : null}
      {loading && !data ? <p className="text-xs text-[var(--seo-muted)]">Loading…</p> : null}
      {data && data.pages.length === 0 ? (
        <p className="text-xs text-[var(--seo-muted)]">No pages found.</p>
      ) : null}
      {data && data.pages.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-[var(--seo-border)] text-xs text-[var(--seo-muted)]">
                <th className="pb-2 pr-3 font-medium">URL</th>
                <th className="pb-2 pr-3 font-medium">Status</th>
                <th className="pb-2 pr-3 font-medium">Title</th>
                <th className="pb-2 pr-3 font-medium">Score</th>
                <th className="pb-2 pr-3 font-medium">Issues</th>
                <th className="pb-2 font-medium">Crawled</th>
              </tr>
            </thead>
            <tbody>
              {data.pages.map((p) => (
                <tr key={p.id} className="border-b border-[var(--seo-border)] last:border-0">
                  <td
                    className="max-w-xs truncate py-2 pr-3 font-mono text-xs text-[var(--seo-heading)]"
                    title={p.url}
                  >
                    {p.url}
                  </td>
                  <td className="py-2 pr-3 text-xs text-[var(--seo-text)]">{p.statusCode ?? "—"}</td>
                  <td className="max-w-[200px] truncate py-2 pr-3 text-xs text-[var(--seo-text)]" title={p.title || ""}>
                    {p.title || "—"}
                  </td>
                  <td className="py-2 pr-3 text-xs tabular-nums text-[var(--seo-text)]">
                    {p.seoScore != null ? Math.round(p.seoScore) : "—"}
                  </td>
                  <td className="py-2 pr-3">
                    <div className="flex flex-wrap gap-1">
                      {Object.entries(p.issueCounts).map(([sev, count]) => (
                        <SeverityChip key={sev} severity={sev} count={count} />
                      ))}
                    </div>
                  </td>
                  <td className="py-2 text-xs text-[var(--seo-muted)]">{formatDate(p.fetchedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      {data ? <PaginationControls page={data.page} totalPages={totalPages} onChange={setPage} /> : null}
    </Card>
  );
}

function IssuesTab({ crawlId }: { crawlId: number }) {
  const [severity, setSeverity] = useState("");
  const [category, setCategory] = useState("");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 25;

  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [severity, category]);

  const { data, error, loading } = useCrawlListing<IssuesResponse>("issues", crawlId, {
    severity: severity || undefined,
    category: category || undefined,
    search: debouncedSearch,
    page,
    pageSize,
  });
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <Card>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="flex gap-1">
          {["", "error", "warning", "notice"].map((s) => {
            const isActive = severity === s;
            const style = s ? SEVERITY_STYLE[s] : { color: "var(--seo-text)", bg: "var(--seo-card-hover)" };
            return (
              <button
                key={s || "all"}
                type="button"
                onClick={() => setSeverity(s)}
                className="pill capitalize"
                style={{
                  color: isActive ? "#fff" : style.color,
                  backgroundColor: isActive ? "var(--seo-accent)" : style.bg,
                }}
              >
                {s || "All"}
              </button>
            );
          })}
        </div>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="rounded-lg border border-[var(--seo-border-strong)] bg-[var(--seo-card-bg)] px-2.5 py-1.5 text-sm text-[var(--seo-text)] outline-none focus:border-[var(--seo-accent)]"
        >
          <option value="">All categories</option>
          {(data?.categories || []).map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search issue type…"
          className="min-w-0 flex-1 rounded-lg border border-[var(--seo-border-strong)] bg-[var(--seo-card-bg)] px-2.5 py-1.5 text-sm text-[var(--seo-text)] outline-none focus:border-[var(--seo-accent)]"
        />
        {data ? (
          <span className="text-xs text-[var(--seo-muted)]">
            {data.total} issue{data.total === 1 ? "" : "s"}
          </span>
        ) : null}
      </div>
      {error ? <p className="text-xs text-[var(--seo-error)]">{error}</p> : null}
      {loading && !data ? <p className="text-xs text-[var(--seo-muted)]">Loading…</p> : null}
      {data && data.issues.length === 0 ? (
        <p className="text-xs text-[var(--seo-muted)]">No issues found.</p>
      ) : null}
      <div className="flex flex-col gap-2">
        {(data?.issues || []).map((issue) => (
          <div key={issue.id} className="rounded-lg border border-[var(--seo-border)] p-2.5">
            <div className="flex flex-wrap items-center gap-2">
              <SeverityBadge severity={issue.severity} />
              <span className="text-sm font-medium text-[var(--seo-heading)]">{issue.issueType}</span>
              <span className="text-xs text-[var(--seo-muted)]">{issue.category}</span>
              <span className="ml-auto font-mono text-xs text-[var(--seo-muted)]" title={issue.pageUrl || undefined}>
                {issue.pageUrl ? issue.pageUrl.replace(/^https?:\/\//, "") : "Sitewide"}
              </span>
            </div>
            <p className="mt-1 text-xs text-[var(--seo-text-light)]">{issue.recommendation}</p>
          </div>
        ))}
      </div>
      {data ? <PaginationControls page={data.page} totalPages={totalPages} onChange={setPage} /> : null}
    </Card>
  );
}

export default function CrawlDetailPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const crawlId = Number(params.id);

  const rawTab = searchParams.get("tab");
  const activeTab: Tab = (TABS as readonly string[]).includes(rawTab || "") ? (rawTab as Tab) : "Overview";

  function setActiveTab(tab: Tab) {
    const next = new URLSearchParams(searchParams.toString());
    next.set("tab", tab);
    router.replace(`/site-crawls/${crawlId}?${next.toString()}`);
  }

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
        <>
          {/* Pages/Issues browsing only makes sense once the crawl has
              produced final results — matches the existing gate for the
              Overview scores/thematic report, not a new restriction. */}
          <TabBar tabs={TABS} active={activeTab} onChange={setActiveTab} />
          {activeTab === "Overview" ? <OverviewTab status={status} themes={themes} /> : null}
          {activeTab === "Pages" ? <PagesTab crawlId={crawlId} /> : null}
          {activeTab === "Issues" ? <IssuesTab crawlId={crawlId} /> : null}
        </>
      )}
    </div>
  );
}
