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

// BACKEND_URL is a server-only env var — never baked into the client bundle.
// It must point to the Docker-internal hostname so the request bypasses Nginx
// (Nginx strips the /api prefix, causing FastAPI to receive /report/{id} → 404).
// Fallback: http://backend:8000 is the Docker Compose service name.
const BACKEND = process.env.BACKEND_URL || 'http://backend:8000';

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
