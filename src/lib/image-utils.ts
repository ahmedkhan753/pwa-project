/**
 * Compress an image File to JPEG before storing in Zustand.
 *
 * iOS Safari does NOT support canvas.toDataURL('image/webp') —
 * it silently falls back to PNG which can be 1-3 MB per photo.
 * We use JPEG (universally supported) with progressive fallbacks
 * to guarantee the output stays under TARGET_BYTES.
 *
 * Target: ≤150 KB per photo.  34 photos × 150 KB = 5.1 MB total —
 * safely under Safari's 5 MB localStorage limit.
 */

const TARGET_BYTES = 150 * 1024; // 150 KB base64

export async function compressImage(
    file: File,
    maxWidth = 1024,
    maxHeight = 1024,
    quality = 0.6
): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);

        reader.onload = (event) => {
            const img = new Image();
            img.src = event.target?.result as string;

            img.onload = () => {
                // Progressive attempts — each smaller/lower quality than the last
                const attempts = [
                    { maxW: maxWidth,  maxH: maxHeight,  q: quality },
                    { maxW: 800,       maxH: 800,        q: 0.55 },
                    { maxW: 640,       maxH: 640,        q: 0.45 },
                    { maxW: 480,       maxH: 480,        q: 0.40 },
                ];

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

                    if (dataUrl.length <= TARGET_BYTES || q === 0.40) {
                        resolve(dataUrl);
                        return;
                    }
                }

                resolve('');
            };

            img.onerror = reject;
        };

        reader.onerror = reject;
    });
}
