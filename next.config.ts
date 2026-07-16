import type { NextConfig } from "next";

// Content-Security-Policy is set per-request in proxy.ts instead (it
// needs a fresh nonce per request for Next.js's inline hydration scripts).
const SECURITY_HEADERS = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  // Baked into the client bundle at build time. Vercel sets VERCEL=1 for
  // every build it runs (production AND preview); a local `next build`/
  // `next dev` won't have it set. Backs the bulk-audit URL-limit inputs in
  // app/technical-audit/page.tsx — see modules/_http.py::bulk_url_cap for
  // the matching backend-side cap and why 200/5000.
  env: {
    NEXT_PUBLIC_BULK_URL_LIMIT: process.env.VERCEL ? "200" : "5000",
  },
  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },
};

export default nextConfig;
