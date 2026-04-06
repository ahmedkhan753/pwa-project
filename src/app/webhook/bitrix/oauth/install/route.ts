/**
 * Next.js API Proxy — /api/webhook/bitrix/oauth/install
 * Proxies Bitrix24 OAuth app install callback to FastAPI backend.
 */
import { NextRequest, NextResponse } from 'next/server';

const BACKEND = process.env.BACKEND_URL || 'http://backend:8000';

export async function POST(req: NextRequest) {
  try {
    const contentType = req.headers.get('content-type') || '';
    let body: BodyInit;
    let headers: Record<string, string> = {};

    if (contentType.includes('application/json')) {
      body = await req.text();
      headers['Content-Type'] = 'application/json';
    } else {
      // Form data — forward as-is
      body = await req.text();
      headers['Content-Type'] = contentType;
    }

    const res = await fetch(`${BACKEND}/webhook/bitrix/oauth/install`, {
      method: 'POST',
      body,
      headers,
    });

    const responseBody = await res.text();
    return new NextResponse(responseBody, {
      status: res.status,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return NextResponse.json({ error: 'Backend unavailable', detail: String(err) }, { status: 503 });
  }
}
