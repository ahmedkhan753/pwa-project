/**
 * Two-tier image compression for the inspection wizard.
 *
 * Why two tiers
 * -------------
 * The same captured photo serves two very different consumers:
 *
 *   1. Zustand → localStorage (preview)
 *      iOS Safari caps localStorage at ~5 MB per origin. With 28+ photo
 *      slots a per-photo budget of ~150 KB is the practical ceiling; any
 *      higher and the wizard's persistence step starts dropping data on
 *      iPhone. This is why the preview path stays small.
 *
 *   2. IndexedDB → backend upload queue (full)
 *      The upload pipeline (see lib/photoUploadQueue.ts + lib/uploadWorker.ts)
 *      stores photos in IndexedDB which has a much larger quota (50 MB-1 GB
 *      on iOS Safari, more on Android). Bitrix and the FastAPI
 *      `/files/upload-json` endpoint accept up to 50 MB per file. So the
 *      upload-bound copy can carry real detail.
 *
 * Pipeline
 * --------
 * `compressImage()` (single-output) is unchanged — kept for any caller
 * that doesn't need the HQ variant. `compressImagePair()` produces both
 * in sequence (never parallel — iOS WebKit can OOM if two large canvases
 * coexist). If the HQ pass fails for any reason, `full` falls back to the
 * preview so the inspection flow can never lose a photo over a memory
 * hiccup.
 *
 * iOS Safari notes
 * ----------------
 *   - JPEG only. canvas.toDataURL('image/webp') silently degrades to
 *     PNG on iOS Safari, blowing the size budget.
 *   - Long-edge cap of 2400 px on the HQ pass keeps the in-memory RGBA
 *     buffer at ~17 MB even for portrait shots — well inside the
 *     WKWebView budget that historically OOMs around 250 MB.
 */

const PREVIEW_MAX_DIM = 1024;
const PREVIEW_TARGET_BYTES = 150 * 1024;     // 150 KB base64

const FULL_MAX_DIM = 2400;                   // long edge — yields ≥2000×1500 from any 4:3 phone
const FULL_TARGET_BYTES = 1500 * 1024;       // 1.5 MB soft cap

type Attempt = { maxW: number; maxH: number; q: number };

const PREVIEW_ATTEMPTS: Attempt[] = [
    { maxW: PREVIEW_MAX_DIM, maxH: PREVIEW_MAX_DIM, q: 0.60 },
    { maxW: 800,             maxH: 800,             q: 0.55 },
    { maxW: 640,             maxH: 640,             q: 0.45 },
    { maxW: 480,             maxH: 480,             q: 0.40 },
];

const FULL_ATTEMPTS: Attempt[] = [
    { maxW: FULL_MAX_DIM, maxH: FULL_MAX_DIM, q: 0.85 },
    { maxW: FULL_MAX_DIM, maxH: FULL_MAX_DIM, q: 0.80 },
    { maxW: 2000,         maxH: 2000,         q: 0.80 },
    { maxW: 1600,         maxH: 1600,         q: 0.75 },
];

export async function compressImage(
    file: File,
    maxWidth = PREVIEW_MAX_DIM,
    maxHeight = PREVIEW_MAX_DIM,
    quality = 0.6
): Promise<string> {
    // Default args = current behaviour. Custom args still work for any
    // caller that wants a one-off custom budget.
    const attempts: Attempt[] =
        maxWidth === PREVIEW_MAX_DIM && maxHeight === PREVIEW_MAX_DIM && quality === 0.6
            ? PREVIEW_ATTEMPTS
            : [
                { maxW: maxWidth, maxH: maxHeight, q: quality },
                ...PREVIEW_ATTEMPTS.slice(1),
            ];
    return _compressTo(file, attempts, PREVIEW_TARGET_BYTES);
}

export async function compressImagePair(
    file: File
): Promise<{ preview: string; full: string }> {
    // Sequential — never parallel — so iOS WebKit doesn't double-allocate
    // a large RGBA canvas on memory-tight devices.
    const preview = await compressImage(file);

    let full = '';
    try {
        full = await _compressTo(file, FULL_ATTEMPTS, FULL_TARGET_BYTES);
    } catch {
        full = '';
    }
    if (!full) full = preview;  // never break the flow on a memory hiccup
    return { preview, full };
}

function _compressTo(
    file: File,
    attempts: Attempt[],
    targetBytes: number,
): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);

        reader.onload = (event) => {
            const img = new Image();
            img.src = event.target?.result as string;

            img.onload = () => {
                let last = '';
                for (const { maxW, maxH, q } of attempts) {
                    const ratio = Math.min(maxW / img.width, maxH / img.height, 1);
                    const w = Math.round(img.width  * ratio);
                    const h = Math.round(img.height * ratio);

                    const canvas = document.createElement('canvas');
                    canvas.width  = w;
                    canvas.height = h;
                    const ctx = canvas.getContext('2d');
                    if (!ctx) { resolve(''); return; }
                    ctx.drawImage(img, 0, 0, w, h);

                    // Always JPEG — WebP canvas encoding is NOT supported on iOS Safari
                    const dataUrl = canvas.toDataURL('image/jpeg', q);
                    last = dataUrl;

                    if (dataUrl.length <= targetBytes) {
                        resolve(dataUrl);
                        return;
                    }
                }
                // Loop exhausted — return the smallest attempt rather than nothing.
                resolve(last);
            };

            img.onerror = reject;
        };

        reader.onerror = reject;
    });
}
