import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { idbDelete, idbGet, idbSet } from "./idbStore";

// Minimal in-memory fake of the tiny IndexedDB surface idbStore.ts actually
// uses (open/onupgradeneeded, one object store, get/put/delete via a
// readwrite/readonly transaction). No dependency added, just enough surface
// to exercise the real module's logic in a Node test environment.
function installFakeIndexedDb() {
  const store = new Map<string, unknown>();

  class FakeRequest {
    onsuccess: (() => void) | null = null;
    onerror: (() => void) | null = null;
    result: unknown;
    error: unknown;
  }

  class FakeTx {
    oncomplete: (() => void) | null = null;
    onerror: (() => void) | null = null;
    error: unknown;
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

describe("idbStore", () => {
  beforeEach(() => {
    installFakeIndexedDb();
  });

  afterEach(() => {
    delete (globalThis as { indexedDB?: unknown }).indexedDB;
  });

  it("returns null for a missing key", async () => {
    await expect(idbGet("missing")).resolves.toBeNull();
  });

  it("round-trips a value through set/get", async () => {
    await idbSet("k1", { hello: "world", n: 42 });
    await expect(idbGet("k1")).resolves.toEqual({ hello: "world", n: 42 });
  });

  it("overwrites an existing key", async () => {
    await idbSet("k2", { v: 1 });
    await idbSet("k2", { v: 2 });
    await expect(idbGet("k2")).resolves.toEqual({ v: 2 });
  });

  it("deletes a key", async () => {
    await idbSet("k3", { v: 1 });
    await idbDelete("k3");
    await expect(idbGet("k3")).resolves.toBeNull();
  });

  it("no-ops gracefully when indexedDB is unavailable", async () => {
    delete (globalThis as { indexedDB?: unknown }).indexedDB;
    await expect(idbGet("anything")).resolves.toBeNull();
    await expect(idbSet("anything", { x: 1 })).resolves.toBeUndefined();
  });
});
