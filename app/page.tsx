"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAudit } from "@/lib/state/AuditContext";
import { Card, MetricCard, PageHeader, EmptyState, IssueRow } from "@/components/ui";
import { GaugeIcon } from "@/components/icons";
import { formatDate, scoreColor } from "@/lib/format";
import {
  allIssuesOf,
  avgScore,
  getTopIssuesByImpact,
  scoreDistribution,
  severityCounts,
} from "@/lib/aggregate";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const PIE_COLORS = ["#10B981", "#D97706", "#DC2626"];

// Recharts tooltips ignore Tailwind classes; CSS variables in inline styles
// still resolve against the current theme, so this stays light/dark aware.
const CHART_TOOLTIP_STYLE = {
  backgroundColor: "var(--seo-card-bg)",
  border: "1px solid var(--seo-border-strong)",
  borderRadius: "8px",
  color: "var(--seo-text)",
  fontSize: "13px",
};
const CHART_TOOLTIP_LABEL_STYLE = { color: "var(--seo-heading)", fontWeight: 600 };

export default function DashboardPage() {
  const { results, lastAuditDate, setNavFilter } = useAudit();
  const router = useRouter();

  if (results.length === 0) {
    return (
      <div>
        <PageHeader icon={<GaugeIcon size={18} />} title="Dashboard Overview" />
        <EmptyState
          title="No audits yet"
          hint="Run your first audit to see your SEO health dashboard."
        />
        <div className="mt-4">
          <Link
            href="/technical-audit"
            className="inline-block rounded-lg btn-gradient px-4 py-2 text-sm font-semibold text-white"
          >
            Run New Audit
          </Link>
        </div>
      </div>
    );
  }

  const score = avgScore(results);
  const issues = allIssuesOf(results);
  const sevCounts = severityCounts(issues);
  const dist = scoreDistribution(results);
  const topIssues = getTopIssuesByImpact(issues, 5);
  const criticalUrls = results.filter((r) => (r.seo_score ?? 0) < 50).length;

  const distData = [
    { name: "Good (90+)", value: dist.good },
    { name: "Average (50-89)", value: dist.average },
    { name: "Poor (<50)", value: dist.poor },
  ].filter((d) => d.value > 0);

  const sevData = Object.entries(sevCounts).map(([severity, count]) => ({ severity, count }));

  function goToResults(kind: string, key: string) {
    setNavFilter({ kind, key });
    router.push("/results");
  }

  return (
    <div>
      <PageHeader
        icon={<GaugeIcon size={18} />}
        title="Dashboard Overview"
        subtitle={`Last audit: ${formatDate(lastAuditDate)}`}
      />

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <MetricCard label="URLs Audited" value={results.length} />
        <MetricCard
          label="Avg SEO Score"
          value={<span style={{ color: scoreColor(score) }}>{score.toFixed(1)}</span>}
        />
        <MetricCard
          label="Critical URLs"
          value={criticalUrls}
          sub="Score below 50"
          onClick={() => goToResults("score", "critical_urls")}
        />
        <MetricCard
          label="Total Issues"
          value={issues.length}
          onClick={() => goToResults("issues", "all")}
        />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <h3 className="mb-3 text-sm font-semibold text-[var(--seo-subheading)]">
            Score Distribution
          </h3>
          {distData.length ? (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={distData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  fill="#8884d8"
                  isAnimationActive={false}
                >
                  {distData.map((_, i) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={CHART_TOOLTIP_STYLE} labelStyle={CHART_TOOLTIP_LABEL_STYLE} />
                <Legend
                  verticalAlign="bottom"
                  height={36}
                  wrapperStyle={{ fontSize: 12, color: "var(--seo-text-light)" }}
                />
              </PieChart>
            </ResponsiveContainer>
          ) : null}
        </Card>

        <Card>
          <h3 className="mb-3 text-sm font-semibold text-[var(--seo-subheading)]">
            Issues by Severity
          </h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={sevData}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--seo-border)" />
              <XAxis dataKey="severity" tick={{ fontSize: 12, fill: "var(--seo-text-light)" }} />
              <YAxis tick={{ fontSize: 12, fill: "var(--seo-text-light)" }} allowDecimals={false} />
              <Tooltip
                contentStyle={CHART_TOOLTIP_STYLE}
                labelStyle={CHART_TOOLTIP_LABEL_STYLE}
                cursor={{ fill: "var(--seo-card-hover)" }}
              />
              <Bar dataKey="count" fill="var(--seo-accent)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      </div>

      <Card className="mt-6">
        <h3 className="mb-2 text-sm font-semibold text-[var(--seo-subheading)]">
          Quick Wins: Top Issues by Impact
        </h3>
        <div>
          {topIssues.map((issue, i) => (
            <IssueRow key={i} issue={issue} />
          ))}
        </div>
      </Card>
    </div>
  );
}
