import type { Issue } from "@/lib/types";
import { STATUS_COLOR_HEX, type StatusColor } from "@/lib/linkAnalysis";

export interface HeadingIssueExplanation {
  issueName: string;
  status: StatusColor;
  whatIsIt: string;
  whyImportant: string;
  seoImpact: string;
  userImpact: string;
  recommendedFix: string;
  htmlExample?: string;
}

// Covers the full severity vocabulary modules/*.py actually emits (Critical/
// High/Medium/Warning/Low, see lib/reportExport.ts's export-column mapping).
// Previously missing "Critical"/"Warning" entirely (falling through to the
// "info" default below) and mapped "High" to the "critical" status instead
// of the distinct "high" tier StatusColor already defines.
const SEVERITY_STATUS: Record<string, StatusColor> = {
  Critical: "critical",
  High: "high",
  Medium: "warning",
  Warning: "warning",
  Low: "info",
};

// Deterministic (rule-based) per-issue explanation, matched against the exact
// f-string patterns produced by modules/heading_auditor.py's _build_issues().
// Mirrors the shape of lib/linkAnalysis.ts's explainLink and lib/imageAnalysis.ts's
// explainImageIssue so all three "Issues" tabs share one visual pattern.
export function explainHeadingIssue(issue: Issue): HeadingIssueExplanation {
  const text = issue.issue;
  const status = SEVERITY_STATUS[issue.severity] || "info";

  if (text === "Missing H1 heading") {
    return {
      issueName: "Missing H1 Heading",
      status: "critical",
      whatIsIt: "The page has no <h1> element at all.",
      whyImportant: "The H1 is the strongest on-page signal of what a page is about, both for search engines and for visitors scanning the page.",
      seoImpact: "Search engines lose the clearest topical signal on the page, which can weaken relevance for the page's target query.",
      userImpact: "Visitors (and screen reader users navigating by heading) have no clear entry point summarizing the page's topic.",
      recommendedFix: "Add exactly one <h1> near the top of the page that clearly states the page's main topic.",
      htmlExample: "<h1>Clear, Specific Page Title</h1>",
    };
  }
  if (text.startsWith("Multiple H1 headings found")) {
    return {
      issueName: "Multiple H1 Headings",
      status: "warning",
      whatIsIt: `${text}: the page has more than one <h1>.`,
      whyImportant: "A page should have a single, unambiguous main topic. Multiple H1s dilute that signal and confuse the document outline.",
      seoImpact: "Search engines may struggle to determine the single primary topic, diluting topical relevance signals.",
      userImpact: "Screen reader users navigating by heading can lose track of which heading is the actual page title.",
      recommendedFix: "Keep one <h1> as the true page title; demote the others to <h2> or lower based on their place in the outline.",
    };
  }
  if (text.startsWith("H1 heading is too long")) {
    return {
      issueName: "H1 Too Long",
      status: "warning",
      whatIsIt: `${text}.`,
      whyImportant: "An overly long H1 buries the core topic in extra words, making it harder to scan and less impactful as a topical signal.",
      seoImpact: "Dilutes the keyword relevance signal the H1 provides; a long, unfocused H1 reads as less specific.",
      userImpact: "Harder to scan at a glance; on mobile a very long H1 can dominate the viewport before any actual content.",
      recommendedFix: "Tighten the H1 to a concise phrase (roughly 20–70 characters) that states the page's core topic.",
    };
  }
  if (text.startsWith("H1 heading is too short")) {
    return {
      issueName: "H1 Too Short",
      status: "info",
      whatIsIt: `${text}.`,
      whyImportant: "A very short H1 (e.g. a single generic word) often fails to describe the page's actual topic.",
      seoImpact: "Provides a weak or vague topical signal, missing an easy opportunity to reinforce the target keyword/topic.",
      userImpact: "Visitors scanning headings get little information about what the page actually covers.",
      recommendedFix: "Expand the H1 into a specific, descriptive phrase rather than a single generic word.",
    };
  }
  if (text.startsWith("Skipped heading level")) {
    return {
      issueName: "Skipped Heading Level",
      status: "warning",
      whatIsIt: `${text}: the document jumps levels instead of stepping down one at a time.`,
      whyImportant: "Heading levels form a document outline. Skipping levels (e.g. H2 straight to H4) breaks that outline's logical structure.",
      seoImpact: "Search engines rely on heading hierarchy to understand content structure; a broken outline weakens that structural signal.",
      userImpact: "Screen reader users navigate pages by heading level; a skipped level makes the page feel like content is missing between sections.",
      recommendedFix: "Use sequential heading levels (H2 → H3 → H4) without skipping, reflecting the true nesting of sections.",
    };
  }
  if (text.startsWith("Empty heading detected")) {
    return {
      issueName: "Empty Heading",
      status: "warning",
      whatIsIt: `${text}: a heading tag exists with no text content.`,
      whyImportant: "An empty heading contributes nothing but still occupies a slot in the document outline, confusing both crawlers and assistive tech.",
      seoImpact: "No relevance signal from an empty heading, and it can make the surrounding structure look broken to crawlers.",
      userImpact: "Screen reader users hear an announced heading with no content, which is disorienting.",
      recommendedFix: "Either fill the heading with meaningful text or remove the empty tag entirely.",
    };
  }
  if (text.startsWith("Duplicate")) {
    return {
      issueName: "Duplicate Headings",
      status: "info",
      whatIsIt: `${text}.`,
      whyImportant: "Repeating the same heading text across a page makes sections indistinguishable from one another.",
      seoImpact: "Reduces the topical distinctiveness each heading could otherwise contribute to the page.",
      userImpact: "Visitors and screen reader users scanning headings can't tell sections apart or jump directly to the one they want.",
      recommendedFix: "Give each heading unique, specific text describing that section's actual content.",
    };
  }
  if (text === "No H2 headings found despite H1 being present") {
    return {
      issueName: "No H2 Headings",
      status: "info",
      whatIsIt: "The page has an H1 but no H2 subheadings beneath it.",
      whyImportant: "H2s break a page into scannable sections and give search engines a sense of the page's subtopics.",
      seoImpact: "Missed opportunity to signal subtopic coverage and improve the odds of ranking for related long-tail queries.",
      userImpact: "Long pages without subheadings are harder to scan and navigate, especially for visitors looking for one specific section.",
      recommendedFix: "Break the content into logical sections, each introduced by a descriptive H2.",
    };
  }

  return {
    issueName: issue.issue,
    status,
    whatIsIt: issue.issue,
    whyImportant: "This affects the page's heading structure, which search engines and assistive technology use to understand content organization.",
    seoImpact: "May weaken the document outline's contribution to how search engines interpret page structure.",
    userImpact: "May make the page harder to scan or navigate for visitors and screen reader users.",
    recommendedFix: issue.recommendation,
  };
}

export { STATUS_COLOR_HEX };
