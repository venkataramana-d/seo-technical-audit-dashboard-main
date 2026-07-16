import { describe, expect, it } from "vitest";
import { buildResultsCsvRows, gzipJson, trimResultForServerExport } from "./reportExport";
import type { AuditResult } from "@/lib/types";

// Narrow shape asserted against in tests below; trimResultForServerExport's
// real return type is Record<string, unknown> since the trimmed shape isn't
// otherwise consumed by TS code (only serialized and sent to the server).
interface TrimmedTestShape {
  url: string;
  seo_score: number;
  all_issues: { issue: string }[];
  metadata: { title: string };
  internal_links: { links: { url: string }[] };
  technical_audit_checklist: {
    summary: { pass: number };
    checks: unknown[];
    groups?: unknown;
  };
}

function makeResult(overrides: Partial<AuditResult> = {}): AuditResult {
  return {
    url: "https://example.com/",
    status_code: 200,
    audit_type: "general",
    response_time: 0.42,
    redirect_count: 0,
    seo_score: 82,
    all_issues: [
      { issue: "Missing alt text", category: "Images", severity: "High", recommendation: "Add alt text", impact_score: 5, effort: "Low" },
    ],
    metadata: { title: "Example", title_length: 7, description: "A short description.", description_length: 21 },
    headings: { h1_count: 1, h2_count: 3 },
    content: { word_count: 500, reading_time: 2, is_thin: false },
    images: { total_images: 4, missing_alt_count: 1 },
    canonical: { canonical_url: "https://example.com/" },
    indexability: { is_indexable: true },
    internal_links: { total_links: 10, broken_count: 0, links: [{ url: "/a", anchor_text: "A", is_dofollow: true }] },
    external_links: { total_links: 2, broken_count: 1, links: [] },
    technical_audit_checklist: {
      groups: { crawlability: [], on_page: [], site_health: [] },
      checks: [{ id: "title_check", label: "Title present", group: "on_page", status: "pass", detail: "" }],
      summary: { total: 35, pass: 28, warning: 5, fail: 2, info: 0 },
    },
    // Heavy fields a real audit_url() result carries that report_generator.py
    // never reads; trimResultForServerExport must drop these.
    image_detail: { images: Array.from({ length: 50 }, (_, i) => ({ name: `img${i}.jpg`, size: 200000 })) },
    advanced: { schema_types: ["Article"] },
    site_health: { ssl: { valid: true } },
    mobile_audit: { mobile_score: 90 },
    ...overrides,
  } as unknown as AuditResult;
}

describe("buildResultsCsvRows", () => {
  it("includes a header row matching report_generator.py's flatten() columns", () => {
    const rows = buildResultsCsvRows([makeResult()]);
    expect(rows[0]).toEqual([
      "URL", "Audit Type", "Status Code", "SEO Score", "Score Label", "Response Time (s)",
      "Redirects", "Total Issues", "Critical", "High", "Medium", "Low", "Meta Title",
      "Title Length", "Meta Description", "Desc Length", "H1 Count", "H2 Count", "Word Count",
      "Reading Time (min)", "Thin Content", "Total Images", "Images Missing Alt", "Canonical URL",
      "Is Indexable", "Internal Links", "Broken Internal", "External Links", "Broken External",
      "Checklist Passed", "Checklist Warnings", "Checklist Failed", "Fetch Error",
    ]);
  });

  it("flattens a result into one data row with correct severity counts", () => {
    const rows = buildResultsCsvRows([makeResult()]);
    const row = rows[1];
    expect(row[0]).toBe("https://example.com/"); // URL
    expect(row[3]).toBe("82"); // SEO Score
    expect(row[4]).toBe("Good"); // Score Label (75-89)
    expect(row[7]).toBe("1"); // Total Issues
    expect(row[9]).toBe("1"); // High severity count
    expect(row[29]).toBe("28"); // Checklist Passed
  });

  it("produces one row per result, in order", () => {
    const rows = buildResultsCsvRows([makeResult({ url: "https://a.com/" }), makeResult({ url: "https://b.com/" })]);
    expect(rows).toHaveLength(3); // header + 2
    expect(rows[1][0]).toBe("https://a.com/");
    expect(rows[2][0]).toBe("https://b.com/");
  });
});

describe("trimResultForServerExport", () => {
  it("drops heavy fields report_generator.py never reads", () => {
    const trimmed = trimResultForServerExport(makeResult());
    expect(trimmed.image_detail).toBeUndefined();
    expect(trimmed.advanced).toBeUndefined();
    expect(trimmed.site_health).toBeUndefined();
    expect(trimmed.mobile_audit).toBeUndefined();
  });

  it("keeps every field flatten()/generate_excel() actually reads", () => {
    const trimmed = trimResultForServerExport(makeResult()) as unknown as TrimmedTestShape;
    expect(trimmed.url).toBe("https://example.com/");
    expect(trimmed.seo_score).toBe(82);
    expect(trimmed.all_issues[0].issue).toBe("Missing alt text");
    expect(trimmed.metadata.title).toBe("Example");
    expect(trimmed.internal_links.links[0].url).toBe("/a");
    expect(trimmed.technical_audit_checklist.summary.pass).toBe(28);
    expect(trimmed.technical_audit_checklist.checks).toHaveLength(1);
  });

  it("drops the checklist groups key (never read server-side)", () => {
    const trimmed = trimResultForServerExport(makeResult()) as unknown as TrimmedTestShape;
    expect(trimmed.technical_audit_checklist.groups).toBeUndefined();
  });

  it("shrinks the payload substantially by dropping unused nested data", () => {
    const full = makeResult();
    const trimmed = trimResultForServerExport(full);
    const fullSize = JSON.stringify(full).length;
    const trimmedSize = JSON.stringify(trimmed).length;
    expect(trimmedSize).toBeLessThan(fullSize * 0.5);
  });
});

describe("gzipJson", () => {
  it("compresses a JSON-serializable value into non-empty bytes", async () => {
    const bytes = await gzipJson({ hello: "world".repeat(1000) });
    expect(bytes.length).toBeGreaterThan(0);
    // Highly repetitive input compresses well below its raw JSON size.
    const rawSize = JSON.stringify({ hello: "world".repeat(1000) }).length;
    expect(bytes.length).toBeLessThan(rawSize);
  });
});
