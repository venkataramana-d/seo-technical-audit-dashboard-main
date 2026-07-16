"""Sitemap URL extraction for the sitewide Technical Audit.

`modules/technical_checks.py::check_sitemap` validates a sitemap and counts its
URLs but discards the list. This module is the reusable extractor: it fetches a
sitemap, recurses into sitemap-index files (nested sitemaps), handles gzip,
SSRF-validates every hop, dedupes, applies include/exclude regex filters, and
caps the result, returning the actual URL list for the client-side crawl
orchestrator to fan out over.

Design constraints (see PROJECT_LOG.md):
- Runs inside one Vercel `api/*.py` invocation (60s cap): sitemap fetching is
  fast (XML only, no per-page audits), so even a 2,461-URL sitemap is fine.
- Every fetched URL (root, nested sitemap, redirect target) is SSRF-checked via
  modules.auditor.validate_audit_url before the request is made.
"""

import gzip
import logging
import re
import xml.etree.ElementTree as ET
from urllib.parse import urlparse

import requests

from modules._http import bulk_url_cap
from modules.auditor import HEADERS, TIMEOUT, safe_get, validate_audit_url

logger = logging.getLogger(__name__)

_SM_NS = {"sm": "http://www.sitemaps.org/schemas/sitemap/0.9"}

# Google's published sitemap ceilings, used as hard safety bounds.
MAX_SITEMAP_URLS = 50_000
MAX_INDEX_DEPTH = 5          # how deep to recurse nested sitemap indexes
MAX_SITEMAPS_FETCHED = 200   # backstop against a pathological index fan-out
DEFAULT_URL_CAP = 50
# Sitemap resolution itself is just an XML fetch/parse, cheap even at a large
# size, but the resolved list is what a bulk audit then fans out over one
# invocation per URL (see modules/_http.py::bulk_url_cap for why this is
# capped at 200 in production).
MAX_URL_CAP = bulk_url_cap()


class SitemapError(Exception):
    """Raised when a sitemap cannot be fetched or parsed at all."""


def _fetch(url: str) -> bytes:
    """Fetch a sitemap URL, re-validating before the initial request and every
    redirect hop (`safe_get`), so an unvalidated host is never contacted at
    all, not just excluded from the returned content after the fact."""
    try:
        resp = safe_get(url, headers=HEADERS, timeout=TIMEOUT, verify=True)
    except (requests.RequestException, OSError) as exc:
        raise SitemapError(f"Fetch failed: {exc}") from exc

    if resp.status_code != 200:
        raise SitemapError(f"HTTP {resp.status_code}")

    content = resp.content
    # Gzipped sitemaps (.xml.gz): decompress. Detect by magic bytes or extension.
    if url.lower().endswith(".gz") or content[:2] == b"\x1f\x8b":
        try:
            content = gzip.decompress(content)
        except OSError:
            pass  # not actually gzipped: use raw bytes
    return content


def _parse_xml(content: bytes):
    """Parse sitemap XML, recovering from minor malformation via lxml, else regex."""
    try:
        return ET.fromstring(content), None
    except ET.ParseError:
        pass
    try:
        from lxml import etree as lxml_et

        parser = lxml_et.XMLParser(recover=True, resolve_entities=False, no_network=True)
        return lxml_et.fromstring(content, parser=parser), "lxml"
    except Exception:  # noqa: BLE001 (fall through to regex scrape)
        return None, "regex"


def _locs_from_regex(content: bytes) -> list[str]:
    text = content.decode("utf-8", errors="replace")
    return [m.strip() for m in re.findall(r"<loc>\s*(.*?)\s*</loc>", text, re.I | re.S)]


