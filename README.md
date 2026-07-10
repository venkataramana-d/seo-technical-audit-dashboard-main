# 🔍 SEO Technical Audit Dashboard

An enterprise-grade SEO auditing tool — inspired by SEMrush, Ahrefs, Ubersuggest, and SEO Meta in 1 Click. Built as a Next.js frontend with Python serverless functions on Vercel.

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
| **Internal Links** | Total, unique, dofollow/nofollow, broken, redirect, weak anchor text |
| **External Links** | Domain count, dofollow/nofollow, sponsored, UGC, missing noopener |
| **Broken Link Detection** | HTTP status validation for every link |
| **Security Attributes** | noopener, noreferrer on external links |

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
| **Effort Level** | Low / Medium / High effort label per issue |
| **Top Issues by Impact** | Priority-ranked recommendations, fix high-impact first |
| **Thematic Grouping** | SEMrush-style: Crawlability / Metadata / Content / Links / Technical / Social & Schema |
| **Radar Chart** | Visual per-category score breakdown |

### Export
| Format | Contents |
|---|---|
| **CSV** | Flat summary of all audited URLs |
| **Excel** | 3 sheets: Audit Summary + All Issues + Link Audit, colour-coded |
| **PDF** | Executive summary with colour-coded score table |

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
under Vercel's runtime (or `vercel dev`) — plain `next dev` will 404 on API
calls, which is expected for local UI-only work.

### Deploy to Vercel

1. Push this repo to GitHub (already done for this project).
2. In the Vercel dashboard, import the repo as a project (or connect it to an
   existing empty project via Settings → Git → Connect Repository).
3. Add an environment variable `PSI_API_KEY` (optional — enables higher
   PageSpeed Insights quota; the app works without it via the anonymous quota).
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
│   └── config-status.py     # Reports whether PSI_API_KEY is set
├── modules/                 # Audit engine (reused by api/audit.py etc.)
│   ├── auditor.py           # Core URL audit engine
│   ├── advanced_checks.py   # SERP preview, schema, mobile, hreflang, social
│   ├── link_auditor.py      # Internal & external link analysis
│   ├── course_auditor.py    # Course-page checks
│   ├── blog_auditor.py      # Blog-page checks
│   ├── scoring.py           # SEO Health Score + thematic grouping
│   └── report_generator.py  # CSV / Excel / PDF export
├── lib/                     # Client-side state, aggregation, formatting
├── requirements.txt         # Python dependencies for /api
└── legacy-streamlit/        # Original Streamlit app, kept for reference
```

---

## SEO Score Breakdown

| Category | Weight | What it checks |
|---|---|---|
| Metadata | 18% | Title, description, OG tags |
| Content | 17% | Word count, thin content, ratio |
| Internal Links | 13% | Count, broken, anchor quality |
| Advanced | 9% | Schema, mobile, social, hreflang |
| Headings | 9% | H1 presence, hierarchy |
| Images | 8% | Alt text coverage |
| Indexability | 6% | Noindex, robots |
| Canonical | 5% | Self-referencing canonical |
| External Links | 5% | Security, dofollow quality |
| URL Structure | 5% | HTTPS, length, slug |
| Page-Specific | 5% | Course / Blog completeness |

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

## Scope notes

This version covers single-URL audits with full detail views, link analysis,
performance/mobile/image checks, heading analysis, and CSV/Excel/PDF export.
Bulk audits (CSV/sitemap upload) and the multi-provider API key vault from the
original Streamlit app are not carried over — see `legacy-streamlit/app.py` if
you need to reference that functionality.

---

## License

MIT
