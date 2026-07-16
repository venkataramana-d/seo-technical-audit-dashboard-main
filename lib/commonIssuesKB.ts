// Common Issues & Fixes knowledge base.
//
// Generalizes the per-issue explainer pattern already used for images
// (lib/imageAnalysis.ts::explainImageIssue: what-is-it / why-it-matters / SEO
// impact / user impact / fix) to the app's other issue categories, so any
// issue in the Issues/Recommendations tabs can offer a "Learn more" expansion
// instead of just its one-line recommendation.
//
// Entries are matched by regex against the real issue title strings emitted
// by modules/{auditor,technical_checks,advanced_checks,link_auditor,
// mobile_auditor,image_auditor}.py (dynamic suffixes like "(42 chars)" are
// matched with a prefix regex, not hardcoded). This is a curated top-~20 list
// of the most common/impactful issues, not exhaustive coverage of every
// possible issue string; unmatched issues simply show no "Learn more".
//
// Fix guidance is grounded in current (2026) authoritative sources where the
// facts change over time (Core Web Vitals thresholds, mobile-first indexing):
// Google Search Central (developers.google.com/search), web.dev, and
// well-established technical-SEO practice for the rest.

export interface CommonIssueExplanation {
  whatIsIt: string;
  whyItMatters: string;
  seoImpact: string;
  userImpact: string;
  recommendedFix: string;
  source?: string;
}

interface KBEntry extends CommonIssueExplanation {
  match: RegExp;
}

