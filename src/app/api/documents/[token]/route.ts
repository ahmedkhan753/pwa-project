/**
 * Next.js API Proxy — /api/documents/[token]
 *
 * Proxies the FastAPI backend /api/documents/{token} endpoint that powers the
 * public customer documents page. Same pattern as the report/kosztorys
 * proxies: the page calls this relative URL so it works regardless of how
 * NEXT_PUBLIC_API_URL is configured (no CORS, same origin).
 */
import { NextRequest, NextResponse } from 'next/server';

// Server-only env var — never baked into the client bundle.
const BACKEND = process.env.BACKEND_URL || 'http://backend:8000';

export async function GET(
  _req: NextRequest,
  { params }: { params: { token: string } },
) {
  const { token } = params;

  try {
    // Backend router prefix is /documents (no /api) — matching the codebase
    // convention where nginx strips one /api. This proxy talks to the backend
    // container directly (no nginx), so it must use the real backend path.
    const res = await fetch(`${BACKEND}/documents/${token}`, {
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
