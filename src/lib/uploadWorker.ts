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

import { photoQueue, type QueueItem } from './photoUploadQueue';

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
    const items = await photoQueue.getAllPending();
    if (items.length === 0) {
      scheduleTick(3_000);
      return;
    }

    // Pick items whose backoff window has elapsed AND that haven't blown
    // through the retry ceiling. Items past the ceiling stay marked 'failed'
    // forever (until the inspector re-takes the photo, which re-enqueues
    // with attempts reset to 0).
    const now = Date.now();
    const ready = items.filter((it) => {
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

    // Upload up to MAX_PARALLEL_UPLOADS at a time. Bounded promise pool: each
    // worker pulls the next ready item off a shared queue, so all in-flight
    // slots stay busy until the queue is drained. Order of completion doesn't
    // matter — backend dedupes by (deal_id, slot_id).
    const queue = [...ready];
    const workers = Array.from({ length: Math.min(MAX_PARALLEL_UPLOADS, queue.length) }, async () => {
      while (running) {
        const next = queue.shift();
        if (!next) return;
        await uploadOne(next);
      }
    });
    await Promise.all(workers);
  } catch (err) {
    console.error('[uploadWorker] tick error:', err);
  } finally {
    scheduleTick(1_500);
  }
}

async function uploadOne(item: QueueItem): Promise<void> {
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
