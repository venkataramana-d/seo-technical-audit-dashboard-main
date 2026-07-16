// Client-side crawl orchestrator for the sitewide Technical Audit.
//
// Our backend is stateless Vercel serverless (60s/invocation, no SSE, no server
// state, see PROJECT_LOG.md), so the browser drives the crawl: given a list of
// URLs it fires bounded-concurrency single-URL POST /api/audit calls, reporting
// progress as each completes. One invocation audits one URL, so nothing risks
// the 60s function cap.

import type { AuditResult } from "@/lib/types";
import { domainHealthFor, type DomainHealthMap } from "@/lib/crawl/siteHealthCache";

export interface CrawlOptions {
  auditType?: "auto" | "course" | "blog" | "general";
  checkLinks?: boolean;
  validateLinks?: boolean;
  fetchPagespeed?: boolean;
  concurrency?: number; // default 5, clamped 1..10
  psiApiKey?: string;
  // Phase 2: host -> domain-level site-health, prefetched once so each audit
  // skips re-running WHOIS/DNS/SSL/robots/etc. for its domain.
  domainHealth?: DomainHealthMap;
}

export interface CrawlProgress {
  total: number;
  completed: number;
  succeeded: number;
  failed: number;
  inFlight: number;
  lastUrl: string;
  lastResult?: AuditResult;
}

export const DEFAULT_CONCURRENCY = 5;
export const MAX_CONCURRENCY = 10;

async function auditOne(url: string, opts: CrawlOptions, signal: AbortSignal): Promise<AuditResult> {
  const res = await fetch("/api/audit-pipeline", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal,
    body: JSON.stringify({
      action: "audit",
      url,
      auditType: opts.auditType ?? "auto",
      checkLinks: opts.checkLinks ?? true,
      validateLinks: opts.validateLinks ?? false,
      fetchPagespeed: opts.fetchPagespeed ?? false,
      psiApiKey: opts.psiApiKey || undefined,
      prefetchedDomainHealth: domainHealthFor(opts.domainHealth, url) || undefined,
    }),
  });
  const data = await res.json();
  if (!res.ok) {
    // Surface as a synthetic failed result so the crawl continues.
    return {
      url,
      fetch_error: data.error || `HTTP ${res.status}`,
      status_code: 0,
      seo_score: 0,
    } as unknown as AuditResult;
  }
  return data as AuditResult;
}

/**
 * Run a bounded-concurrency crawl over `urls`. Resolves with all results once
 * every URL has been attempted (or the signal aborts). `onProgress` fires after
 * each URL completes; `onResult` fires with each result (for incremental
 * persistence).
 */
export async function runCrawl(
  urls: string[],
  opts: CrawlOptions,
  callbacks: {
    onProgress?: (p: CrawlProgress) => void;
    onResult?: (r: AuditResult) => void;
    signal?: AbortSignal;
  } = {},
): Promise<AuditResult[]> {
  const { onProgress, onResult, signal } = callbacks;
  const concurrency = Math.max(1, Math.min(opts.concurrency ?? DEFAULT_CONCURRENCY, MAX_CONCURRENCY));
  const abort = signal ?? new AbortController().signal;

  const results: AuditResult[] = [];
  let completed = 0;
  let succeeded = 0;
  let failed = 0;
  let inFlight = 0;
  let cursor = 0;

  const total = urls.length;

  async function worker() {
    while (cursor < total) {
      if (abort.aborted) return;
      const idx = cursor++;
      const url = urls[idx];
      inFlight++;
      let result: AuditResult;
      try {
        result = await auditOne(url, opts, abort);
      } catch (err) {
        if (abort.aborted) return;
        result = {
          url,
          fetch_error: err instanceof Error ? err.message : "Request failed",
          status_code: 0,
          seo_score: 0,
        } as unknown as AuditResult;
      }
      inFlight--;
      completed++;
      if (result.fetch_error) failed++;
      else succeeded++;
      results.push(result);
      onResult?.(result);
      onProgress?.({ total, completed, succeeded, failed, inFlight, lastUrl: url, lastResult: result });
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, total) }, () => worker());
  await Promise.all(workers);
  return results;
}
