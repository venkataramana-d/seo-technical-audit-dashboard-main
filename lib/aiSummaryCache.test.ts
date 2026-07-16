import { describe, expect, it } from "vitest";
import { fingerprintForSummary } from "@/lib/aiSummaryCache";
import type { Issue } from "@/lib/types";

function issue(overrides: Partial<Issue> = {}): Issue {
  return {
    issue: "Missing Meta Description",
    category: "Metadata",
    severity: "High",
    recommendation: "Add one",
    impact_score: 8,
    effort: "Low",
    ...overrides,
  };
}

describe("fingerprintForSummary", () => {
  it("is stable for the same score and issues", () => {
    const issues = [issue()];
    expect(fingerprintForSummary(50, issues)).toBe(fingerprintForSummary(50, issues));
  });

  it("changes when the score changes", () => {
    const issues = [issue()];
    expect(fingerprintForSummary(50, issues)).not.toBe(fingerprintForSummary(90, issues));
  });

  it("changes when an issue is added", () => {
    const a = [issue()];
    const b = [issue(), issue({ issue: "Missing H1", category: "Headings" })];
    expect(fingerprintForSummary(50, a)).not.toBe(fingerprintForSummary(50, b));
  });

  it("changes when a severity changes", () => {
    const a = [issue({ severity: "Low" })];
    const b = [issue({ severity: "Critical" })];
    expect(fingerprintForSummary(50, a)).not.toBe(fingerprintForSummary(50, b));
  });

  it("is order-independent", () => {
    const a = [issue({ issue: "A" }), issue({ issue: "B" })];
    const b = [issue({ issue: "B" }), issue({ issue: "A" })];
    expect(fingerprintForSummary(50, a)).toBe(fingerprintForSummary(50, b));
  });

  it("handles an empty issue list", () => {
    expect(fingerprintForSummary(100, [])).toBe(fingerprintForSummary(100, []));
  });
});
