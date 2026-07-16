import { describe, expect, it } from "vitest";
import { CHECK_DEFS, CHECK_IDS, checksByGroup } from "./checklistDefs";

describe("checklistDefs", () => {
  it("has exactly 35 checks, matching modules/technical_audit_checklist.py", () => {
    expect(CHECK_DEFS).toHaveLength(35);
    expect(CHECK_IDS).toHaveLength(35);
  });

  it("splits into the 12/11/12 crawlability/on_page/site_health groups", () => {
    const groups = checksByGroup();
    expect(groups.crawlability).toHaveLength(12);
    expect(groups.on_page).toHaveLength(11);
    expect(groups.site_health).toHaveLength(12);
  });

  it("has unique ids", () => {
    expect(new Set(CHECK_IDS).size).toBe(CHECK_IDS.length);
  });

  it("every check has a non-empty label and description", () => {
    for (const c of CHECK_DEFS) {
      expect(c.label.length).toBeGreaterThan(0);
      expect(c.description.length).toBeGreaterThan(10);
    }
  });
});
