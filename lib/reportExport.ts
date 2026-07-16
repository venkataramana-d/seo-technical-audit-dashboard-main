// Client-side report export.
//
// Why this exists: exporting used to POST the entire `results` array (every
// field of every audited page's full audit_url() output) to api/export.py as
// one JSON body. Vercel serverless functions cap request bodies at ~4.5MB, so
// exporting anything beyond a handful of URLs returned 413 Payload Too Large.
//
// The real fix has three parts:
// 1. CSV and JSON need no server round-trip at all: the browser already has
//    the full `results` array in memory, so both are generated and downloaded
//    entirely client-side. Zero network payload, so no size limit applies.
// 2. Excel and PDF still benefit from server-side generation (xlsxwriter
//    colour-coding, fpdf2 layout), so those still POST to api/export.py, but
//    the payload is trimmed first to only the fields
//    modules/report_generator.py actually reads (dropping heavy unused
//    nested blobs like image_detail, advanced, site_health, mobile_audit,
//    and full paragraph HTML), then gzip-compressed. This cuts a typical
//    payload by ~90%+, comfortably fitting far larger result sets.
// 3. A client-side size guard checks the compressed payload before sending
//    so an unusually large export fails with a clear, actionable message
//    instead of a bare 413.

import { scoreLabel } from "@/lib/format";
import type { AuditResult, Issue } from "@/lib/types";

// Leaves headroom under Vercel's ~4.5MB serverless request-body limit.
export const MAX_EXPORT_PAYLOAD_BYTES = 4 * 1024 * 1024;

const CSV_COLUMNS = [
  "URL", "Audit Type", "Status Code", "SEO Score", "Score Label", "Response Time (s)",
  "Redirects", "Total Issues", "Critical", "High", "Medium", "Low", "Meta Title",
  "Title Length", "Meta Description", "Desc Length", "H1 Count", "H2 Count", "Word Count",
  "Reading Time (min)", "Thin Content", "Total Images", "Images Missing Alt", "Canonical URL",
  "Is Indexable", "Internal Links", "Broken Internal", "External Links", "Broken External",
  "Checklist Passed", "Checklist Warnings", "Checklist Failed", "Fetch Error",
] as const;

/** Build CSV rows for the current results, matching modules/report_generator.py::flatten()'s columns 1:1. */
export function buildResultsCsvRows(results: AuditResult[]): string[][] {
  const rows: string[][] = [[...CSV_COLUMNS]];
  for (const r of results) {
    const issues = r.all_issues || [];
    const sev = (s: string) => issues.filter((i) => i.severity === s).length;
    const meta = r.metadata || {};
    const head = r.headings || {};
    const cont = r.content || {};
    const imgs = r.images || {};
    const can = r.canonical || {};
    const idx = r.indexability || {};
    const il = r.internal_links || {};
    const el = r.external_links || {};
    const checklistSummary = r.technical_audit_checklist?.summary;
    const desc = String(meta.description ?? "");

    rows.push([
      r.url ?? "",
      r.audit_type ? r.audit_type[0].toUpperCase() + r.audit_type.slice(1) : "",
      String(r.status_code ?? ""),
      String(r.seo_score ?? 0),
      scoreLabel(r.seo_score ?? 0),
      String(Math.round((r.response_time ?? 0) * 100) / 100),
      String(r.redirect_count ?? 0),
      String(issues.length),
      String(sev("Critical")),
      String(sev("High")),
      String(sev("Medium")),
      String(sev("Low") + sev("Warning")),
      String(meta.title ?? ""),
      String(meta.title_length ?? ""),
      desc.length > 120 ? `${desc.slice(0, 120)}...` : desc,
      String(meta.description_length ?? ""),
      String(head.h1_count ?? ""),
      String(head.h2_count ?? ""),
      String(cont.word_count ?? ""),
      String(cont.reading_time ?? ""),
      String(cont.is_thin ?? ""),
      String(imgs.total_images ?? ""),
      String(imgs.missing_alt_count ?? ""),
      String(can.canonical_url ?? ""),
      String(idx.is_indexable ?? ""),
      String(il.total_links ?? ""),
      String(il.broken_count ?? ""),
      String(el.total_links ?? ""),
      String(el.broken_count ?? ""),
      String(checklistSummary?.pass ?? ""),
      String(checklistSummary?.warning ?? ""),
      String(checklistSummary?.fail ?? ""),
      String(r.fetch_error ?? ""),
    ]);
  }
  return rows;
}

