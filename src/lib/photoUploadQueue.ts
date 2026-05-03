/**
 * IndexedDB-backed photo upload queue.
 * ─────────────────────────────────────
 * Survives:
 *   - Page reload (user navigation, hard refresh)
 *   - iOS WebKit DOM crash (the tab restart that wipes Zustand state)
 *   - Network outage / backend cold start
 *   - User closing the tab and reopening hours later
 *
 * Why IndexedDB and not localStorage:
 *   - localStorage caps at ~5 MB on iOS Safari and store's `partialize`
 *     intentionally strips photo base64 to stay under that cap.
 *   - IndexedDB has a much larger quota (50 MB-1 GB depending on storage
 *     pressure), enough to safely buffer the 28 photos + 6-second engine
 *     video while uploads are in flight.
 *
 * Lifecycle of a queued item:
 *   enqueue (status='pending')
 *     → worker picks it up
 *     → markUploading (status='uploading')
 *     → POST /files/upload-json
 *     → markUploaded → row deleted (queue stays small)
 *     OR markFailed (status='failed') → retried with exponential backoff
 *
 * The worker is a separate module (`uploadWorker.ts`) so this file stays
 * pure storage primitives.
 */

export interface QueueItem {
  id: string;            // `${dealId}__${slotId}`
  dealId: string;
  slotId: string;
  /** Photo path: full data:image/...;base64,... string. Empty for videos. */
  base64: string;
  /** Video path: raw Blob bytes — avoids the ~33% base64-over-JSON bloat
   *  that previously OOM'd iOS Safari on a 30 MB clip. Photos leave this
   *  undefined and continue using `base64`. */
  bodyBlob?: Blob;
  /** Routes the upload to the right endpoint:
   *    'photo' (default) → POST JSON to /files/upload-json
   *    'video'           → POST FormData to /api/files/upload-binary */
  kind?: 'photo' | 'video';
  filename: string;
  status: 'pending' | 'uploading' | 'uploaded' | 'failed';
  attempts: number;
  lastError?: string;
  enqueuedAt: number;
  lastTriedAt?: number;
}

/** Lightweight projection — everything but the base64/Blob bytes. */
export interface QueueItemMeta {
  id: string;
  dealId: string;
  slotId: string;
  status: QueueItem['status'];
  attempts: number;
  enqueuedAt: number;
  lastTriedAt?: number;
  /** Routing/category — derived from `kind` field, falling back to
   *  base64-prefix sniff for queue rows written before the field existed. */
  kind: 'photo' | 'video';
  /** Legacy alias — true iff kind==='video'. Kept so existing call sites
   *  that filter by `isVideoData` continue to compile unchanged. */
  isVideoData: boolean;
}

const DB_NAME = 'inspection-uploads';
const DB_VERSION = 1;
const STORE = 'queue';

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB not available'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'id' });
        store.createIndex('byDeal', 'dealId');
        store.createIndex('byStatus', 'status');
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('IndexedDB blocked'));
  });
  return dbPromise.catch((err) => {
    dbPromise = null; // allow retry next call
    throw err;
  });
}

function reqToPromise<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

