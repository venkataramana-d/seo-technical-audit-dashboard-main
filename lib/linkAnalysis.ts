import type { AuditResult } from "@/lib/types";

export interface LinkEntry {
  url: string;
  anchor_text: string;
  anchor_type: string;
  is_dofollow: boolean;
  is_nofollow: boolean;
  is_sponsored?: boolean;
  is_ugc?: boolean;
  is_broken?: boolean | null;
  is_redirect?: boolean | null;
  health?: string;
  opens_new_tab: boolean;
  has_noopener: boolean;
  has_noreferrer?: boolean;
  is_weak_anchor?: boolean;
  status_code?: number | null;
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

// Mirrors modules/link_auditor.py DOMAIN_CATEGORIES / categorize_domain
const DOMAIN_CATEGORIES: Record<string, Set<string>> = {
  social: new Set([
    "facebook.com", "twitter.com", "x.com", "linkedin.com", "instagram.com",
    "youtube.com", "tiktok.com", "pinterest.com", "reddit.com", "snapchat.com",
  ]),
  news: new Set([
    "bbc.com", "cnn.com", "nytimes.com", "theguardian.com", "reuters.com",
    "apnews.com", "bloomberg.com", "forbes.com", "wsj.com", "techcrunch.com",
    "businessinsider.com", "entrepreneur.com",
  ]),
  academic: new Set([
    "scholar.google.com", "researchgate.net", "academia.edu", "jstor.org",
    "pubmed.ncbi.nlm.nih.gov", "springer.com", "ieee.org", "ssrn.com",
  ]),
  government: new Set(["gov", "mil", "europa.eu"]),
  reference: new Set([
    "wikipedia.org", "wikimedia.org", "britannica.com", "investopedia.com",
    "merriam-webster.com",
  ]),
  tech: new Set([
    "github.com", "stackoverflow.com", "developer.mozilla.org", "docs.python.org",
    "aws.amazon.com", "cloud.google.com", "docs.microsoft.com", "npmjs.com",
  ]),
};

export function categorizeDomain(domain: string): string {
  const d = (domain || "").toLowerCase().replace(/^www\./, "");
  for (const [cat, domains] of Object.entries(DOMAIN_CATEGORIES)) {
    if (domains.has(d)) return cat[0].toUpperCase() + cat.slice(1);
    if (cat === "government") {
      for (const tld of domains) {
        if (d.endsWith(`.${tld}`) || d === tld) return "Government";
      }
    }
  }
  return "Other";
}

export function anchorTextDistribution(links: LinkEntry[], topN = 20) {
  const counts = new Map<string, { count: number; isWeak: boolean }>();
  for (const l of links) {
    const anchor = (l.anchor_text || "").trim();
    if (!anchor) continue;
    const entry = counts.get(anchor) || { count: 0, isWeak: !!l.is_weak_anchor };
    entry.count += 1;
    counts.set(anchor, entry);
  }
  const total = links.length || 1;
  return [...counts.entries()]
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, topN)
    .map(([anchor, { count, isWeak }]) => ({
      anchor,
      count,
      isWeak,
      pct: Math.round((count / total) * 1000) / 10,
    }));
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

export interface DomainStat {
  domain: string;
  category: string;
  count: number;
  dofollow: number;
  nofollow: number;
  broken: number;
}

export function externalDomainBreakdown(links: LinkEntry[], topN = 15): DomainStat[] {
  const byDomain = new Map<string, DomainStat>();
  for (const l of links) {
    const domain = getBaseDomain(l.url);
    if (!domain) continue;
    const stat = byDomain.get(domain) || {
      domain,
      category: categorizeDomain(domain),
      count: 0,
      dofollow: 0,
      nofollow: 0,
      broken: 0,
    };
    stat.count += 1;
    if (l.is_dofollow) stat.dofollow += 1;
    if (l.is_nofollow) stat.nofollow += 1;
    if (l.is_broken) stat.broken += 1;
    byDomain.set(domain, stat);
  }
  return [...byDomain.values()].sort((a, b) => b.count - a.count).slice(0, topN);
}

export function linkHealthCounts(links: LinkEntry[]) {
  let ok = 0, broken = 0, redirect = 0, unknown = 0;
  for (const l of links) {
    if (l.is_broken) broken++;
    else if (l.is_redirect) redirect++;
    else if (l.health === "unknown" || l.health === undefined) unknown++;
    else ok++;
  }
  return { ok, broken, redirect, unknown };
}

export function securityGaps(links: LinkEntry[]): LinkEntry[] {
  return links.filter((l) => l.opens_new_tab && (!l.has_noopener || !l.has_noreferrer));
}
