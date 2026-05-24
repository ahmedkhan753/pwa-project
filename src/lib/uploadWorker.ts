/**
 * Upload Worker
 * ─────────────
 * Singleton background loop that drains the IndexedDB photo queue into the
 * backend `/files/upload-json` endpoint.
 *
 * Properties:
 *   - Idempotent: backend overwrites existing rows by (deal_id, slot_id), so
 *     a duplicate retry is harmless.
 *   - Exponential backoff: failed attempts wait progressively longer before
 *     the next retry, but never give up — the worker will keep trying as
 *     long as the wizard is open.
 *   - Crash-safe: queue lives in IndexedDB, so a tab restart picks up exactly
 *     where the previous session left off.
 *   - Token aware: started with the auth token, stops cleanly on logout.
 */

import { photoQueue, type QueueItem, type QueueItemMeta } from './photoUploadQueue';

let running = false;
let token: string | null = null;
let apiUrl: string = '';
let loopId: ReturnType<typeof setTimeout> | null = null;

// Backoff (ms) keyed by attempt count. Index 0 = first try, no wait.
// Hard cap at 60s per attempt — better to keep retrying than to give up on a
// recoverable network/nginx issue.
const RETRY_DELAYS_MS = [0, 3_000, 6_000, 12_000, 24_000, 60_000];

// Max concurrent uploads in flight at once. 3 is the sweet spot:
//   - 1 (old) → 50 photos × ~3s each = 150s wait, inspector blocked
//   - 3 → ~3× faster without saturating mobile uplink or nginx workers
//   - 6+ → diminishing returns + iOS connection cap + risk of OOM on phone
const MAX_PARALLEL_UPLOADS = 3;

// Hard ceiling on retries per item. Without this, a permanently-failing photo
// (e.g. a corrupt blob, an oversized video that exceeds nginx body limit)
// would cycle forever between 'failed' and 'uploading' — burning battery,
// hammering the network, and (critically) keeping the WizardLayout submit
// gate locked indefinitely. After this many tries we declare the item dead;
// the UI surfaces it as "permanent failure" and the inspector can either
// re-take the photo (re-enqueue resets attempts to 0) or submit anyway.
// Total wait at MAX: 0+3+6+12+24+60+60+60 ≈ 225s before giving up.
export const MAX_UPLOAD_ATTEMPTS = 8;

/** Start (or update credentials of) the worker. Safe to call repeatedly. */
export function startUploadWorker(authToken: string, baseUrl: string): void {
  token = authToken;
  apiUrl = baseUrl || '';
  if (running) return;
  running = true;
  console.log('[uploadWorker] started');
  scheduleTick(500);
}

export function stopUploadWorker(): void {
  running = false;
  if (loopId) { clearTimeout(loopId); loopId = null; }
  console.log('[uploadWorker] stopped');
}

function scheduleTick(delay: number) {
  if (!running) return;
  if (loopId) clearTimeout(loopId);
  loopId = setTimeout(() => { void tick(); }, delay);
}

async function tick(): Promise<void> {
  if (!running) return;
  try {
    // Stress-test critical: walk metadata only — never load 150 × ~120 KB
    // base64 blobs into memory just to decide which items are eligible.
    const metas = await photoQueue.getAllPendingMeta();
    if (metas.length === 0) {
      scheduleTick(3_000);
      return;
    }

    // Pick items whose backoff window has elapsed AND that haven't blown
    // through the retry ceiling. Items past the ceiling stay marked 'failed'
    // forever (until the inspector re-takes the photo, which re-enqueues
    // with attempts reset to 0).
    const now = Date.now();
    const ready = metas.filter((it) => {
      if ((it.attempts || 0) >= MAX_UPLOAD_ATTEMPTS) return false;
      if (it.status === 'uploading') {
        // If a previous run died mid-upload, lastTriedAt is stale; allow
        // re-attempt after 30 s so we never permanently get stuck.
        return !it.lastTriedAt || (now - it.lastTriedAt) > 30_000;
      }
      const idx = Math.min(it.attempts || 0, RETRY_DELAYS_MS.length - 1);
      const wait = RETRY_DELAYS_MS[idx];
      const since = it.lastTriedAt ? now - it.lastTriedAt : Infinity;
      return since >= wait;
    });

    if (ready.length === 0) {
      scheduleTick(2_000);
      return;
    }

    // Split by kind: video uploads cap at 1 in flight (a 30 MB clip can
    // saturate a mobile uplink and starve the photo workers); photos
    // continue to use the existing parallelism.
    const videoQueue: QueueItemMeta[] = ready.filter((m) => m.kind === 'video');
    const photoQueueArr: QueueItemMeta[] = ready.filter((m) => m.kind !== 'video');

    const photoWorkers = Array.from(
      { length: Math.min(MAX_PARALLEL_UPLOADS, photoQueueArr.length) },
      async () => {
        while (running) {
          const meta = photoQueueArr.shift();
          if (!meta) return;
          const full = await photoQueue.getById(meta.id);
          if (!full) continue;  // already deleted (e.g. cleared by submit)
          await uploadOne(full);
        }
      },
    );

    const videoWorker = videoQueue.length > 0
      ? (async () => {
          while (running) {
            const meta = videoQueue.shift();
            if (!meta) return;
            const full = await photoQueue.getById(meta.id);
            if (!full) continue;
            await uploadOne(full);
          }
        })()
      : Promise.resolve();

    await Promise.all([videoWorker, ...photoWorkers]);
  } catch (err) {
    console.error('[uploadWorker] tick error:', err);
  } finally {
    scheduleTick(1_500);
  }
}

