import type { AuditResult } from "@/lib/types";

export interface LinkEntry {
  url: string;
  anchor_text: string;
  anchor_type: string;
  is_dofollow: boolean;
  is_nofollow: boolean;
  is_broken?: boolean | null;
  is_redirect?: boolean | null;
  health?: string;
  opens_new_tab: boolean;
  has_noopener: boolean;
  is_weak_anchor?: boolean;
  sourceUrl: string;
}

export function flattenLinks(
  results: AuditResult[],
  kind: "internal" | "external",
): LinkEntry[] {
  const key = kind === "internal" ? "internal_links" : "external_links";
  return results.flatMap((r) =>
    ((r as any)[key]?.links || []).map((l: any) => ({ ...l, sourceUrl: r.url })),
  );
}

export function getBaseDomain(url: string): string {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host.startsWith("www.") ? host.slice(4) : host;
  } catch {
    return "";
  }
}

export function anchorTextDistribution(links: LinkEntry[], topN = 20) {
  const counts = new Map<string, number>();
  for (const l of links) {
    const anchor = (l.anchor_text || "").trim();
    if (!anchor) continue;
    counts.set(anchor, (counts.get(anchor) || 0) + 1);
  }
  const total = links.length || 1;
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN)
    .map(([anchor, count]) => ({ anchor, count, pct: Math.round((count / total) * 1000) / 10 }));
}

export function orphanAndLowLinkPages(results: AuditResult[]) {
  const pageUrls = new Set(results.map((r) => r.url));
  const inbound = new Map<string, number>();
  for (const url of pageUrls) inbound.set(url, 0);
  for (const r of results) {
    for (const l of (r as any).internal_links?.links || []) {
      if (inbound.has(l.url)) inbound.set(l.url, (inbound.get(l.url) || 0) + 1);
    }
  }
  const orphan: string[] = [];
  const lowLink: string[] = [];
  for (const [url, count] of inbound.entries()) {
    if (count === 0) orphan.push(url);
    else if (count < 3) lowLink.push(url);
  }
  return { orphan, lowLink };
}
