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
    const res = await fetch(`${BACKEND}/api/macadam/${dealId}`, {
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
