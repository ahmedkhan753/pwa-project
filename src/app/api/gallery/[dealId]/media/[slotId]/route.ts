/**
 * Next.js API Proxy — /api/gallery/[dealId]/media/[slotId]
 *
 * Streams a single inspection photo or video binary from the FastAPI backend.
 * Forwards HTTP Range headers so browsers can seek inside videos without
 * downloading the entire file first.
 */
import { NextRequest, NextResponse } from 'next/server';

const BACKEND = process.env.BACKEND_URL || 'http://backend:8000';

export async function GET(
  req: NextRequest,
  { params }: { params: { dealId: string; slotId: string } },
) {
  const { dealId, slotId } = params;

  // Forward Range header from browser (needed for video seeking)
  const upstreamHeaders: HeadersInit = {};
  const range = req.headers.get('range');
  if (range) upstreamHeaders['range'] = range;

  try {
    const res = await fetch(
      `${BACKEND}/api/gallery/${dealId}/media/${slotId}`,
      { headers: upstreamHeaders, cache: 'no-store' },
    );

    const body = await res.arrayBuffer();

    const responseHeaders: Record<string, string> = {
      'Content-Type':  res.headers.get('content-type')  || 'application/octet-stream',
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'public, max-age=86400, immutable',
    };

    const contentRange  = res.headers.get('content-range');
    const contentLength = res.headers.get('content-length');
    if (contentRange)  responseHeaders['Content-Range']  = contentRange;
    if (contentLength) responseHeaders['Content-Length'] = contentLength;

    return new NextResponse(body, {
      status:  res.status,
      headers: responseHeaders,
    });
  } catch (err) {
    return NextResponse.json(
      { error: 'Backend unavailable', detail: String(err) },
      { status: 503 },
    );
  }
}
