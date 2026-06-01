/**
 * Next.js API Proxy — /api/macadam/[dealId]
 *
 * GET proxy used by the public Macadam render page at
 * /kosztorys/macadam/[dealId]. Same shape as the existing
 * /api/kosztorys proxy: server-side fetch via the Docker-internal
 * hostname, browser sees same-origin.
 *
 * Admin PUT calls hit the backend directly with a JWT bearer token
 * (see src/app/admin/macadam/[dealId]/page.tsx) and do NOT go
 * through this proxy.
 */
import { NextRequest, NextResponse } from 'next/server';

const BACKEND = process.env.BACKEND_URL || 'http://backend:8000';

export async function GET(
  _req: NextRequest,
  { params }: { params: { dealId: string } },
) {
  const { dealId } = params;

  try {
    // Backend router uses prefix /macadam (no /api), mirroring the
    // working Eurotax pattern (kosztorys.py prefix /kosztorys). In
    // production, nginx routes /api/* directly to the backend after
    // stripping /api — so the browser's relative /api/macadam/{id}
    // lands on /macadam/{id} at FastAPI. This Next.js proxy mirrors
    // that final shape for dev / non-nginx setups.
    const res = await fetch(`${BACKEND}/macadam/${dealId}`, {
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