/** Download the full raw results as pretty-printed JSON. No network call, no size limit. */
export function downloadResultsJson(results: AuditResult[]) {
  const blob = new Blob([JSON.stringify(results, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "seo-audit-report.json";
  a.click();
  URL.revokeObjectURL(url);
}

interface TrimmedLink {
  url?: string;
  anchor_text?: string;
  is_dofollow?: boolean;
  opens_new_tab?: boolean;
  has_noopener?: boolean;
  status_code?: number | string;
  is_broken?: boolean | string;
}

function trimLinks(block: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!block) return {};
  const links = Array.isArray(block.links) ? (block.links as Record<string, unknown>[]) : [];
  const trimmedLinks: TrimmedLink[] = links.map((l) => ({
    url: l.url as string | undefined,
    anchor_text: l.anchor_text as string | undefined,
    is_dofollow: l.is_dofollow as boolean | undefined,
    opens_new_tab: l.opens_new_tab as boolean | undefined,
    has_noopener: l.has_noopener as boolean | undefined,
    status_code: l.status_code as number | string | undefined,
    is_broken: l.is_broken as boolean | string | undefined,
  }));
  return {
    total_links: block.total_links,
    broken_count: block.broken_count,
    links: trimmedLinks,
  };
}

function trimIssue(i: Issue) {
  return { issue: i.issue, category: i.category, severity: i.severity, recommendation: i.recommendation };
}

/**
 * Strip a full AuditResult down to only the fields
 * modules/report_generator.py's flatten()/generate_excel()/generate_pdf()
 * actually read, dropping heavy unused nested blobs (image_detail, advanced,
 * site_health, mobile_audit, full paragraph HTML, etc). This is what cuts
 * the server-bound payload by ~90%+; CSV/JSON never call this since they
 * don't touch the network at all.
 */
export function trimResultForServerExport(r: AuditResult): Record<string, unknown> {
  return {
    url: r.url,
    audit_type: r.audit_type,
    status_code: r.status_code,
    seo_score: r.seo_score,
    response_time: r.response_time,
    redirect_count: r.redirect_count,
    fetch_error: r.fetch_error,
    all_issues: (r.all_issues || []).map(trimIssue),
    metadata: {
      title: r.metadata?.title, title_length: r.metadata?.title_length,
      description: r.metadata?.description, description_length: r.metadata?.description_length,
    },
    headings: { h1_count: r.headings?.h1_count, h2_count: r.headings?.h2_count },
    content: { word_count: r.content?.word_count, reading_time: r.content?.reading_time, is_thin: r.content?.is_thin },
    images: { total_images: r.images?.total_images, missing_alt_count: r.images?.missing_alt_count },
    canonical: { canonical_url: r.canonical?.canonical_url },
    indexability: { is_indexable: r.indexability?.is_indexable },
    internal_links: trimLinks(r.internal_links),
    external_links: trimLinks(r.external_links),
    technical_audit_checklist: r.technical_audit_checklist
      ? { summary: r.technical_audit_checklist.summary, checks: r.technical_audit_checklist.checks }
      : null,
  };
}

/** Gzip-compress a JSON-serializable value using the browser's native Compression Streams API. */
export async function gzipJson(value: unknown): Promise<Uint8Array> {
  const json = JSON.stringify(value);
  const bytes = new TextEncoder().encode(json);
  const cs = new CompressionStream("gzip");
  const writer = cs.writable.getWriter();
  writer.write(bytes);
  writer.close();
  const chunks: Uint8Array[] = [];
  const reader = cs.readable.getReader();
  for (;;) {
    const { done, value: chunk } = await reader.read();
    if (done) break;
    chunks.push(chunk);
  }
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }
  return out;
}
