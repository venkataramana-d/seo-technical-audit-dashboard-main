import { describe, expect, it } from "vitest";
import { getThematicIssues, issuesByTitle } from "./aggregate";
import type { AuditResult, Issue } from "./types";

const mkIssue = (over: Partial<Issue>): Issue => ({
  issue: "",
  category: "",
  severity: "Medium",
  recommendation: "",
  impact_score: 5,
  effort: "Low",
  ...over,
});

const mkResult = (url: string, issues: Issue[]): AuditResult =>
  ({ url, all_issues: issues } as unknown as AuditResult);

describe("issuesByTitle", () => {
  it("groups by title and records the exact affected page URLs", () => {
    const results = [
      mkResult("https://x.com/a", [mkIssue({ issue: "Missing meta description" })]),
      mkResult("https://x.com/b", [mkIssue({ issue: "Missing meta description" })]),
      mkResult("https://x.com/c", [mkIssue({ issue: "H1 too long", severity: "Warning" })]),
    ];
    const agg = issuesByTitle(results);
    const md = agg.find((a) => a.issue === "Missing meta description")!;
    expect(md.count).toBe(2);
    expect(md.urls).toEqual(["https://x.com/a", "https://x.com/b"]);
  });

  it("counts a page once per title even if it emits the issue twice", () => {
    const results = [
      mkResult("https://x.com/a", [
        mkIssue({ issue: "Broken link" }),
        mkIssue({ issue: "Broken link" }),
      ]),
    ];
    const agg = issuesByTitle(results);
    expect(agg[0].count).toBe(1);
    expect(agg[0].urls).toEqual(["https://x.com/a"]);
  });

  it("sorts the most severe issue first even when it affects fewer pages", () => {
    const results = [
      mkResult("https://x.com/a", [mkIssue({ issue: "Minor", severity: "Low" })]),
      mkResult("https://x.com/b", [mkIssue({ issue: "Minor", severity: "Low" })]),
      mkResult("https://x.com/c", [mkIssue({ issue: "Critical thing", severity: "Critical" })]),
    ];
    const agg = issuesByTitle(results);
    expect(agg[0].issue).toBe("Critical thing");
  });
});

describe("getThematicIssues category mapping", () => {
  it("does not drop heading/security/mobile-UX categories into Other", () => {
    const issues = [
      "Heading Structure",
      "Security",
      "Responsiveness",
      "Usability",
      "Navigation",
      "User Experience",
      "Layout",
    ].map((category) => mkIssue({ issue: `${category} issue`, category }));
    const grouped = getThematicIssues(issues);
    expect(grouped.Other).toBeUndefined();
  });
});
