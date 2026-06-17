export interface BlobMeta {
  kind: "tile" | "panorama";
  expId: string;
  key: string; // tileId for tile, "panorama" for panorama
  size: number;
}

const DB_NAME = "mic_store_v1";
const DB_VERSION = 1;
const STORE = "blobs";

type Resolver = { resolve: (db: IDBDatabase) => void; reject: (e: Error) => void };

let dbPromise: Promise<IDBDatabase> | null = null;
function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: "id" });
        store.createIndex("expId", "expId", { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IDB open failed"));
    req.onblocked = () => reject(new Error("IDB blocked"));
  });
  return dbPromise;
}

function idOf(expId: string, kind: BlobMeta["kind"], key: string) {
  return `${expId}::${kind}::${key}`;
}

function tx<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore, resolve: (v: T) => void, reject: (e: Error) => void) => void
): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(STORE, mode);
        t.oncomplete = () => {
          // no-op: resolve handled by fn
        };
        t.onerror = () => reject(t.error ?? new Error("tx error"));
        t.onabort = () => reject(t.error ?? new Error("tx abort"));
        const store = t.objectStore(STORE);
        fn(store, resolve, reject);
      })
  );
}

export async function putBlob(
  expId: string,
  kind: BlobMeta["kind"],
  key: string,
  payload: string
): Promise<{ size: number }> {
  const id = idOf(expId, kind, key);
  const bytes = sizeOfDataUrl(payload);
  return tx("readwrite", (store, resolve) => {
    const req = store.put({
      id,
      expId,
      kind,
      key,
      dataUrl: payload,
      size: bytes,
      savedAt: Date.now(),
    });
    req.onsuccess = () => resolve({ size: bytes });
  });
}

export async function getBlob(
  expId: string,
  kind: BlobMeta["kind"],
  key: string
): Promise<string | null> {
  const id = idOf(expId, kind, key);
  return tx<string | null>("readonly", (store, resolve) => {
    const req = store.get(id);
    req.onsuccess = () => resolve(req.result ? req.result.dataUrl : null);
  });
}

export async function listBlobsByExp(expId: string): Promise<Array<{ kind: BlobMeta["kind"]; key: string; size: number }>> {
  return tx("readonly", (store, resolve) => {
    const idx = store.index("expId");
    const req = idx.getAll(IDBKeyRange.only(expId));
    req.onsuccess = () =>
      resolve(
        (req.result ?? []).map((r: { kind: BlobMeta["kind"]; key: string; size: number }) => ({
          kind: r.kind,
          key: r.key,
          size: r.size,
        }))
      );
  });
}

export async function deleteBlob(expId: string, kind: BlobMeta["kind"], key: string): Promise<void> {
  const id = idOf(expId, kind, key);
  return tx<void>("readwrite", (store, resolve) => {
    const req = store.delete(id);
    req.onsuccess = () => resolve();
  });
}

export async function deleteBlobsByExp(expId: string): Promise<void> {
  return tx<void>("readwrite", (store, resolve) => {
    const idx = store.index("expId");
    const range = IDBKeyRange.only(expId);
    const cursorReq = idx.openKeyCursor(range);
    const deletions: Promise<void>[] = [];
    cursorReq.onsuccess = () => {
      const cursor = cursorReq.result;
      if (cursor) {
        const key = cursor.primaryKey;
        deletions.push(
          new Promise<void>((r) => {
            const r2 = store.delete(key);
            r2.onsuccess = () => r();
          })
        );
        cursor.continue();
      } else {
        Promise.all(deletions).then(() => resolve());
      }
    };
  });
}

export async function totalBlobSize(): Promise<number> {
  return tx<number>("readonly", (store, resolve) => {
    const req = store.openCursor();
    let total = 0;
    req.onsuccess = () => {
      const cur = req.result;
      if (cur) {
        total += (cur.value as { size: number }).size || 0;
        cur.continue();
      } else {
        resolve(total);
      }
    };
  });
}

export async function estimateUsage(): Promise<{ quota: number; usage: number; usageInBytes: number }> {
  try {
    if ("storage" in navigator && "estimate" in (navigator as any).storage) {
      const est = await (navigator as any).storage.estimate();
      const usage = Number(est.usage ?? 0);
      const quota = Number(est.quota ?? 0);
      return {
        usageInBytes: usage,
        usage,
        quota: quota || 500 * 1024 * 1024,
      };
    }
  } catch {
    // ignore
  }
  return { quota: 500 * 1024 * 1024, usage: 0, usageInBytes: 0 };
}

export function sizeOfDataUrl(dataUrl: string): number {
  if (!dataUrl) return 0;
  const comma = dataUrl.indexOf(",");
  const payload = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
  let size = payload.length;
  if (dataUrl.startsWith("data:")) {
    const header = dataUrl.slice(0, Math.min(comma, 64));
    if (header.includes(";base64")) {
      size = Math.floor((payload.length * 3) / 4);
      if (payload.endsWith("==")) size -= 2;
      else if (payload.endsWith("=")) size -= 1;
    }
  }
  return size;
}

export function formatSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let i = 0;
  let v = bytes;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

// re-open resolver on version change
openDb().then((db) => {
  db.onversionchange = () => {
    db.close();
    dbPromise = null;
  };
});

export { STORE as _STORE, idOf as _idOf };
