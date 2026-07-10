import type { AuditResult, Issue } from "@/lib/types";

// Mirrors modules/scoring.py THEMES / get_thematic_issues / get_top_issues_by_impact —
// these are pure grouping/sorting functions over already-computed issue lists,
// so there's no need to round-trip to the Python API to recompute them.
export const THEMES: Record<string, string[]> = {
  Crawlability: ["Accessibility", "Redirects", "Indexability", "URL Structure"],
  Metadata: ["Metadata"],
  Content: ["Content", "Headings", "Readability"],
  Links: ["Internal Links", "External Links"],
  Technical: ["Canonical", "Technical", "Mobile", "Performance"],
  "Social & Schema": ["Structured Data", "Social SEO", "International SEO"],
  Images: ["Images"],
  "Page-Specific": ["Course Content", "Blog Content", "Conversion"],
};

export function getThematicIssues(allIssues: Issue[]): Record<string, Issue[]> {
  const grouped: Record<string, Issue[]> = {};
  for (const theme of Object.keys(THEMES)) grouped[theme] = [];
  const other: Issue[] = [];

  for (const issue of allIssues) {
    const cat = (issue.category || "").toLowerCase();
    let placed = false;
    for (const [theme, categories] of Object.entries(THEMES)) {
      if (categories.some((c) => cat.includes(c.toLowerCase()))) {
        grouped[theme].push(issue);
        placed = true;
        break;
      }
    }
    if (!placed) other.push(issue);
  }
  if (other.length) grouped["Other"] = other;

  return Object.fromEntries(Object.entries(grouped).filter(([, v]) => v.length > 0));
}

export function getTopIssuesByImpact(allIssues: Issue[], topN = 10): Issue[] {
  return [...allIssues]
    .sort((a, b) => (b.impact_score || 0) - (a.impact_score || 0))
    .slice(0, topN);
}

export function severityCounts(allIssues: Issue[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const issue of allIssues) {
    const sev = issue.severity || "Low";
    counts[sev] = (counts[sev] || 0) + 1;
  }
  return counts;
}

export function scoreDistribution(results: AuditResult[]): {
  good: number;
  average: number;
  poor: number;
} {
  let good = 0,
    average = 0,
    poor = 0;
  for (const r of results) {
    const score = r.seo_score ?? 0;
    if (score >= 90) good++;
    else if (score >= 50) average++;
    else poor++;
  }
  return { good, average, poor };
}

export function avgScore(results: AuditResult[]): number {
  if (!results.length) return 0;
  return results.reduce((sum, r) => sum + (r.seo_score ?? 0), 0) / results.length;
}

export function allIssuesOf(results: AuditResult[]): Issue[] {
  return results.flatMap((r) => r.all_issues || []);
}
