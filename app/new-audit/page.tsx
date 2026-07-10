"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAudit } from "@/lib/state/AuditContext";
import { Card, PageHeader } from "@/components/ui";
import type { AuditResult } from "@/lib/types";

export default function NewAuditPage() {
  const router = useRouter();
  const { addResult } = useAudit();

  const [url, setUrl] = useState("");
  const [auditType, setAuditType] = useState<"auto" | "course" | "blog" | "general">("auto");
  const [checkLinks, setCheckLinks] = useState(true);
  const [validateLinks, setValidateLinks] = useState(false);
  const [fetchPagespeed, setFetchPagespeed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: url.trim(),
          auditType,
          checkLinks,
          validateLinks,
          fetchPagespeed,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Audit failed.");
        return;
      }
      const result = data as AuditResult;
      if (result.fetch_error) {
        setError(result.fetch_error);
      }
      addResult(result);
      router.push("/detail");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Audit failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-2xl">
      <PageHeader
        title="🚀 New Audit"
        subtitle="Run a full technical SEO audit on a single URL."
      />
      <Card>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-[var(--seo-subheading)]">
              URL to audit
            </label>
            <input
              type="url"
              required
              placeholder="https://example.com/page"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className="w-full rounded-lg border border-[var(--seo-border-strong)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--seo-accent)]"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-[var(--seo-subheading)]">
              Audit type
            </label>
            <select
              value={auditType}
              onChange={(e) => setAuditType(e.target.value as typeof auditType)}
              className="w-full rounded-lg border border-[var(--seo-border-strong)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--seo-accent)]"
            >
              <option value="auto">Auto-Detect</option>
              <option value="course">Course</option>
              <option value="blog">Blog</option>
              <option value="general">General</option>
            </select>
          </div>

          <div className="flex flex-col gap-2">
            <label className="flex items-center gap-2 text-sm text-[var(--seo-text)]">
              <input
                type="checkbox"
                checked={checkLinks}
                onChange={(e) => setCheckLinks(e.target.checked)}
              />
              Check links
            </label>
            <label className="flex items-center gap-2 text-sm text-[var(--seo-text)]">
              <input
                type="checkbox"
                checked={validateLinks}
                onChange={(e) => setValidateLinks(e.target.checked)}
              />
              Validate links (slower — checks each link responds)
            </label>
            <label className="flex items-center gap-2 text-sm text-[var(--seo-text)]">
              <input
                type="checkbox"
                checked={fetchPagespeed}
                onChange={(e) => setFetchPagespeed(e.target.checked)}
              />
              Fetch PageSpeed Insights (adds 10-90s)
            </label>
          </div>

          {error ? (
            <div className="rounded-lg border border-[var(--seo-error-border)] bg-[var(--seo-error-bg)] px-3 py-2 text-sm text-[var(--seo-error)]">
              {error}
            </div>
          ) : null}

          <button
            type="submit"
            disabled={loading}
            className="rounded-lg bg-[var(--seo-accent)] px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {loading ? "Running audit…" : "Run Audit"}
          </button>
        </form>
      </Card>
    </div>
  );
}
