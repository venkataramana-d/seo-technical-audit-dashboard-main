// Mirrors modules/scoring.py WEIGHTS — used only to label the score breakdown
// bars client-side; the actual score/breakdown values come from the API.
export const WEIGHTS: Record<string, number> = {
  metadata: 0.18,
  headings: 0.09,
  canonical: 0.05,
  indexability: 0.06,
  url_structure: 0.05,
  content: 0.17,
  images: 0.08,
  internal_links: 0.13,
  external_links: 0.05,
  advanced: 0.09,
  page_specific: 0.05,
};
