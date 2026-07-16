# 🔍 SEO Technical Audit Dashboard

An enterprise-grade SEO auditing tool, inspired by SEMrush, Ahrefs, Ubersuggest, and SEO Meta in 1 Click. Built as a Next.js frontend with Python serverless functions on Vercel.

Merged from [venkataramana-d/seo-technical-audit-dashboard-main](https://github.com/venkataramana-d/seo-technical-audit-dashboard-main)
(base: Next.js UI + audit engine) with the site-health checks and Groq AI
summary from this project's standalone Streamlit SEO audit tool ported in as
`modules/technical_checks.py` and `modules/ai_assist.py`.

---

## Features

### Core Audit Checks
| Feature | Details |
|---|---|
| **Metadata Audit** | Title, description length, OG tags, OG image validation |
| **Heading Hierarchy** | H1–H6 count, missing H1, hierarchy violations |
| **Canonical** | Self-referencing, relative URL resolution, missing canonical |
| **Indexability** | Noindex, X-Robots-Tag, robots.txt signals |
| **URL Structure** | Length, HTTPS, underscores vs hyphens, slug quality |
| **Content Quality** | Word count, thin content, reading time, content-to-HTML ratio |
| **Image SEO** | Missing/empty/generic alt text, total image count |
| **Redirect Chain** | Redirect count, chain depth, redirect loop detection |

### Link Auditing
| Feature | Details |
|---|---|
| **Unified Link Table** | Internal + external links in one filterable, sortable, paginated view (type, follow, health, HTTP status, link category, DOM location) |
| **Link Types** | Page, PDF, download, image, plus a separate view for mailto/tel/anchor(#)/JavaScript links |
| **DOM Location** | Classifies each link as nav / header / footer / sidebar / breadcrumb / body content |
| **Body Content Preview** | Renders a page's actual intro/conclusion paragraphs with links highlighted in place |
| **Per-Link Issue Explanations** | What/why/root cause/SEO impact/user impact/recommended fix (with HTML example) for every broken, redirecting, weak-anchor, or security-gap link |
| **Priority Scoring** | Deterministic 0–100 score per issue (severity + internal/external + homepage proximity) |
| **Domain Categorization** | External domains grouped by type (social, news, academic, government, reference, tech) |
| **Duplicate Anchor Detection** | Same anchor text pointing to different destinations |
| **Security Attributes** | Missing noopener/noreferrer on any link opening a new tab |
| **Bulk Actions** | Select rows to export, copy URLs, or open; one "Download This View" button exports whatever the current filters show |

### Advanced Technical Checks (Inspired by SEMrush / Ahrefs)
| Feature | Details |
|---|---|
| **SERP Preview** | Live Google snippet mock with title/desc length warnings |
| **Social Card Preview** | Facebook/LinkedIn + Twitter/X card visual preview |
| **Schema / Structured Data** | JSON-LD type detection, parse error detection, raw JSON view |
| **Mobile-Friendliness** | Viewport meta tag check |
| **Charset** | Charset declaration validation |
| **Hreflang** | Tag detection, x-default check |
| **Twitter Cards** | All 4 required tags validated |
| **Favicon** | Presence check |
| **Duplicate Meta Detection** | Cross-URL duplicate titles, descriptions, H1s |

### Site Health (ported from the standalone Streamlit tool)
| Feature | Details |
|---|---|
| **Domain Age** | WHOIS creation date, registrar |
| **SSL Certificate** | Expiry date, days-left warning, verification errors |
| **DNS Health** | SPF / DMARC / MX record presence, shown as **informational only** (email-deliverability records, not SEO ranking signals: they do not affect the SEO score) |
| **robots.txt** | Crawl allow/disallow for `*` and Googlebot, crawl-delay |
| **sitemap.xml** | XML validity, URL count, duplicate detection |
| **Readability** | Flesch-Kincaid grade + reading ease (via textstat) |
| **Content Freshness** | Last-Modified header / `article:modified_time` age |
| **Canonical Loop Detection** | Multi-hop canonical chain / loop tracing |
| **www / non-www Redirect** | Host-consolidation consistency check |
| **HTTP/2 Support** | Protocol version detection via httpx |
| **AI Summary** | Optional Groq-powered plain-English health summary + prioritized fixes (bring your own free API key, or set `GROQ_API_KEY` server-side) |

### Page-Type Specific
| Feature | Details |
|---|---|
| **Course Page Audit** | 8 required sections, conversion elements, Course schema |
| **Blog Page Audit** | Author, date, category, readability, Article schema, OG tags |
| **Auto-Detection** | Automatically classifies course / blog / general pages |

### Scoring & Recommendations (Inspired by Ubersuggest / Ahrefs)
| Feature | Details |
|---|---|
| **SEO Health Score** | Weighted 0–100 score across 11 categories |
| **Impact Score** | Each issue rated 1–10 (ranking importance) |
| **Fix Difficulty** | Every issue is labelled Easy / Medium / Hard (from its Low/Medium/High effort). Shown as a badge per issue, a "Fix effort" column on the Results list, and an Easy/Medium/Hard rollup on the detail header, so you can triage by how much work each fix takes |
| **Top Issues by Impact** | Priority-ranked recommendations, fix high-impact first |
| **Thematic Grouping** | SEMrush-style: Crawlability / Metadata / Content / Links / Technical / Social & Schema |
| **Radar Chart** | Visual per-category score breakdown |
| **Top Failing Checks** | Text list on the Results page of the most common issues across all audited pages, with a severity-coloured accent and a page count |
| **Common Issues & Fixes** | Any issue matching a curated knowledge base (~20 of the most common SEO issues) gets a "Learn more →" expansion: what it is, why it matters, SEO impact, user impact, and the recommended fix, grounded in current guidance (Google Search Central, web.dev) |

### Export
Report export lives as an action bar on the **Results** page. CSV and JSON
are generated entirely in your browser (no upload, no size limit); Excel and
PDF are still generated server-side for colour-coding/formatting, with the
request trimmed to only the needed fields and gzip-compressed first, so
large result sets no longer 413.

| Format | Contents |
|---|---|
| **CSV** | Flat summary of all audited URLs |
| **Excel** | 3 sheets: Audit Summary + All Issues + Link Audit, colour-coded |
| **PDF** | Executive summary with colour-coded score table |
| **JSON** | Full raw audit data for every URL |

---

## Quick Start

### Local

```bash
git clone https://github.com/venkataramana-d/seo-technical-audit-dashboard-main.git
cd seo-technical-audit-dashboard-main
npm install
python -m venv .venv && source .venv/bin/activate  # or .venv\Scripts\activate on Windows
pip install -r requirements.txt
npm run dev
```

The frontend runs at `http://localhost:3000`. The `/api/*.py` functions only run
under Vercel's runtime (or `vercel dev`); plain `next dev` will 404 on API
calls, which is expected for local UI-only work.

### Deploy to Vercel

1. Push this repo to GitHub (already done for this project).
2. In the Vercel dashboard, import the repo as a project (or connect it to an
   existing empty project via Settings → Git → Connect Repository).
3. Add environment variables (both optional):
   - `PSI_API_KEY`: raises the PageSpeed Insights quota; the app works
     without it via the anonymous quota.
   - `GROQ_API_KEY`: enables the AI Summary feature by default; without it,
     users can still paste their own free key in Settings.
4. Deploy. Vercel auto-detects the Next.js frontend and the Python functions
   under `/api`.

---

## Project Structure

```
├── app/                     # Next.js App Router pages (frontend)
├── api/                     # Vercel Python serverless functions
│   ├── audit.py             # Runs a full audit for one URL
│   ├── pagespeed.py         # Live PageSpeed Insights fetch
│   ├── export.py            # CSV / Excel / PDF export
│   ├── ai-summary.py        # Groq AI plain-English audit summary
│   └── config-status.py     # Reports whether PSI_API_KEY / GROQ_API_KEY are set
├── modules/                 # Audit engine (reused by api/audit.py etc.)
│   ├── auditor.py           # Core URL audit engine
│   ├── advanced_checks.py   # SERP preview, schema, mobile, hreflang, social
│   ├── technical_checks.py  # Domain age, SSL, DNS/SPF/DMARC/MX, robots.txt, sitemap, readability, etc.
│   ├── ai_assist.py         # Groq AI summary (explain_audit)
│   ├── link_auditor.py      # Internal & external link analysis
│   ├── course_auditor.py    # Course-page checks
│   ├── blog_auditor.py      # Blog-page checks
│   ├── scoring.py           # SEO Health Score + thematic grouping
│   └── report_generator.py  # CSV / Excel / PDF export
├── lib/                     # Client-side state, aggregation, formatting
└── requirements.txt         # Python dependencies for /api
```

---

## SEO Score Breakdown

| Category | Weight | What it checks |
|---|---|---|
| Metadata | 16% | Title, description, OG tags |
| Content | 15% | Word count, thin content, ratio |
| Internal Links | 11% | Count, broken, anchor quality |
| Site Health | 10% | SSL, robots.txt, sitemap, HTTP/2, security headers (SPF/DMARC/MX are collected but informational only, they do not affect the score; domain age is informational context) |
| Advanced | 8% | Schema, mobile, social, hreflang |
| Headings | 8% | H1 presence, hierarchy |
| Images | 7% | Alt text coverage |
| Indexability | 6% | Noindex, robots |
| Canonical | 5% | Self-referencing canonical |
| Page-Specific | 5% | Course / Blog completeness |
| External Links | 4% | Security, dofollow quality |
| URL Structure | 5% | HTTPS, length, slug |

**Score labels:** Excellent (90–100) · Good (75–89) · Needs Attention (50–74) · Critical (<50)

---

## Tech Stack

| Library | Purpose |
|---|---|
| [Next.js](https://nextjs.org) | Frontend (App Router, TypeScript, Tailwind) |
| [Recharts](https://recharts.org) | Interactive charts |
| Vercel Python Functions | `/api` audit, PageSpeed, and export endpoints |
| [BeautifulSoup4](https://www.crummy.com/software/BeautifulSoup/) | HTML parsing |
| [lxml](https://lxml.de) | Fast XML/HTML parser |
| [Requests](https://requests.readthedocs.io) | HTTP crawling |
| [Pandas](https://pandas.pydata.org) | Data processing |
| [fpdf2](https://pyfpdf.github.io/fpdf2/) | PDF generation |
| [XlsxWriter](https://xlsxwriter.readthedocs.io) | Excel export |
| [textstat](https://github.com/textstat/textstat) | Readability scoring |
| [python-whois](https://github.com/richardpenman/whois) | Domain age lookup |
| [dnspython](https://www.dnspython.org) | SPF / DMARC / MX record lookup |
| [httpx](https://www.python-httpx.org) | HTTP/2 protocol detection |
| [Groq](https://groq.com) | AI Summary (llama-3.1-8b-instant, free tier) |

## Scope notes

This version covers single-URL audits with full detail views, link analysis,
performance/mobile/image checks, heading analysis, and CSV/Excel/PDF/JSON
export. Site-wide crawling and a multi-provider API-key vault are not
implemented; both would need a database and background job queue, which is
a real architecture change, not just more frontend work.

---

## License

MIT
