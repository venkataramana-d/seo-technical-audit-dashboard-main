import type { AuditResult } from "@/lib/types";

export interface LinkEntry {
  url: string;
  anchor_text: string;
  anchor_type: string;
  link_category?: "page" | "pdf" | "download" | "image" | string;
  location?: "nav" | "header" | "footer" | "sidebar" | "breadcrumb" | "body" | string;
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
  missing_target?: boolean;
  is_weak_anchor?: boolean;
  status_code?: number | null;
  redirect_path?: string[] | null;
  response_time_ms?: number | null;
  content_type?: string | null;
  sourceUrl: string;
}

export interface SpecialLinkEntry {
  href: string;
  anchor_text: string;
  kind: "mailto" | "tel" | "anchor" | "javascript";
  location: string;
  sourceUrl: string;
}

export function flattenSpecialLinks(results: AuditResult[]): SpecialLinkEntry[] {
  return results.flatMap((r) => {
    const special = (r as any).special_links || {};
    return Object.values(special).flatMap((list: any) =>
      (list || []).map((l: any) => ({ ...l, sourceUrl: r.url })),
    );
  });
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

// Was this specific link actually HTTP-checked (validateLinks was on), or is its
// health/status just the unchecked default? Surfaced in the UI as a certainty label
// rather than a numeric "confidence score" — a 404 is a 404, not a probability.
export function linkCertainty(link: LinkEntry): "Verified" | "Not Checked" {
  return link.status_code !== null && link.status_code !== undefined ? "Verified" : "Not Checked";
}

// Deterministic priority scoring (NOT a machine-learned score) — combines issue
// severity with reach (internal links affect crawl budget/link equity on your own
// site; homepage-adjacent links are seen by more crawl paths).
export function priorityScore(link: LinkEntry, kind: "internal" | "external", isHomepage: boolean): number {
  let score = 0;
  if (link.is_broken) score = 70;
  else if (link.is_redirect) score = 40;
  else return 0;
  if (kind === "internal") score += 20;
  if (isHomepage) score += 10;
  return Math.min(100, score);
}

export interface ExecutiveSummary {
  linkHealthScore: number;
  totalLinks: number;
  criticalCount: number;
  brokenCount: number;
  redirectCount: number;
  securityGapCount: number;
  weakAnchorCount: number;
  orphanCount: number;
  quickWins: string[];
  topPriorityFixes: string[];
}

// Rule-based summary computed from already-gathered stats — not LLM-generated prose.
// Labeled as such in the UI; wiring a real LLM for natural-language write-ups would
// need an API key (see project notes).
export function buildExecutiveSummary(
  allLinks: LinkEntry[],
  orphanCount: number,
): ExecutiveSummary {
  const health = linkHealthCounts(allLinks);
  const gaps = securityGaps(allLinks);
  const weak = allLinks.filter((l) => l.is_weak_anchor);
  const total = allLinks.length || 1;
  const healthScore = Math.round(((health.ok + health.unknown * 0.5) / total) * 100);
  const criticalCount = health.broken;

  const quickWins: string[] = [];
  if (weak.length > 0) quickWins.push(`Rewrite ${weak.length} weak anchor text link(s) (e.g. "click here") with descriptive text.`);
  if (gaps.length > 0) quickWins.push(`Add rel="noopener noreferrer" to ${gaps.length} link(s) opening in a new tab.`);
  if (orphanCount > 0) quickWins.push(`Add internal links to ${orphanCount} orphan page(s) with zero inbound links.`);

  const topPriorityFixes: string[] = [];
  if (health.broken > 0) topPriorityFixes.push(`Fix ${health.broken} broken link(s) — direct crawl and user-experience impact.`);
  if (health.redirect > 0) topPriorityFixes.push(`Update ${health.redirect} redirecting link(s) to point straight to the final URL.`);

  return {
    linkHealthScore: Math.max(0, Math.min(100, healthScore)),
    totalLinks: allLinks.length,
    criticalCount,
    brokenCount: health.broken,
    redirectCount: health.redirect,
    securityGapCount: gaps.length,
    weakAnchorCount: weak.length,
    orphanCount,
    quickWins,
    topPriorityFixes,
  };
}
