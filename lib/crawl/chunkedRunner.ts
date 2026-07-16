// Chunked execution for large bulk audits, on top of the existing
// bounded-concurrency orchestrator (lib/crawl/orchestrator.ts).
//
// Why: the orchestrator itself can already fan out over an arbitrarily long
// URL list (nothing about it is capped at 200), but for very large runs
// (1000+ URLs) an uninterrupted single pass has two real problems: (1) no
// visibility/pacing beyond one giant progress bar, and (2) a closed/crashed
// tab loses ALL in-flight progress with no way to pick back up. This module
// splits a run into fixed-size chunks and persists a lightweight resumable
// checkpoint (just the remaining URL list + counts, not full audit results,
// those still flow through AuditContext/IndexedDB as before) after every
// completed URL, so a reload can resume from wherever it left off instead of
// restarting from scratch.

import { idbDelete, idbGet, idbSet } from "@/lib/state/idbStore";
import { runCrawl, type CrawlOptions, type CrawlProgress } from "@/lib/crawl/orchestrator";
import type { AuditResult } from "@/lib/types";

export const CHUNK_SIZE = 200;
const CHECKPOINT_KEY = "seo-audit-chunked-job";

export interface ChunkedJobCheckpoint {
  urls: string[]; // full original list, fixed for the life of the job
  remaining: string[]; // urls not yet attempted
  succeeded: number; // cumulative across the whole job, survives a resume
  failed: number; // cumulative across the whole job, survives a resume
  options: CrawlOptions;
  label: string; // e.g. "Sitemap: https://example.com/sitemap.xml", for the resume prompt
  startedAt: string;
  updatedAt: string;
}

export async function loadCheckpoint(): Promise<ChunkedJobCheckpoint | null> {
  return idbGet<ChunkedJobCheckpoint>(CHECKPOINT_KEY);
}

export async function clearCheckpoint(): Promise<void> {
  await idbDelete(CHECKPOINT_KEY);
}

export interface ChunkedProgress extends CrawlProgress {
  currentChunk: number;
  totalChunks: number;
}

/**
 * Run `remainingUrls` (a subset of `allUrls`, or `allUrls` itself for a fresh
 * start) in fixed-size chunks, persisting a checkpoint after every result so
 * the run can resume from wherever it stopped. Progress totals always
 * reflect `allUrls.length`, not just what's left, so resuming a job doesn't
 * reset the visible progress bar. `initialCounts` seeds succeeded/failed from
 * a prior session's checkpoint so those totals stay cumulative across a
 * pause/resume instead of resetting to 0.
 */
export async function runChunked(
  allUrls: string[],
  remainingUrls: string[],
  options: CrawlOptions,
  label: string,
  callbacks: {
    onProgress?: (p: ChunkedProgress) => void;
    onResult?: (r: AuditResult) => void;
    signal?: AbortSignal;
  } = {},
  resumeFrom: { succeeded: number; failed: number; startedAt: string } | null = null,
): Promise<void> {
  const total = allUrls.length;
  const totalChunks = Math.max(1, Math.ceil(total / CHUNK_SIZE));
  let remaining = [...remainingUrls];
  let completed = total - remaining.length;
  let succeeded = resumeFrom?.succeeded ?? 0;
  let failed = resumeFrom?.failed ?? 0;
  const startedAt = resumeFrom?.startedAt ?? new Date().toISOString();

  const persist = () => {
    const cp: ChunkedJobCheckpoint = {
      urls: allUrls,
      remaining,
      succeeded,
      failed,
      options,
      label,
      startedAt,
      updatedAt: new Date().toISOString(),
    };
    idbSet(CHECKPOINT_KEY, cp).catch(() => {});
  };
  persist();

  let chunkIndex = Math.floor(completed / CHUNK_SIZE);
  while (remaining.length > 0) {
    if (callbacks.signal?.aborted) return; // checkpoint stays for a later resume
    chunkIndex++;
    const chunk = remaining.slice(0, CHUNK_SIZE);
    await runCrawl(chunk, options, {
      signal: callbacks.signal,
      onResult: (r) => {
        completed++;
        if (r.fetch_error) failed++;
        else succeeded++;
        // Remove only the one completed occurrence, not every occurrence of
        // this URL: `remaining.filter((u) => u !== r.url)` would silently
        // drop all duplicates from the checkpoint if the resolved URL list
        // ever contained one (defense-in-depth; today's URL sources dedupe).
        const dupIdx = remaining.indexOf(r.url);
        if (dupIdx !== -1) {
          remaining = [...remaining.slice(0, dupIdx), ...remaining.slice(dupIdx + 1)];
        }
        callbacks.onResult?.(r);
        callbacks.onProgress?.({
          total, completed, succeeded, failed, inFlight: 0, lastUrl: r.url,
          currentChunk: Math.min(chunkIndex, totalChunks), totalChunks,
        });
        persist();
      },
    });
  }

  await clearCheckpoint();
}
