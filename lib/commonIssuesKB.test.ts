import { describe, expect, it } from "vitest";
import { explainCommonIssue } from "./commonIssuesKB";

describe("explainCommonIssue", () => {
  it("matches exact issue titles", () => {
    const exp = explainCommonIssue({ issue: "Missing Meta Description" });
    expect(exp).not.toBeNull();
    expect(exp?.whatIsIt).toMatch(/meta name="description"/i);
  });

  it("matches issue titles with a dynamic suffix", () => {
    const exp = explainCommonIssue({ issue: "Meta Title Too Long (78 chars)" });
    expect(exp).not.toBeNull();
    expect(exp?.recommendedFix).toMatch(/30-60 characters/);
  });

  it("matches image alt-text aggregate issues", () => {
    const exp = explainCommonIssue({ issue: "Missing alt text on 4 image(s)" });
    expect(exp).not.toBeNull();
  });

  it("matches sitemap issues regardless of the specific wording", () => {
    expect(explainCommonIssue({ issue: "Sitemap Unreachable" })).not.toBeNull();
    expect(explainCommonIssue({ issue: "Sitemap.xml Not Found" })).not.toBeNull();
    expect(explainCommonIssue({ issue: "Sitemap XML Is Malformed" })).not.toBeNull();
    expect(explainCommonIssue({ issue: "Sitemap Exceeds 50,000 URL Limit" })).not.toBeNull();
  });

  it("falls back to a generic explanation for an issue title with no KB entry", () => {
    const exp = explainCommonIssue({
      issue: "Some Totally Unrelated Made-Up Issue",
      category: "Made Up",
      severity: "Warning",
      recommendation: "Do the thing.",
    });
    expect(exp).not.toBeNull();
    expect(exp.recommendedFix).toBe("Do the thing.");
  });

  it("every entry has all five explanation fields non-empty", () => {
    const samples = [
      "Missing Meta Title", "Missing H1 Tag", "Multiple H1 Tags", "Skipped Heading Levels (e.g. H1→H3)",
      "Thin Content (120 words)", "Missing Canonical Tag", "Multiple Canonical Tags (2)",
      "Broken Internal Links (3)", "Redirecting Internal Links (2)", "Not Using HTTPS",
      "SSL Certificate Expires in 5 Days", "Mixed Content Detected (2 HTTP resource(s) on HTTPS page)",
      "Poor TTFB: Server Response Time 900ms", "Missing Viewport Meta Tag",
      "Invalid JSON-LD Schema (1 parse error(s))", "Missing Open Graph Tags: og:image",
      "Page Blocked by robots.txt", "Large Page Size (3200 KB)",
      "URL Contains Uppercase Letters", "Canonical Points to Different URL",
    ];
    for (const issue of samples) {
      const exp = explainCommonIssue({ issue });
      expect(exp, `expected a KB match for "${issue}"`).not.toBeNull();
      expect(exp!.whatIsIt.length).toBeGreaterThan(0);
      expect(exp!.whyItMatters.length).toBeGreaterThan(0);
      expect(exp!.seoImpact.length).toBeGreaterThan(0);
      expect(exp!.userImpact.length).toBeGreaterThan(0);
      expect(exp!.recommendedFix.length).toBeGreaterThan(0);
    }
  });
});
