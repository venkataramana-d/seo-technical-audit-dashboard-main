// Fix-difficulty labels for audit issues.
//
// Every issue emitted by the Python backend already carries an `effort` field
// ("Low" | "Medium" | "High", see modules/technical_checks.py `_issue` and
// modules/auditor.py). This module maps that backend effort to a user-facing
// difficulty label (Easy / Medium / Hard) so results can be triaged by how
// much work each fix takes. When `effort` is missing or unrecognized we fall
// back to a keyword classifier on the issue title/category so older or
// hand-built results still get a sensible label.

import type { Issue } from "@/lib/types";

export type Difficulty = "Easy" | "Medium" | "Hard";

export const DIFFICULTIES: Difficulty[] = ["Easy", "Medium", "Hard"];

const EFFORT_TO_DIFFICULTY: Record<string, Difficulty> = {
  low: "Easy",
  easy: "Easy",
  medium: "Medium",
  moderate: "Medium",
  high: "Hard",
  hard: "Hard",
};

// Keyword fallback, only consulted when `effort` is absent/unknown. Ordered
// hardest-first so infra work wins over a coincidental "content" keyword.
const HARD_HINTS = [
  "ttfb", "time to first byte", "server", "http/2", "http2", "http/3",
  "lcp", "largest contentful", "cls", "layout shift", "tbt", "blocking time",
  "core web vital", "render", "javascript", "ssl", "certificate", "infrastructure",
];
const EASY_HINTS = [
  "title", "meta description", "alt text", "alt attribute", "open graph", "og:",
  "twitter card", "viewport", "lang attribute", "favicon", "canonical", "h1",
  "heading", "social preview",
];

/** Map a single issue to its fix difficulty. */
export function fixDifficulty(issue: Pick<Issue, "effort" | "issue" | "category">): Difficulty {
  const mapped = EFFORT_TO_DIFFICULTY[(issue.effort || "").trim().toLowerCase()];
  if (mapped) return mapped;

  const hay = `${issue.issue || ""} ${issue.category || ""}`.toLowerCase();
  if (HARD_HINTS.some((k) => hay.includes(k))) return "Hard";
  if (EASY_HINTS.some((k) => hay.includes(k))) return "Easy";
  return "Medium";
}

/** Count issues by difficulty. Returns { Easy, Medium, Hard }. */
export function difficultyBreakdown(
  issues: Array<Pick<Issue, "effort" | "issue" | "category">>,
): Record<Difficulty, number> {
  const out: Record<Difficulty, number> = { Easy: 0, Medium: 0, Hard: 0 };
  for (const i of issues) out[fixDifficulty(i)]++;
  return out;
}
