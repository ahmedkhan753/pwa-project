/**
 * Next.js API Proxy — /api/kosztorys/[dealId]
 *
 * Proxies the FastAPI backend /api/kosztorys/{dealId} endpoint, which
 * fetches the Eurotax PDF from Bitrix and returns parsed JSON.
 *
 * Mirrors the existing /api/report/[dealId] proxy: server-side fetch via
 * Docker-internal hostname, browser sees same-origin (no CORS / URL expiry).
 */
import { NextRequest, NextResponse } from 'next/server';

const BACKEND = process.env.BACKEND_URL || 'http://backend:8000';

export async function GET(
  _req: NextRequest,
  { params }: { params: { dealId: string } },
) {
  const { dealId } = params;

  try {
    const res = await fetch(`${BACKEND}/api/kosztorys/${dealId}`, {
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
