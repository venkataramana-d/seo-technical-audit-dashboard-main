// Mirrors modules/scoring.py WEIGHTS, used only to label the score breakdown
// bars client-side; the actual score/breakdown values come from the API.
export const WEIGHTS: Record<string, number> = {
  metadata: 0.16,
  headings: 0.08,
  canonical: 0.05,
  indexability: 0.06,
  url_structure: 0.05,
  content: 0.15,
  images: 0.07,
  internal_links: 0.11,
  external_links: 0.04,
  advanced: 0.08,
  site_health: 0.10,
  page_specific: 0.05,
};