def _collect_locs(root, mode: str, content: bytes, tag: str) -> list[str]:
    """Extract <loc> text for a given tag ('url' leaves or 'sitemap' index entries)."""
    if mode == "regex" or root is None:
        # Regex can't distinguish urlset from index; caller handles both the same.
        return _locs_from_regex(content)
    locs = []
    # Namespaced first, then namespace-agnostic fallback (some sitemaps omit xmlns).
    for path in (f".//sm:{tag}/sm:loc", f".//{tag}/loc", ".//sm:loc", ".//loc"):
        try:
            found = root.findall(path, _SM_NS) if "sm:" in path else root.findall(path)
        except SyntaxError:
            found = []
        if found:
            locs = [el.text.strip() for el in found if el.text and el.text.strip()]
            break
    return locs


def _is_index(content: bytes, root, mode: str) -> bool:
    if root is not None and mode != "regex":
        return root.tag.split("}")[-1] == "sitemapindex"
    return b"<sitemapindex" in content.lower()


def extract_sitemap_urls(
    sitemap_url: str,
    limit: int = DEFAULT_URL_CAP,
    include_pattern: str | None = None,
    exclude_pattern: str | None = None,
) -> dict:
    """Resolve a sitemap (or sitemap index) to a deduped, filtered, capped URL list.

    Returns:
        {
          "sitemap_url": str,
          "urls": list[str],       # capped to `limit`
          "total_found": int,      # before the cap (after dedupe + filter)
          "capped": bool,
          "sitemaps_crawled": int,
          "is_index": bool,
        }
    """
    limit = max(1, min(int(limit or DEFAULT_URL_CAP), MAX_URL_CAP))
    inc = re.compile(include_pattern, re.I) if include_pattern else None
    exc = re.compile(exclude_pattern, re.I) if exclude_pattern else None

    seen_sitemaps: set[str] = set()
    all_urls: list[str] = []
    url_set: set[str] = set()
    sitemaps_crawled = 0
    root_is_index = False

    # BFS over sitemap indexes, bounded by depth and total sitemaps fetched.
    frontier = [(sitemap_url, 0)]
    while frontier:
        if len(all_urls) >= MAX_SITEMAP_URLS or sitemaps_crawled >= MAX_SITEMAPS_FETCHED:
            break
        current, depth = frontier.pop(0)
        if current in seen_sitemaps:
            continue
        seen_sitemaps.add(current)

        try:
            content = _fetch(current)
        except SitemapError as exc:
            if current == sitemap_url:
                raise  # the root sitemap must be reachable
            logger.warning("skipping nested sitemap %s: %s", current, exc)
            continue

        sitemaps_crawled += 1
        root, mode = _parse_xml(content)
        is_index = _is_index(content, root, mode)
        if current == sitemap_url:
            root_is_index = is_index

        if is_index and depth < MAX_INDEX_DEPTH:
            child_sitemaps = _collect_locs(root, mode, content, "sitemap")
            for child in child_sitemaps:
                if child and child not in seen_sitemaps:
                    frontier.append((child, depth + 1))
            # A regex-parsed index would also surface page <loc>s; guard against
            # double-adding by only treating recognised indexes as index-only.
            if mode != "regex":
                continue

        page_urls = _collect_locs(root, mode, content, "url")
        for u in page_urls:
            if not u or u in url_set:
                continue
            if not u.lower().startswith(("http://", "https://")):
                continue
            if inc and not inc.search(u):
                continue
            if exc and exc.search(u):
                continue
            url_set.add(u)
            all_urls.append(u)
            if len(all_urls) >= MAX_SITEMAP_URLS:
                break

    total_found = len(all_urls)
    capped_urls = all_urls[:limit]
    return {
        "sitemap_url": sitemap_url,
        "urls": capped_urls,
        "total_found": total_found,
        "capped": total_found > limit,
        "sitemaps_crawled": sitemaps_crawled,
        "is_index": root_is_index,
    }


def discover_sitemap_url(domain_or_url: str) -> str:
    """Best-effort: turn a bare domain/URL into its sitemap URL guess."""
    p = urlparse(domain_or_url if "://" in domain_or_url else f"https://{domain_or_url}")
    return f"{p.scheme or 'https'}://{p.netloc}/sitemap.xml"
