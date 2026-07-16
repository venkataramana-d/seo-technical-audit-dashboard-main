// Phase 2: fetch each domain's site-health once before a bulk audit, so the
// per-URL /api/audit calls can reuse it instead of re-running WHOIS / DNS /
// SSL / robots / sitemap / www-redirect / HTTP/2 for every page on the same
// domain. On a 200-page same-domain crawl that turns ~1,600 redundant
// domain-level requests into 8.

const CONCURRENCY = 5;

export type DomainHealthMap = Record<string, unknown>;

function hostOf(url: string): string | null {
  try {
    return new URL(url).host.toLowerCase();
  } catch {
    return null;
  }
}

/**
 * Given the full list of URLs about to be audited, fetch domain-level
 * site-health once per unique host (bounded concurrency) and return a map of
 * host -> domain_health. A host whose fetch fails maps to `null`, and the
 * per-URL audit falls back to computing site-health itself.
 */
export async function fetchDomainHealth(
  urls: string[],
  signal?: AbortSignal,
): Promise<DomainHealthMap> {
  const hosts = Array.from(new Set(urls.map(hostOf).filter((h): h is string => !!h)));
  const firstUrlForHost = new Map<string, string>();
  for (const u of urls) {
    const h = hostOf(u);
    if (h && !firstUrlForHost.has(h)) firstUrlForHost.set(h, u);
  }

  const out: DomainHealthMap = {};
  let cursor = 0;

  async function worker() {
    while (cursor < hosts.length) {
      if (signal?.aborted) return;
      const host = hosts[cursor++];
      try {
        const res = await fetch("/api/audit-pipeline", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal,
          body: JSON.stringify({ action: "site-health", url: firstUrlForHost.get(host) }),
        });
        const data = await res.json();
        out[host] = res.ok ? data.domain_health ?? null : null;
      } catch {
        out[host] = null; // fall back to per-URL computation
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, hosts.length) }, worker));
  return out;
}

export function domainHealthFor(map: DomainHealthMap | undefined, url: string): unknown {
  if (!map) return undefined;
  const h = hostOf(url);
  return h ? map[h] ?? undefined : undefined;
}
