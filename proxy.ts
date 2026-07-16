import { NextRequest, NextResponse } from "next/server";

// Nonce-based CSP (Next.js's documented pattern: 'strict-dynamic' + a
// per-request nonce), because App Router's streaming hydration relies on
// inline `<script>` tags (RSC flight data, our theme-init script in
// app/layout.tsx) that a plain `script-src 'self'` would block, breaking all
// client interactivity. 'strict-dynamic' lets those nonced scripts load the
// rest of Next.js's chunks without listing every chunk URL individually.
export function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  // React's dev-mode debugging (call-stack reconstruction) uses eval(), which
  // 'strict-dynamic' alone doesn't permit; only relax for it outside prod,
  // since React never calls eval() in a production build.
  const scriptSrc = process.env.NODE_ENV === "production"
    ? `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`
    : `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' 'unsafe-eval'`;
  const csp = [
    "default-src 'self'",
    scriptSrc,
    "style-src 'self' 'unsafe-inline'",
    // Social Preview renders a target site's own og:image, which can be hosted anywhere.
    "img-src 'self' data: https:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; ");

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  matcher: [
    // Skip static assets/images; apply to everything else (pages + API routes).
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
