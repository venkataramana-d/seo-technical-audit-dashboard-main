import { describe, expect, it } from "vitest";
import { parseUrlList } from "./parseUrlList";

describe("parseUrlList", () => {
  it("returns empty result for blank input", () => {
    const r = parseUrlList("");
    expect(r).toEqual({ urls: [], total: 0, duplicates: 0, skipped: 0 });
  });

  it("parses newline-separated plain paste", () => {
    const r = parseUrlList("https://example.com/\nhttps://example.com/about");
    expect(r.urls).toEqual(["https://example.com/", "https://example.com/about"]);
    expect(r.total).toBe(2);
    expect(r.duplicates).toBe(0);
  });

  it("dedupes repeated URLs", () => {
    const r = parseUrlList("https://a.com/\nhttps://a.com/\nhttps://b.com/");
    expect(r.urls).toEqual(["https://a.com/", "https://b.com/"]);
    expect(r.total).toBe(3);
    expect(r.duplicates).toBe(1);
  });

  it("detects a url header column in CSV", () => {
    const csv = "url,notes\nhttps://a.com/,home\nhttps://b.com/x,about\nnot-a-url,skip";
    const r = parseUrlList(csv);
    expect(r.urls).toEqual(["https://a.com/", "https://b.com/x"]);
  });

  it("detects a 'link' header variant", () => {
    const csv = "link\nhttps://a.com/\nhttps://b.com/";
    const r = parseUrlList(csv);
    expect(r.urls).toEqual(["https://a.com/", "https://b.com/"]);
  });

  it("scrapes any http cell when there is no recognised header", () => {
    const csv = "name,site\nAcme,https://acme.com/\nBeta,https://beta.com/";
    const r = parseUrlList(csv);
    expect(r.urls).toEqual(["https://acme.com/", "https://beta.com/"]);
  });

  it("handles tab-separated (TSV) input", () => {
    const tsv = "url\thits\nhttps://a.com/\t120\nhttps://b.com/\t80";
    const r = parseUrlList(tsv);
    expect(r.urls).toEqual(["https://a.com/", "https://b.com/"]);
  });

  it("strips quotes around quoted CSV fields", () => {
    const csv = 'url,notes\n"https://a.com/","has, comma in notes"';
    const r = parseUrlList(csv);
    expect(r.urls).toEqual(["https://a.com/"]);
  });

  it("skips non-URL lines and counts them", () => {
    const r = parseUrlList("not a url\nalso not one\nhttps://real.com/");
    expect(r.urls).toEqual(["https://real.com/"]);
    expect(r.skipped).toBe(2);
  });

  it("rejects non-http(s) schemes", () => {
    const r = parseUrlList("ftp://example.com/file\njavascript:alert(1)\nhttps://ok.com/");
    expect(r.urls).toEqual(["https://ok.com/"]);
  });

  it("handles a single pasted URL with no delimiter", () => {
    const r = parseUrlList("https://solo.com/page");
    expect(r.urls).toEqual(["https://solo.com/page"]);
  });
});