const KB: KBEntry[] = [
  {
    match: /missing meta title/i,
    whatIsIt: "The page has no <title> tag at all.",
    whyItMatters: "The title tag is the single strongest on-page relevance signal and is almost always what's shown as the blue clickable headline in search results.",
    seoImpact: "Google will auto-generate a title from page content or headings, which is usually worse than a deliberately written one and can hurt click-through rate.",
    userImpact: "Browser tabs, bookmarks, and search snippets show a blank or generic label instead of a clear description of the page.",
    recommendedFix: "Add a unique <title> tag, roughly 30-60 characters, that accurately and specifically describes the page's content.",
    source: "Google Search Central",
  },
  {
    match: /meta title too (short|long)/i,
    whatIsIt: "The <title> tag exists but is unusually short or long.",
    whyItMatters: "Titles that are too short waste relevance signal; titles that are too long get truncated in search results and can look spammy.",
    seoImpact: "Google may rewrite titles it judges misleading, overly long, or inconsistent with the page content, so you lose control of your own snippet.",
    userImpact: "A truncated title in search results can cut off the most important, clickable part of the message.",
    recommendedFix: "Aim for roughly 30-60 characters (pixel width, not just character count, is what actually gets truncated), with the key term near the front.",
    source: "Google Search Central",
  },
  {
    match: /missing meta description/i,
    whatIsIt: "The page has no <meta name=\"description\"> tag.",
    whyItMatters: "The meta description is the preview snippet shown under the title in search results and is the main lever for click-through rate, though not a direct ranking factor.",
    seoImpact: "Without one, Google auto-generates a snippet from page text, which is often less compelling and doesn't highlight what makes the page worth clicking.",
    userImpact: "Searchers see a generic or oddly-cropped auto-generated snippet instead of a clear reason to click.",
    recommendedFix: "Write a unique, compelling meta description around 150-160 characters that summarizes the page and includes the key term naturally.",
    source: "Google Search Central",
  },
  {
    match: /meta description too (short|long)/i,
    whatIsIt: "The meta description exists but is unusually short or long.",
    whyItMatters: "Meta descriptions are not a ranking factor, but they are the main click-through-rate lever in search results.",
    seoImpact: "Descriptions that are too long get truncated; too short wastes the opportunity to sell the click.",
    userImpact: "A truncated or thin snippet gives searchers less reason to choose this result over a competitor's.",
    recommendedFix: "Target roughly 150-160 characters, front-load the value proposition, and avoid duplicating the title verbatim.",
    source: "Google Search Central",
  },
  {
    match: /missing h1 tag/i,
    whatIsIt: "The page has no <h1> heading.",
    whyItMatters: "The H1 is the primary topical signal for both search engines and screen-reader users navigating by heading structure.",
    seoImpact: "Without a clear H1, search engines have to infer the page's main topic from weaker signals like body text alone.",
    userImpact: "Screen reader users who jump between headings to skim the page have no top-level entry point.",
    recommendedFix: "Add exactly one <h1> that states the page's main topic, matching (but not identical to) the title tag.",
  },
  {
    match: /multiple h1 tags/i,
    whatIsIt: "The page has more than one <h1> element.",
    whyItMatters: "Multiple H1s dilute the single clearest topical signal into several competing ones.",
    seoImpact: "It's not an automatic penalty, but it makes the page's primary topic ambiguous to crawlers.",
    userImpact: "Screen-reader users navigating by heading level see multiple 'top-level' sections with no clear primary one.",
    recommendedFix: "Keep one <h1> for the page's main topic; demote the others to <h2> or lower based on the actual content hierarchy.",
  },
  {
    match: /skipped heading levels/i,
    whatIsIt: "Heading levels jump (e.g. an H1 followed directly by an H3, skipping H2).",
    whyItMatters: "A logical, sequential heading structure (H1 → H2 → H3, no skips) is what lets both crawlers and assistive tech understand the page's outline.",
    seoImpact: "Minor SEO impact directly, but it signals a poorly structured document, which correlates with harder-to-parse content.",
    userImpact: "Screen-reader and keyboard users rely on heading level to understand nesting; a skip breaks that mental model.",
    recommendedFix: "Reorder or renumber headings so each level only ever steps down by one (H1 → H2 → H3), never skipping a level.",
  },
  {
    match: /thin content|below recommended word count/i,
    whatIsIt: "The page's main content is shorter than the depth expected for its type (e.g. under ~300 words for a general/blog page).",
    whyItMatters: "Very short pages rarely have enough substance to fully answer a searcher's query or establish topical authority.",
    seoImpact: "Thin pages tend to rank poorly for competitive terms and are more likely to be seen as low-value by quality-focused ranking systems.",
    userImpact: "Visitors may bounce immediately if the page doesn't actually answer what brought them there.",
    recommendedFix: "Expand the content to substantively cover the topic; for a legitimately short page type (e.g. a contact page), this can be an acceptable exception rather than a bug.",
  },
  {
    match: /missing canonical tag/i,
    whatIsIt: "The page has no rel=\"canonical\" link tag.",
    whyItMatters: "The canonical tag tells search engines which URL is the authoritative version when similar or duplicate content exists at multiple URLs.",
    seoImpact: "Without it, search engines must guess which version to index, which can split ranking signals across near-duplicate URLs (e.g. with vs. without tracking parameters).",
    userImpact: "No direct user-facing impact, but duplicate versions ranking instead of the intended one can send visitors to a slightly wrong URL.",
    recommendedFix: "Add a self-referencing <link rel=\"canonical\" href=\"...\"> on every indexable page, pointing at its own preferred URL.",
    source: "Google Search Central",
  },
  {
    match: /multiple canonical tags|canonical points to different url/i,
    whatIsIt: "The page has more than one canonical tag, or its canonical points to a different URL than expected.",
    whyItMatters: "Conflicting or incorrect canonical signals confuse search engines about which URL should actually rank.",
    seoImpact: "Google may ignore both canonicals and choose its own, unpredictable, canonical URL, or dilute ranking signals across versions.",
    userImpact: "Search results may point to a different (older, redirected, or less relevant) URL than the one that should rank.",
    recommendedFix: "Keep exactly one canonical tag per page, pointing to the correct, final, preferred URL (not a redirect target or a different page entirely).",
  },
  {
    match: /broken (internal|external) links/i,
    whatIsIt: "One or more links on the page point to a URL that returns an error (404, 5xx, or similar).",
    whyItMatters: "Broken links waste crawl budget, break the flow of link equity through the site, and frustrate visitors who click them.",
    seoImpact: "Internal broken links can prevent search engines from discovering other pages; external ones waste authority pointing nowhere useful.",
    userImpact: "Visitors who click a broken link hit a dead end, which damages trust and increases bounce rate.",
    recommendedFix: "Update the link to the correct URL, or remove it if the target page no longer exists; for moved pages, add a 301 redirect at the destination.",
  },
  {
    match: /redirecting internal links/i,
    whatIsIt: "Internal links point to a URL that itself redirects elsewhere, instead of the final destination.",
    whyItMatters: "Every redirect hop adds latency and wastes a small amount of link-equity and crawl budget.",
    seoImpact: "Long or chained redirects can slow discovery of the final page and are a common technical-SEO cleanup item.",
    userImpact: "An extra redirect hop adds a small but real delay before the page the visitor actually wants loads.",
    recommendedFix: "Update internal links to point directly at the final destination URL rather than through a redirect.",
  },
  {
    match: /not using https|page not served over https/i,
    whatIsIt: "The page is served over plain HTTP instead of HTTPS.",
    whyItMatters: "HTTPS is a baseline trust and security signal; modern browsers actively flag HTTP pages as \"Not Secure\".",
    seoImpact: "HTTPS has been a confirmed (if lightweight) ranking signal for years, and Google generally prefers indexing the secure version when both exist.",
    userImpact: "Visitors see a browser security warning, which erodes trust, especially on any page with a form.",
    recommendedFix: "Install an SSL/TLS certificate and serve all pages over HTTPS, then redirect any remaining HTTP requests to HTTPS.",
    source: "Google Search Central",
  },
  {
    match: /ssl certificate (expires|invalid)/i,
    whatIsIt: "The site's SSL certificate is invalid, expired, or expiring soon.",
    whyItMatters: "An invalid certificate breaks the HTTPS trust chain entirely, not just partially.",
    seoImpact: "Search engines may struggle to crawl a site with certificate errors, and users bounce immediately from the browser's security interstitial.",
    userImpact: "Visitors are shown a full-page \"Your connection is not private\" warning and most will leave rather than proceed.",
    recommendedFix: "Renew or reissue the certificate before expiry, and verify the chain covers all serving subdomains.",
  },
  {
    match: /mixed content detected/i,
    whatIsIt: "An HTTPS page loads one or more resources (images, scripts) over plain HTTP.",
    whyItMatters: "Mixed content undermines the security guarantee of HTTPS for the whole page, since insecure resources can be tampered with in transit.",
    seoImpact: "Browsers may block the insecure resources outright, breaking page functionality or layout.",
    userImpact: "Modern browsers show a security warning or silently block the resource, which can visibly break the page.",
    recommendedFix: "Update every hardcoded http:// resource URL to https://, or use protocol-relative/relative URLs.",
  },
  {
    match: /poor ttfb|ttfb needs improvement/i,
    whatIsIt: "Time to First Byte, how long the server takes to start responding, is slower than recommended.",
    whyItMatters: "TTFB gates every other loading metric: nothing else on the page can start rendering until the first byte arrives.",
    seoImpact: "Slow server response drags down Core Web Vitals (especially LCP) and is a page-experience signal Google's March 2026 core update weighted more heavily.",
    userImpact: "Visitors stare at a blank tab for longer before anything appears, and on mobile/slow connections this is felt acutely.",
    recommendedFix: "Add server-side caching, use a CDN, upgrade hosting/database performance, or reduce server-side work per request (aim for well under 200ms).",
    source: "web.dev / Google Search Central",
  },
  {
    match: /missing viewport meta tag|incorrect viewport configuration/i,
    whatIsIt: "The page has no <meta name=\"viewport\"> tag, or it's misconfigured (e.g. a fixed width instead of device-width).",
    whyItMatters: "Since 2024, Google indexes and ranks sites exclusively via mobile-first indexing, so mobile rendering is the only rendering that matters for ranking.",
    seoImpact: "A missing or broken viewport tag means the page won't render responsively, which mobile-first indexing evaluates directly.",
    userImpact: "On phones, the page appears zoomed out or squished, forcing users to pinch-zoom and scroll horizontally.",
    recommendedFix: "Add <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\"> and use responsive CSS so the page adapts to any screen width.",
    source: "Google Search Central (mobile-first indexing)",
  },
  {
    match: /invalid json-ld schema|no structured data found/i,
    whatIsIt: "The page's structured data (JSON-LD schema) has parse errors, or has none at all.",
    whyItMatters: "Structured data is what unlocks rich results (star ratings, FAQ accordions, breadcrumbs, product pricing) in search.",
    seoImpact: "A single missing required property or a syntax error can disqualify the entire block from rich-result eligibility, even if the rest is valid.",
    userImpact: "The listing appears as a plain blue link instead of an enhanced result, which typically gets a lower click-through rate.",
    recommendedFix: "Validate the JSON-LD with Google's Rich Results Test before publishing, fix any reported errors/missing required fields, and add schema if none exists.",
    source: "Google Search Central / Rich Results Test",
  },
  {
    match: /missing open graph tags|missing twitter card tags/i,
    whatIsIt: "The page is missing Open Graph and/or Twitter Card meta tags used for social-sharing previews.",
    whyItMatters: "These tags control exactly how the page appears when shared on social platforms and in some chat apps.",
    seoImpact: "No direct search-ranking impact, but broken/missing social previews reduce click-through and shares from social referral traffic.",
    userImpact: "A shared link shows a blank or generic preview instead of a relevant title, description, and image.",
    recommendedFix: "Add og:title, og:description, og:image (and twitter:card, twitter:title, twitter:description) meta tags with real content.",
  },
  {
    match: /sitemap.*(unreachable|not found|malformed|exceeds 50,000)/i,
    whatIsIt: "The site's sitemap.xml is missing, unreachable, malformed, or over the 50,000-URL limit.",
    whyItMatters: "The sitemap is how you proactively tell search engines which URLs exist, supplementing normal link-based discovery.",
    seoImpact: "A broken sitemap can slow discovery of new or updated pages, especially on large or frequently-changing sites.",
    userImpact: "No direct user impact; this is purely a crawler-facing signal.",
    recommendedFix: "Ensure sitemap.xml is reachable, returns valid XML, and split it into multiple sitemaps referenced by a sitemap index if it exceeds 50,000 URLs.",
  },
  {
    match: /page blocked by robots\.txt/i,
    whatIsIt: "robots.txt disallows crawling of this page for the general crawler and/or Googlebot.",
    whyItMatters: "A blocked page cannot be crawled, and pages that can't be crawled generally can't be properly indexed or ranked.",
    seoImpact: "If this page is meant to be found in search, this rule is actively preventing that.",
    userImpact: "No direct user impact for visitors already on the page, but they won't find it via search.",
    recommendedFix: "Update the Disallow rule in robots.txt to allow crawling of this path, if the page should be indexable.",
  },
  {
    match: /missing (alt text|alt attribute)/i,
    whatIsIt: "One or more images on the page have no alt attribute at all.",
    whyItMatters: "Alt text is how search engines and screen readers understand what an image shows; without it the image carries zero SEO or accessibility value.",
    seoImpact: "These images can't rank in Google Image Search and provide no contextual relevance signal for the surrounding content.",
    userImpact: "Screen-reader users hear nothing when they reach the image, and sighted users see a blank box if the image fails to load.",
    recommendedFix: "Add a concise, descriptive alt attribute to every content image (decorative images can use alt=\"\" deliberately).",
  },
  {
    match: /large page size|large dom size/i,
    whatIsIt: "The page's total transfer size or DOM element count is unusually high.",
    whyItMatters: "Larger pages take longer to download and parse, and a bloated DOM slows down every layout/paint operation the browser performs.",
    seoImpact: "Both drag down Core Web Vitals (LCP, INP), which are page-experience signals in ranking.",
    userImpact: "Slower loading and janky interactions are felt most acutely on mobile devices and slower connections.",
    recommendedFix: "Compress/lazy-load images, remove unused CSS/JS, simplify deeply nested markup, and paginate or virtualize very long lists.",
    source: "web.dev",
  },
  {
    match: /url contains uppercase letters|url contains query parameters|url too long/i,
    whatIsIt: "The URL uses uppercase letters, unnecessary query parameters, or is unusually long.",
    whyItMatters: "Clean, lowercase, parameter-light URLs are easier to read, share, and are less prone to case-sensitivity duplicate-content issues on some servers.",
    seoImpact: "Not a major direct ranking factor, but a canonical tag should resolve any duplicate-content risk if the URL structure can't be simplified.",
    userImpact: "Long or cryptic URLs are harder to read, trust, and remember when shared outside a hyperlink (e.g. pasted in a message).",
    recommendedFix: "Where feasible, use short, descriptive, lowercase, hyphen-separated URLs; if query parameters are functionally required (pagination, filters), ensure a canonical tag points to the primary version.",
  },
];

