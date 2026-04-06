/**
 * Next.js API Proxy — /webhook/bitrix/oauth/callback
 * Proxies Bitrix24 OAuth callback to FastAPI backend.
 */
import { NextRequest, NextResponse } from 'next/server';

const BACKEND = process.env.BACKEND_URL || 'http://backend:8000';

export async function GET(req: NextRequest) {
  try {
    const queryString = req.nextUrl.search;
    const res = await fetch(`${BACKEND}/webhook/bitrix/oauth/callback${queryString}`, {
      cache: 'no-store',
    });

    const body = await res.text();
    return new NextResponse(body, {
      status: res.status,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return NextResponse.json({ error: 'Backend unavailable', detail: String(err) }, { status: 503 });
  }
}
