import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AuditResult } from "@/lib/types";

const runCrawlMock = vi.fn();
vi.mock("@/lib/crawl/orchestrator", () => ({
  runCrawl: (...args: unknown[]) => runCrawlMock(...args),
}));

// Same minimal in-memory IndexedDB fake as lib/state/idbStore.test.ts.
function installFakeIndexedDb() {
  const store = new Map<string, unknown>();
  class FakeRequest {
    onsuccess: (() => void) | null = null;
    onerror: (() => void) | null = null;
    result: unknown;
  }
  class FakeTx {
    oncomplete: (() => void) | null = null;
    objectStore() {
      return {
        get: (key: string) => {
          const req = new FakeRequest();
          req.result = store.has(key) ? store.get(key) : undefined;
          queueMicrotask(() => req.onsuccess?.());
          return req;
        },
        put: (value: unknown, key: string) => {
          store.set(key, value);
          queueMicrotask(() => this.oncomplete?.());
        },
        delete: (key: string) => {
          store.delete(key);
          queueMicrotask(() => this.oncomplete?.());
        },
      };
    }
  }
  class FakeDb {
    objectStoreNames = { contains: () => true };
    transaction() {
      return new FakeTx();
    }
  }
  (globalThis as { indexedDB?: unknown }).indexedDB = {
    open() {
      const req = new FakeRequest();
      req.result = new FakeDb();
      queueMicrotask(() => req.onsuccess?.());
      return req;
    },
  };
  return store;
}

function mockResult(url: string, failed = false): AuditResult {
  return {
    url,
    fetch_error: failed ? "boom" : null,
    status_code: failed ? 0 : 200,
    seo_score: failed ? 0 : 80,
  } as unknown as AuditResult;
}

describe("chunkedRunner", () => {
  beforeEach(() => {
    installFakeIndexedDb();
    runCrawlMock.mockReset();
  });

  afterEach(() => {
    delete (globalThis as { indexedDB?: unknown }).indexedDB;
  });

  it("splits into the right number of chunks and reports totals against the full list", async () => {
    const { runChunked, CHUNK_SIZE } = await import("./chunkedRunner");
    const urls = Array.from({ length: CHUNK_SIZE * 2 + 50 }, (_, i) => `https://example.com/${i}`);

    runCrawlMock.mockImplementation(async (chunkUrls: string[], _opts, cbs) => {
      for (const u of chunkUrls) cbs.onResult(mockResult(u));
    });

    const progressUpdates: { currentChunk: number; totalChunks: number; completed: number }[] = [];
    await runChunked(urls, urls, {}, "test job", {
      onProgress: (p) => progressUpdates.push({ currentChunk: p.currentChunk, totalChunks: p.totalChunks, completed: p.completed }),
    });

    expect(runCrawlMock).toHaveBeenCalledTimes(3); // 200 + 200 + 50
    expect(progressUpdates.at(-1)?.completed).toBe(urls.length);
    expect(progressUpdates.at(-1)?.totalChunks).toBe(3);
    expect(progressUpdates.at(-1)?.currentChunk).toBe(3);
  });

  it("clears the checkpoint on successful completion", async () => {
    const { runChunked, loadCheckpoint } = await import("./chunkedRunner");
    runCrawlMock.mockImplementation(async (chunkUrls: string[], _opts, cbs) => {
      for (const u of chunkUrls) cbs.onResult(mockResult(u));
    });

    await runChunked(["https://a.com/", "https://b.com/"], ["https://a.com/", "https://b.com/"], {}, "job");
    await expect(loadCheckpoint()).resolves.toBeNull();
  });

  it("leaves a resumable checkpoint when aborted mid-run", async () => {
    const { runChunked, loadCheckpoint } = await import("./chunkedRunner");
    const controller = new AbortController();

    runCrawlMock.mockImplementation(async (chunkUrls: string[], _opts, cbs) => {
      cbs.onResult(mockResult(chunkUrls[0]));
      controller.abort(); // abort partway through the first chunk
    });

    const urls = ["https://a.com/", "https://b.com/", "https://c.com/"];
    await runChunked(urls, urls, {}, "my job", { signal: controller.signal });

    const cp = await loadCheckpoint();
    expect(cp).not.toBeNull();
    expect(cp!.label).toBe("my job");
    expect(cp!.remaining).toEqual(["https://b.com/", "https://c.com/"]);
    expect(cp!.urls).toEqual(urls);
    expect(cp!.succeeded).toBe(1);
    expect(cp!.failed).toBe(0);
  });

  it("carries succeeded/failed counts across a resume instead of resetting to 0", async () => {
    const { runChunked } = await import("./chunkedRunner");
    const allUrls = ["https://a.com/", "https://b.com/", "https://c.com/"];
    const remaining = ["https://c.com/"]; // a (ok), b (failed) already done in a prior session

    runCrawlMock.mockImplementation(async (chunkUrls: string[], _opts, cbs) => {
      for (const u of chunkUrls) cbs.onResult(mockResult(u));
    });

    let last: { succeeded: number; failed: number; completed: number } | undefined;
    await runChunked(
      allUrls, remaining, {}, "resume with prior counts",
      { onProgress: (p) => (last = p) },
      { succeeded: 1, failed: 1, startedAt: "2026-01-01T00:00:00.000Z" },
    );

    // 1 prior success + this chunk's 1 success = 2; prior failure carries forward untouched.
    expect(last).toEqual(expect.objectContaining({ succeeded: 2, failed: 1, completed: 3 }));
  });

  it("resuming with a partial remaining list keeps totals against the full original list", async () => {
    const { runChunked } = await import("./chunkedRunner");
    const allUrls = ["https://a.com/", "https://b.com/", "https://c.com/", "https://d.com/"];
    const remaining = ["https://c.com/", "https://d.com/"]; // a, b already done in a prior session

    runCrawlMock.mockImplementation(async (chunkUrls: string[], _opts, cbs) => {
      for (const u of chunkUrls) cbs.onResult(mockResult(u));
    });

    const updates: number[] = [];
    await runChunked(allUrls, remaining, {}, "resume test", {
      onProgress: (p) => updates.push(p.completed),
    });

    expect(updates).toEqual([3, 4]); // starts counting from 2 already-done, not 0
  });

  it("marks failed results without stopping the run", async () => {
    const { runChunked } = await import("./chunkedRunner");
    const urls = ["https://ok.com/", "https://fail.com/"];
    runCrawlMock.mockImplementation(async (chunkUrls: string[], _opts, cbs) => {
      for (const u of chunkUrls) cbs.onResult(mockResult(u, u.includes("fail")));
    });

    let last: { succeeded: number; failed: number } | undefined;
    await runChunked(urls, urls, {}, "job", { onProgress: (p) => (last = p) });
    expect(last).toEqual(expect.objectContaining({ succeeded: 1, failed: 1 }));
  });
});
