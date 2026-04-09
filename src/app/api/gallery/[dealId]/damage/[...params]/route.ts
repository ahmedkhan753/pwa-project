/**
 * Next.js API Proxy — /api/gallery/[dealId]/damage/[...params]
 *
 * Proxies damage photo requests to the FastAPI backend.
 * Params: source/dmgIdx/photoIdx  →  /api/gallery/{dealId}/damage/{source}/{dmgIdx}/{photoIdx}
 */
import { NextRequest, NextResponse } from 'next/server';

const BACKEND = process.env.BACKEND_URL || 'http://backend:8000';

export async function GET(
  _req: NextRequest,
  { params }: { params: { dealId: string; params: string[] } },
) {
  const { dealId, params: pathParts } = params;
  const path = pathParts.join('/');

  try {
    const res = await fetch(
      `${BACKEND}/api/gallery/${dealId}/damage/${path}`,
      { cache: 'no-store' },
    );

    if (!res.ok) {
      return new NextResponse(null, { status: res.status });
    }

    const body = await res.arrayBuffer();
    return new NextResponse(body, {
      status: 200,
      headers: {
        'Content-Type': res.headers.get('content-type') || 'image/jpeg',
        'Cache-Control': 'public, max-age=3600',
      },
    });
  } catch (err) {
    return new NextResponse(null, { status: 503 });
  }
}
