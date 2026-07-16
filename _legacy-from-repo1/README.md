# Legacy files from `seo-technical-audit-dashboard-main` (repo1)

This folder preserves files that existed **only** in
[venkataramana-d/seo-technical-audit-dashboard-main](https://github.com/venkataramana-d/seo-technical-audit-dashboard-main)
and were **not** carried into the merged/evolved version
[edstellarmarketing/seo-audit-dashboard](https://github.com/edstellarmarketing/seo-audit-dashboard),
which is the base of this merged project.

## Why they live here instead of in the app

The active project (from repo2) is the newer evolution and already states in its
own README that it was *"Merged from ...seo-technical-audit-dashboard-main"*.
During that evolution the following files were **refactored away or superseded**:

| Legacy file (repo1)            | Superseded in the merged app by                          |
| ------------------------------ | -------------------------------------------------------- |
| `api/audit.py`                 | `api/audit-pipeline.py` (+ `api/ai.py`) — consolidated   |
| `api/pagespeed.py`             | folded into the consolidated audit pipeline              |
| `api/config-status.py`         | `api/ai.py` config-status handling                       |
| `app/new-audit/page.tsx`       | `app/technical-audit/page.tsx`                           |
| `app/headings/page.tsx`        | `components/detail/HeadingsView.tsx` + `app/detail`      |
| `app/links/page.tsx`           | `components/detail/LinksView.tsx` + `app/detail`         |
| `app/performance/page.tsx`     | `components/detail/PerformanceView.tsx` + `app/detail`   |
| `app/export/page.tsx`          | `components/ExportBar.tsx` + `lib/reportExport.ts`       |
| `app/favicon.ico`              | `app/icon.tsx` (generated icon)                          |

They are kept for reference/history only. **Do not** wire them back into the
Next.js app router or `api/` as-is — they import from modules whose signatures
changed in the merged version and would break the build.
