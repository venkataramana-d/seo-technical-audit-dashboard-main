// Minimal raw IndexedDB key-value wrapper, no dependency added.
//
// Why: localStorage has a ~5-10MB per-origin quota and every write serializes
// the WHOLE state as one JSON string. A bulk audit of up to 200 URLs, each
// carrying a full audit_url() result (metadata, content, images, advanced
// checks, site_health, links, the 35-check checklist), easily exceeds that
// and throws QuotaExceededError. IndexedDB's quota is a percentage of free
// disk space (typically hundreds of MB to GB), so it comfortably holds this.

const DB_NAME = "seo-audit-db";
const DB_VERSION = 1;
const STORE_NAME = "kv";

// Cached connection: chunkedRunner.ts calls idbSet after every completed URL
// during a bulk crawl (potentially thousands of times per session), so
// opening a fresh IDBDatabase connection per call would leak connections
// (indexedDB.open() is never paired with a close()). Open once and reuse.
let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE_NAME)) {
        req.result.createObjectStore(STORE_NAME);
      }
    };
    req.onsuccess = () => {
      // If the connection drops (e.g. another tab triggers a version change
      // and this one closes), clear the cache so the next call reopens.
      req.result.onclose = () => {
        dbPromise = null;
      };
      resolve(req.result);
    };
    req.onerror = () => {
      dbPromise = null;
      reject(req.error);
    };
  });
  return dbPromise;
}

export async function idbGet<T>(key: string): Promise<T | null> {
  if (typeof indexedDB === "undefined") return null;
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const req = tx.objectStore(STORE_NAME).get(key);
    req.onsuccess = () => resolve((req.result as T) ?? null);
    req.onerror = () => reject(req.error);
  });
}

export async function idbSet(key: string, value: unknown): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function idbDelete(key: string): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
