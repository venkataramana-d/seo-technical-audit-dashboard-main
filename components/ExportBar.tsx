"use client";

import { useState } from "react";
import type { AuditResult } from "@/lib/types";
import { Card } from "@/components/ui";
import { downloadCsv } from "@/lib/format";
import {
  buildResultsCsvRows,
  downloadResultsJson,
  gzipJson,
  MAX_EXPORT_PAYLOAD_BYTES,
  trimResultForServerExport,
} from "@/lib/reportExport";

const FORMATS = [
  { id: "csv", label: "CSV", desc: "Flat summary, one row per URL. Generated in your browser." },
  { id: "xlsx", label: "Excel", desc: "Summary, Issues, Links, Checklist sheets." },
  { id: "pdf", label: "PDF", desc: "Formatted report for sharing." },
  { id: "json", label: "JSON", desc: "Full raw audit data. Generated in your browser." },
] as const;

/**
 * Compact export control (format picker + downloads). Lives on the Results
 * page: exporting is an action on the current results, not a separate section.
 *
 * CSV and JSON are generated entirely client-side (the browser already has
 * `results` in memory), so they never touch the network and have no payload
 * size limit. Excel and PDF still need server-side generation (xlsxwriter/
 * fpdf2), so those POST a trimmed + gzip-compressed payload to /api/export;
 * see lib/reportExport.ts for why (a full, uncompressed payload used to 413
 * past Vercel's ~4.5MB serverless request-body limit on anything but a tiny
 * result set).
 */
export function ExportBar({ results, totalCount }: { results: AuditResult[]; totalCount?: number }) {
  const [loadingFormat, setLoadingFormat] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const isFiltered = totalCount !== undefined && totalCount !== results.length;

  async function handleExport(format: string) {
    if (!results.length) return;
    setLoadingFormat(format);
    setError(null);
    try {
      if (format === "csv") {
        downloadCsv("seo-audit-report.csv", buildResultsCsvRows(results));
        return;
      }
      if (format === "json") {
        downloadResultsJson(results);
        return;
      }

      const trimmed = results.map(trimResultForServerExport);
      const gzipped = await gzipJson({ results: trimmed, format });
      if (gzipped.byteLength > MAX_EXPORT_PAYLOAD_BYTES) {
        setError(
          `This export is too large (${(gzipped.byteLength / 1024 / 1024).toFixed(1)}MB compressed) ` +
            "for Excel/PDF generation. Try CSV or JSON instead, which have no size limit, or export fewer URLs.",
        );
        return;
      }

      const res = await fetch("/api/export", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Content-Encoding": "gzip" },
        // TS's lib.dom BlobPart typing is overly strict about the Uint8Array's
        // backing buffer generic (ArrayBuffer vs ArrayBufferLike); gzipJson
        // always returns a plain-ArrayBuffer-backed Uint8Array, so this is safe.
        body: new Blob([gzipped as unknown as BlobPart]),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Export failed.");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `seo-audit-report.${format}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Export failed.");
    } finally {
      setLoadingFormat(null);
    }
  }

  return (
    <Card className="mb-4">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm font-semibold text-[var(--seo-subheading)]">
          📤 Export report
        </span>
        <div className="flex flex-wrap gap-2">
          {FORMATS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => handleExport(f.id)}
              disabled={loadingFormat !== null || results.length === 0}
              title={f.desc}
              className="rounded-lg border border-[var(--seo-border-strong)] px-3 py-1.5 text-sm font-medium text-[var(--seo-text)] hover:bg-[var(--seo-card-hover)] disabled:opacity-60"
            >
              {loadingFormat === f.id ? "Generating…" : f.label}
            </button>
          ))}
        </div>
        <span className="text-xs text-[var(--seo-muted)]">
          {results.length === 0
            ? "No URLs match the current filters"
            : `${results.length} URL${results.length === 1 ? "" : "s"}${isFiltered ? ` of ${totalCount} total (matches current filters)` : " in this session"}`}
        </span>
      </div>
      {error ? (
        <div className="mt-3 rounded-lg border border-[var(--seo-error-border)] bg-[var(--seo-error-bg)] px-3 py-2 text-sm text-[var(--seo-error)]">
          {error}
        </div>
      ) : null}
    </Card>
  );
}