async function withStore<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => Promise<T>
): Promise<T> {
  const db = await openDb();
  const t = db.transaction(STORE, mode);
  const store = t.objectStore(STORE);
  const result = await fn(store);
  return new Promise<T>((resolve, reject) => {
    t.oncomplete = () => resolve(result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

// ── Subscribers (UI re-render hooks) ─────────────────────────────────
const listeners = new Set<() => void>();
function notify() {
  listeners.forEach((fn) => {
    try { fn(); } catch { /* ignore */ }
  });
}

// ── Public API ───────────────────────────────────────────────────────

export const photoQueue = {
  /**
   * Add (or overwrite — same id) a photo for upload.
   * Always resets status to 'pending' and attempts to 0 so a re-enqueue
   * (e.g. user re-takes a photo) gets a fresh upload cycle.
   */
  async enqueue(
    item: {
      id: string;
      dealId: string;
      slotId: string;
      filename: string;
      /** Photo upload path. */
      base64?: string;
      /** Video upload path — raw bytes, no base64 inflation. */
      bodyBlob?: Blob;
      /** Defaults to 'photo' so existing photo callers don't need to
       *  pass it explicitly. */
      kind?: 'photo' | 'video';
    }
  ): Promise<void> {
    try {
      const kind: 'photo' | 'video' = item.kind ?? 'photo';
      const full: QueueItem = {
        id: item.id,
        dealId: item.dealId,
        slotId: item.slotId,
        filename: item.filename,
        base64: item.base64 ?? '',
        bodyBlob: item.bodyBlob,
        kind,
        status: 'pending',
        attempts: 0,
        enqueuedAt: Date.now(),
      };
      await withStore('readwrite', async (store) => {
        store.put(full);
      });
      notify();
    } catch (err) {
      console.error('[photoQueue] enqueue failed:', err);
      throw err;
    }
  },

  async markUploading(id: string): Promise<void> {
    try {
      await withStore('readwrite', async (store) => {
        const item = (await reqToPromise(store.get(id))) as QueueItem | undefined;
        if (!item) return;
        item.status = 'uploading';
        item.lastTriedAt = Date.now();
        store.put(item);
      });
      notify();
    } catch (err) {
      console.warn('[photoQueue] markUploading:', err);
    }
  },

  async markUploaded(id: string): Promise<void> {
    try {
      await withStore('readwrite', async (store) => {
        store.delete(id);
      });
      notify();
    } catch (err) {
      console.warn('[photoQueue] markUploaded:', err);
    }
  },

  async markFailed(id: string, error: string): Promise<void> {
    try {
      await withStore('readwrite', async (store) => {
        const item = (await reqToPromise(store.get(id))) as QueueItem | undefined;
        if (!item) return;
        item.status = 'failed';
        item.attempts = (item.attempts || 0) + 1;
        item.lastError = error.slice(0, 500);
        item.lastTriedAt = Date.now();
        store.put(item);
      });
      notify();
    } catch (err) {
      console.warn('[photoQueue] markFailed:', err);
    }
  },

  async getAllPending(): Promise<QueueItem[]> {
    try {
      return await withStore('readonly', async (store) => {
        const all = (await reqToPromise(store.getAll())) as QueueItem[];
        return (all || []).filter((i) => i.status !== 'uploaded');
      });
    } catch (err) {
      console.warn('[photoQueue] getAllPending:', err);
      return [];
    }
  },

  /**
   * Lightweight metadata-only listing (no base64). Stress-test critical:
   * with 150 queued photos at ~120KB each, calling getAllPending() loads
   * ~18 MB of base64 into JS memory on every tick / poll. iOS WebKit's
   * ~250 MB document budget evaporates quickly under that pressure.
   * This walks via cursor and projects only the lightweight fields, so
   * peak memory is one item at a time during the cursor scan.
   */
  async getAllPendingMeta(): Promise<QueueItemMeta[]> {
    try {
      return await withStore('readonly', async (store) => {
        return new Promise<QueueItemMeta[]>((resolve, reject) => {
          const out: QueueItemMeta[] = [];
          const req = store.openCursor();
          req.onsuccess = () => {
            const cur = req.result;
            if (!cur) { resolve(out); return; }
            const v = cur.value as QueueItem;
            if (v && v.status !== 'uploaded') {
              const isVideo =
                v.kind === 'video' ||
                !!(v.base64 && v.base64.startsWith('data:video'));
              out.push({
                id: v.id,
                dealId: v.dealId,
                slotId: v.slotId,
                status: v.status,
                attempts: v.attempts || 0,
                lastTriedAt: v.lastTriedAt,
                enqueuedAt: v.enqueuedAt,
                kind: isVideo ? 'video' : 'photo',
                isVideoData: isVideo,
              });
            }
            cur.continue();
          };
          req.onerror = () => reject(req.error);
        });
      });
    } catch (err) {
      console.warn('[photoQueue] getAllPendingMeta:', err);
      return [];
    }
  },

  async getByDeal(dealId: string): Promise<QueueItem[]> {
    if (!dealId) return [];
    try {
      return await withStore('readonly', async (store) => {
        const all = (await reqToPromise(store.getAll())) as QueueItem[];
        return (all || []).filter((i) => i.dealId === dealId);
      });
    } catch (err) {
      console.warn('[photoQueue] getByDeal:', err);
      return [];
    }
  },

  /**
   * Lite version of getByDeal — same memory rationale as getAllPendingMeta.
   * Use this from any UI subscriber/poller that only needs counts and
   * statuses for the submit gate, banner, etc.
   */
  async getMetaByDeal(dealId: string): Promise<QueueItemMeta[]> {
    if (!dealId) return [];
    try {
      return await withStore('readonly', async (store) => {
        return new Promise<QueueItemMeta[]>((resolve, reject) => {
          const out: QueueItemMeta[] = [];
          const idx = store.index('byDeal');
          const req = idx.openCursor(IDBKeyRange.only(dealId));
          req.onsuccess = () => {
            const cur = req.result;
            if (!cur) { resolve(out); return; }
            const v = cur.value as QueueItem;
            if (v) {
              const isVideo =
                v.kind === 'video' ||
                !!(v.base64 && v.base64.startsWith('data:video'));
              out.push({
                id: v.id,
                dealId: v.dealId,
                slotId: v.slotId,
                status: v.status,
                attempts: v.attempts || 0,
                lastTriedAt: v.lastTriedAt,
                enqueuedAt: v.enqueuedAt,
                kind: isVideo ? 'video' : 'photo',
                isVideoData: isVideo,
              });
            }
            cur.continue();
          };
          req.onerror = () => reject(req.error);
        });
      });
    } catch (err) {
      console.warn('[photoQueue] getMetaByDeal:', err);
      return [];
    }
  },

  /**
   * Fetch a single full item (with base64) by id. Used by uploadWorker
   * to lazy-load the actual bytes only at the moment of upload, so we
   * never have more than (concurrency × one item) of base64 in memory.
   */
  async getById(id: string): Promise<QueueItem | null> {
    try {
      return await withStore('readonly', async (store) => {
        const v = (await reqToPromise(store.get(id))) as QueueItem | undefined;
        return v || null;
      });
    } catch (err) {
      console.warn('[photoQueue] getById:', err);
      return null;
    }
  },

  /**
   * Drop everything for a deal — call this after a successful submit so the
   * queue does not hold stale base64 forever. Uses the byDeal index +
   * cursor so we only walk this deal's rows and never load the base64
   * blobs into JS memory at all (delete works directly off the cursor's
   * primary key).
   */
  async clearDeal(dealId: string): Promise<void> {
    if (!dealId) return;
    try {
      await withStore('readwrite', async (store) => {
        return new Promise<void>((resolve, reject) => {
          const idx = store.index('byDeal');
          const req = idx.openCursor(IDBKeyRange.only(dealId));
          req.onsuccess = () => {
            const cur = req.result;
            if (!cur) { resolve(); return; }
            cur.delete();
            cur.continue();
          };
          req.onerror = () => reject(req.error);
        });
      });
      notify();
    } catch (err) {
      console.warn('[photoQueue] clearDeal:', err);
    }
  },

  /** UI re-render subscription. Returns an unsubscribe function. */
  subscribe(fn: () => void): () => void {
    listeners.add(fn);
    return () => { listeners.delete(fn); };
  },
};
