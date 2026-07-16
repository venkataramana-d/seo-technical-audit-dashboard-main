import { afterEach, describe, expect, it, vi } from "vitest";
import { domainHealthFor, fetchDomainHealth } from "./siteHealthCache";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("fetchDomainHealth", () => {
  it("calls /api/site-health once per unique host, not per URL", async () => {
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      const host = new URL(JSON.parse(init.body as string).url).host;
      return new Response(JSON.stringify({ domain_health: { host } }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const urls = [
      "https://a.com/1", "https://a.com/2", "https://a.com/3",
      "https://b.com/x", "https://b.com/y",
    ];
    const map = await fetchDomainHealth(urls);

    // Two unique hosts -> exactly two calls, not five.
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(map["a.com"]).toEqual({ host: "a.com" });
    expect(map["b.com"]).toEqual({ host: "b.com" });
  });

  it("maps a host to null when its fetch fails, without throwing", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("err", { status: 500 })));
    const map = await fetchDomainHealth(["https://c.com/1"]);
    expect(map["c.com"]).toBeNull();
  });

  it("swallows network rejections and maps to null", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("network down"); }));
    const map = await fetchDomainHealth(["https://d.com/1"]);
    expect(map["d.com"]).toBeNull();
  });
});

describe("domainHealthFor", () => {
  const map = { "a.com": { ok: true }, "b.com": null };

  it("returns the entry for a URL's host", () => {
    expect(domainHealthFor(map, "https://a.com/anything")).toEqual({ ok: true });
  });

  it("returns undefined for an unknown host or a null entry", () => {
    expect(domainHealthFor(map, "https://unknown.com/")).toBeUndefined();
    expect(domainHealthFor(map, "https://b.com/")).toBeUndefined();
    expect(domainHealthFor(undefined, "https://a.com/")).toBeUndefined();
  });
});
