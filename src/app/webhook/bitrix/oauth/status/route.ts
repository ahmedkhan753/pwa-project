/**
 * Next.js API Proxy — /webhook/bitrix/oauth/status
 * Returns current OAuth token status from backend.
 */
import { NextResponse } from 'next/server';

const BACKEND = process.env.BACKEND_URL || 'http://backend:8000';

export async function GET() {
  try {
    const res = await fetch(`${BACKEND}/webhook/bitrix/oauth/status`, {
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