async function uploadOne(item: QueueItem): Promise<void> {
  if (!token || !apiUrl) return;
  if (item.kind === 'video') return uploadVideoOne(item);
  return uploadPhotoOne(item);
}

async function uploadPhotoOne(item: QueueItem): Promise<void> {
  if (!token || !apiUrl) return;
  await photoQueue.markUploading(item.id);

  const isVideo = item.base64.startsWith('data:video');
  const isImage = item.base64.startsWith('data:image');
  if (!isVideo && !isImage) {
    await photoQueue.markFailed(item.id, 'unrecognised media type');
    return;
  }

  const b64 = item.base64.split(',')[1] || '';
  if (!b64) {
    await photoQueue.markFailed(item.id, 'base64 split failed');
    return;
  }

  const sizeKB = Math.round((b64.length * 0.75) / 1024);
  const kind = isVideo ? 'VIDEO' : 'photo';
  console.log(`[uploadWorker] ▶ ${kind} ${item.slotId} deal=${item.dealId} ~${sizeKB}KB`);

  try {
    const res = await fetch(`${apiUrl}/files/upload-json`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        deal_id: Number(item.dealId),
        field_key: item.slotId,
        file_base64: b64,
        filename: item.filename,
      }),
    });

    if (res.ok) {
      await photoQueue.markUploaded(item.id);
      console.log(`[uploadWorker] ✅ ${item.slotId}`);
      return;
    }

    const body = await res.text().catch(() => '');
    const err = `HTTP ${res.status}: ${body.slice(0, 200)}`;
    console.warn(`[uploadWorker] ❌ ${item.slotId} — ${err}`);
    await photoQueue.markFailed(item.id, err);
  } catch (err: any) {
    const msg = err?.message || String(err);
    console.warn(`[uploadWorker] ❌ ${item.slotId} fetch failed: ${msg}`);
    await photoQueue.markFailed(item.id, `network: ${msg}`);
  }
}

// ── Video upload progress (per-item subscriber registry) ──────────────
// XHR upload progress events fire only on XMLHttpRequest, not fetch().
// VideoRecordSlot subscribes by item id to render its progress bar.
const videoProgressListeners = new Map<string, Set<(pct: number) => void>>();

function notifyVideoProgress(id: string, pct: number) {
  videoProgressListeners.get(id)?.forEach((fn) => {
    try { fn(pct); } catch { /* ignore */ }
  });
}

export function subscribeVideoProgress(
  id: string,
  fn: (pct: number) => void,
): () => void {
  let set = videoProgressListeners.get(id);
  if (!set) {
    set = new Set();
    videoProgressListeners.set(id, set);
  }
  set.add(fn);
  return () => {
    const s = videoProgressListeners.get(id);
    if (!s) return;
    s.delete(fn);
    if (s.size === 0) videoProgressListeners.delete(id);
  };
}

