// Client-side URL-list parsing for the Technical Audit "CSV / Paste URLs" mode.
// Parsing happens entirely in the browser, no upload endpoint, no server
// storage, no CSV-formula-injection surface (per PROJECT_LOG.md).
//
// Accepts: pasted newline/comma/whitespace-separated URLs, CSV/TSV text with or
// without a header row. When a header row names a url/link column, that column
// is used; otherwise any cell that looks like an http(s) URL is scraped.

const URL_RE = /^https?:\/\/[^\s]+$/i;
const URL_HEADER_RE = /^(url|urls|link|links|address|page)$/i;

export interface ParsedUrlList {
  urls: string[];
  total: number; // count before de-dupe
  duplicates: number;
  skipped: number; // non-URL cells ignored
}

function splitCsvLine(line: string, delimiter: string): string[] {
  // Minimal CSV field splitter with double-quote support (handles quoted commas).
  const out: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === delimiter) {
      out.push(field);
      field = "";
    } else {
      field += ch;
    }
  }
  out.push(field);
  return out.map((f) => f.trim());
}

function detectDelimiter(sample: string): string {
  if (sample.includes("\t")) return "\t";
  if (sample.includes(",")) return ",";
  return ","; // default; single-column paste has no delimiter anyway
}

/** Normalize a candidate token into a URL, or null if it isn't one. */
function toUrl(token: string): string | null {
  const t = token.trim().replace(/^["']|["']$/g, "");
  if (!t) return null;
  if (URL_RE.test(t)) return t;
  return null;
}

export function parseUrlList(input: string): ParsedUrlList {
  const text = (input || "").trim();
  if (!text) return { urls: [], total: 0, duplicates: 0, skipped: 0 };

  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const delimiter = detectDelimiter(text);

  // Detect a header row with a url/link column.
  let urlColumnIndex = -1;
  const firstCells = splitCsvLine(lines[0], delimiter);
  const headerLooksLikeHeader = firstCells.some((c) => URL_HEADER_RE.test(c)) && !firstCells.some(toUrl);
  if (headerLooksLikeHeader) {
    urlColumnIndex = firstCells.findIndex((c) => URL_HEADER_RE.test(c));
  }

  const collected: string[] = [];
  let skipped = 0;
  const dataLines = headerLooksLikeHeader ? lines.slice(1) : lines;

  for (const line of dataLines) {
    // Also handle comma/space-separated single-line pastes.
    const cells =
      delimiter === "," && !line.includes(",") ? line.split(/\s+/) : splitCsvLine(line, delimiter);

    if (urlColumnIndex >= 0) {
      const u = toUrl(cells[urlColumnIndex] ?? "");
      if (u) collected.push(u);
      else skipped++;
      continue;
    }

    // No known column, scrape any http(s) cell on the line.
    let foundOnLine = false;
    for (const cell of cells) {
      const u = toUrl(cell);
      if (u) {
        collected.push(u);
        foundOnLine = true;
      }
    }
    if (!foundOnLine) skipped++;
  }

  const total = collected.length;
  const seen = new Set<string>();
  const urls: string[] = [];
  for (const u of collected) {
    if (seen.has(u)) continue;
    seen.add(u);
    urls.push(u);
  }

  return { urls, total, duplicates: total - urls.length, skipped };
}
