/**
 * Next.js API Proxy — /api/report/[dealId]
 *
 * Proxies the FastAPI backend /api/report/{dealId} endpoint.
 * The report page calls this relative URL so it works regardless of how
 * NEXT_PUBLIC_API_URL is configured: the server-side fetch always reaches
 * the backend container via the Docker-internal hostname, and the browser
 * calls the same Next.js origin (no CORS issues, no URL expiry).
 */
import { NextRequest, NextResponse } from 'next/server';

// In Docker, NEXT_PUBLIC_API_URL is http://backend:8000 (internal).
// In dev, it might be http://localhost:8000.
const BACKEND = process.env.NEXT_PUBLIC_API_URL || 'http://backend:8000';

export async function GET(
  _req: NextRequest,
  { params }: { params: { dealId: string } },
) {
  const { dealId } = params;

  try {
    const res = await fetch(`${BACKEND}/api/report/${dealId}`, {
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
