/**
 * IndexedDB-backed cache for model files.
 *
 * Stores the raw binary blob so the model survives page refreshes
 * even after Meshy's signed URLs expire.
 */

const DB_NAME = "itera-model-cache";
const DB_VERSION = 1;
const STORE_NAME = "models";

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** Store a model blob under a key (e.g. "current-model"). */
export async function cacheModelBlob(key: string, blob: Blob): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(blob, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** Retrieve a cached model blob. Returns null if not found. */
export async function getCachedModelBlob(key: string): Promise<Blob | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const req = tx.objectStore(STORE_NAME).get(key);
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror = () => reject(req.error);
  });
}

/** Delete a cached model. */
export async function deleteCachedModel(key: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Fetch a model URL, cache the blob, and return a local blob URL.
 * If the fetch fails but a cached version exists, returns that instead.
 */
export async function fetchAndCacheModel(
  url: string,
  cacheKey: string = "current-model",
): Promise<string> {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
    const blob = await res.blob();
    await cacheModelBlob(cacheKey, blob);
    return URL.createObjectURL(blob);
  } catch (err) {
    // Fall back to cached version if available
    const cached = await getCachedModelBlob(cacheKey);
    if (cached) return URL.createObjectURL(cached);
    throw err;
  }
}

/** Restore a blob URL from cache. Returns null if nothing cached. */
export async function restoreModelFromCache(
  cacheKey: string = "current-model",
): Promise<string | null> {
  const blob = await getCachedModelBlob(cacheKey);
  if (!blob) return null;
  return URL.createObjectURL(blob);
}
