/**
 * Next.js API Proxy — /api/kosztorys/parse-test
 *
 * Forwards an uploaded Eurotax PDF to the backend dev endpoint
 * POST /api/kosztorys/parse-test for end-to-end testing while the
 * Bitrix field ID + auth path are still being wired in.
 */
import { NextRequest, NextResponse } from 'next/server';

const BACKEND = process.env.BACKEND_URL || 'http://backend:8000';

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const res = await fetch(`${BACKEND}/api/kosztorys/parse-test`, {
      method: 'POST',
      body: formData,
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
