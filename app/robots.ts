import type { MetadataRoute } from "next";

// Internal tool, not meant for public search results (user confirmed no
// public indexing needed); this covers robots.txt itself, and
// layout.tsx's metadata.robots covers the per-page <meta name="robots">
// tag for crawlers that ignore robots.txt.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", disallow: "/" },
  };
}
