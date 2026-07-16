import { describe, expect, it } from "vitest";
import { difficultyBreakdown, fixDifficulty } from "./difficulty";

const mk = (over: Partial<{ effort: string; issue: string; category: string }>) => ({
  effort: "",
  issue: "",
  category: "",
  ...over,
});

describe("fixDifficulty", () => {
  it("maps backend effort Low/Medium/High to Easy/Medium/Hard", () => {
    expect(fixDifficulty(mk({ effort: "Low" }))).toBe("Easy");
    expect(fixDifficulty(mk({ effort: "Medium" }))).toBe("Medium");
    expect(fixDifficulty(mk({ effort: "High" }))).toBe("Hard");
  });

  it("is case-insensitive and trims effort", () => {
    expect(fixDifficulty(mk({ effort: "  HIGH " }))).toBe("Hard");
  });

  it("falls back to keyword classification when effort is missing/unknown", () => {
    expect(fixDifficulty(mk({ issue: "Slow TTFB / server response" }))).toBe("Hard");
    expect(fixDifficulty(mk({ issue: "Missing meta description" }))).toBe("Easy");
    expect(fixDifficulty(mk({ effort: "???", issue: "Add alt text to images" }))).toBe("Easy");
  });

  it("defaults to Medium when nothing matches", () => {
    expect(fixDifficulty(mk({ issue: "Some unclassifiable finding" }))).toBe("Medium");
  });

  it("prefers explicit effort over keyword hints", () => {
    // Title hints "Easy" (title tag) but backend says High -> Hard wins.
    expect(fixDifficulty(mk({ effort: "High", issue: "Title tag rewrite blocked by CMS" }))).toBe("Hard");
  });
});

describe("difficultyBreakdown", () => {
  it("counts issues per difficulty", () => {
    const b = difficultyBreakdown([
      mk({ effort: "Low" }),
      mk({ effort: "Low" }),
      mk({ effort: "Medium" }),
      mk({ effort: "High" }),
    ]);
    expect(b).toEqual({ Easy: 2, Medium: 1, Hard: 1 });
  });

  it("returns all-zero for no issues", () => {
    expect(difficultyBreakdown([])).toEqual({ Easy: 0, Medium: 0, Hard: 0 });
  });
});