/** Look up a researched explanation for a common issue, by matching its title.
 * Falls back to a generic explanation built from the issue's own fields
 * (category/severity/recommendation) when no curated entry matches, so every
 * issue can offer a "Learn more" popup, not just the ~20 curated ones. */
export function explainCommonIssue(issue: {
  issue: string;
  category?: string;
  severity?: string;
  recommendation?: string;
  impact_score?: number;
}): CommonIssueExplanation {
  const title = issue.issue || "";
  for (const entry of KB) {
    if (entry.match.test(title)) {
      return {
        whatIsIt: entry.whatIsIt,
        whyItMatters: entry.whyItMatters,
        seoImpact: entry.seoImpact,
        userImpact: entry.userImpact,
        recommendedFix: entry.recommendedFix,
        source: entry.source,
      };
    }
  }
  const category = issue.category || "this area";
  const severity = (issue.severity || "").toLowerCase();
  return {
    whatIsIt: `${title || "This check"} was flagged under ${category}.`,
    whyItMatters: severity
      ? `It's rated ${severity} severity, so it's worth understanding rather than skipping.`
      : "It affects how this page is evaluated as part of the overall audit.",
    seoImpact: `Issues in the ${category} category can affect how search engines crawl, index, or rank this page.`,
    userImpact: "May also affect how visitors experience or trust this page, depending on the specific issue.",
    recommendedFix: issue.recommendation || "Review the flagged item and address it based on the recommendation above.",
  };
}
