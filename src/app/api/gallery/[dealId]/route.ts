/**
 * Next.js API Proxy — /api/gallery/[dealId]
 *
 * Proxies the FastAPI backend /api/gallery/{dealId} endpoint.
 * Uses BACKEND_URL (server-only, Docker-internal) so the request bypasses
 * Nginx and reaches FastAPI directly — avoiding the /api prefix stripping issue.
 */
import { NextRequest, NextResponse } from 'next/server';

const BACKEND = process.env.BACKEND_URL || 'http://backend:8000';

export async function GET(
  _req: NextRequest,
  { params }: { params: { dealId: string } },
) {
  const { dealId } = params;

  try {
    const res = await fetch(`${BACKEND}/api/gallery/${dealId}`, {
      cache: 'no-store',
    });

    const body = await res.text();

    return new NextResponse(body, {
      status: res.status,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return NextResponse.json(
      { error: 'Backend unavailable', detail: String(err) },
      { status: 503 },
    );
  }
}