async function uploadVideoOne(item: QueueItem): Promise<void> {
  if (!token || !apiUrl) return;
  if (!item.bodyBlob) {
    await photoQueue.markFailed(item.id, 'video missing bodyBlob');
    return;
  }
  await photoQueue.markUploading(item.id);

  const sizeKB = Math.round(item.bodyBlob.size / 1024);
  console.log(`[uploadWorker] ▶ VIDEO ${item.slotId} deal=${item.dealId} ~${sizeKB}KB (chunked)`);

  // 1) Preferred path: chunked upload (resilient to flaky cellular — a
  //    dropped chunk is retried in-place instead of restarting the whole
  //    file). The outer queue's retry loop wraps this for crash recovery.
  try {
    await uploadVideoChunked(item);
    notifyVideoProgress(item.id, 100);
    await photoQueue.markUploaded(item.id);
    console.log(`[uploadWorker] ✅ VIDEO ${item.slotId} (chunked)`);
    return;
  } catch (chunkErr: any) {
    const cmsg = chunkErr?.message || String(chunkErr);
    console.warn(`[uploadWorker] chunked failed, falling back to whole-file: ${cmsg}`);
  }

  // 2) Fallback: existing whole-file multipart path — unchanged behavior.
  //    If chunked is unavailable (e.g. older backend) or every chunk-retry
  //    burned out, we still get exactly the same upload as before this change.
  try {
    await uploadVideoXHR(item);
    notifyVideoProgress(item.id, 100);
    await photoQueue.markUploaded(item.id);
    console.log(`[uploadWorker] ✅ VIDEO ${item.slotId} (whole-file fallback)`);
  } catch (err: any) {
    const msg = err?.message || String(err);
    console.warn(`[uploadWorker] ❌ VIDEO ${item.slotId}: ${msg}`);
    await photoQueue.markFailed(item.id, msg);
  }
}

// ── Chunked video upload (req 1) ─────────────────────────────────────
// 256 KB chunks. On flaky cellular, dropping a single chunk is far cheaper
// than restarting a 2 MB POST from byte zero. Retry + backoff lives at
// the chunk level here; the outer photoQueue retry loop still wraps the
// whole call for crash-recovery and app-close survival (req 4).
const CHUNK_SIZE = 256 * 1024;
const CHUNK_RETRY_DELAYS = [1000, 2000, 4000, 8000];  // req 2: per-chunk exp backoff

async function uploadVideoChunked(item: QueueItem): Promise<void> {
  const blob = item.bodyBlob!;
  const total = Math.max(1, Math.ceil(blob.size / CHUNK_SIZE));
  // Deterministic per upload session — the backend uses this to key its
  // chunk buffer. enqueuedAt is the persistent timestamp from when the
  // queue row was created, so retries of the same item reuse the same id.
  const uploadId = `${item.dealId}_${item.slotId}_${item.enqueuedAt}`;

  for (let i = 0; i < total; i++) {
    const start = i * CHUNK_SIZE;
    const end = Math.min(start + CHUNK_SIZE, blob.size);
    const chunkBlob = blob.slice(start, end);

    let ok = false;
    let lastErr = '';
    for (let attempt = 0; attempt <= CHUNK_RETRY_DELAYS.length; attempt++) {
      try {
        await sendChunk(item, uploadId, i, total, chunkBlob);
        ok = true;
        break;
      } catch (e: any) {
        lastErr = e?.message || String(e);
        if (attempt < CHUNK_RETRY_DELAYS.length) {
          await new Promise((r) => setTimeout(r, CHUNK_RETRY_DELAYS[attempt]));
        }
      }
    }
    if (!ok) throw new Error(`chunk ${i + 1}/${total} failed after retries: ${lastErr}`);

    // req 3: progress fires per chunk (existing VideoRecordSlot bar tracks this).
    notifyVideoProgress(item.id, Math.round(((i + 1) / total) * 100));
  }
}

function sendChunk(
  item: QueueItem,
  uploadId: string,
  index: number,
  total: number,
  chunkBlob: Blob,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${apiUrl}/api/files/upload-chunk`);
    xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`HTTP ${xhr.status}: ${(xhr.responseText || '').slice(0, 200)}`));
    };
    xhr.onerror = () => reject(new Error('network error'));
    xhr.ontimeout = () => reject(new Error('timeout'));

    const form = new FormData();
    form.append('deal_id', String(item.dealId));
    form.append('field_key', item.slotId);
    form.append('upload_id', uploadId);
    form.append('chunk_index', String(index));
    form.append('total_chunks', String(total));
    form.append('filename', item.filename);
    form.append('chunk', chunkBlob, item.filename);
    xhr.send(form);
  });
}

function uploadVideoXHR(item: QueueItem): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${apiUrl}/api/files/upload-binary`);
    xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    // Intentionally no Content-Type: the browser sets the multipart
    // boundary header automatically when we hand it FormData.

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && e.total > 0) {
        const pct = Math.min(100, Math.round((e.loaded / e.total) * 100));
        notifyVideoProgress(item.id, pct);
      }
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
      } else {
        reject(new Error(`HTTP ${xhr.status}: ${(xhr.responseText || '').slice(0, 200)}`));
      }
    };
    xhr.onerror = () => reject(new Error('network error'));
    xhr.onabort = () => reject(new Error('aborted'));
    xhr.ontimeout = () => reject(new Error('timeout'));

    const form = new FormData();
    form.append('deal_id', String(item.dealId));
    form.append('field_key', item.slotId);
    form.append('file', item.bodyBlob as Blob, item.filename);
    xhr.send(form);
  });
}
