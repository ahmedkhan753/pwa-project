/**
 * Next.js API Proxy — /api/kosztorys-costs/[dealId]/pdf
 *
 * GET proxy used by the "Pobierz PDF" button on the public
 * /kosztorys/[dealId] report. Forwards bytes from the FastAPI
 * backend's /kosztorys-costs/{id}/pdf endpoint and preserves the
 * Content-Disposition header so the browser uses the right filename.
 *
 * In production nginx routes /api/* directly to the backend, so this
 * proxy is the dev / no-nginx fallback — same pattern as the sibling
 * /api/kosztorys-costs/[dealId] JSON proxy.
 */
import { NextRequest, NextResponse } from 'next/server';

const BACKEND = process.env.BACKEND_URL || 'http://backend:8000';

export async function GET(
  _req: NextRequest,
  { params }: { params: { dealId: string } },
) {
  const { dealId } = params;

  try {
    const res = await fetch(`${BACKEND}/kosztorys-costs/${dealId}/pdf`, {
      cache: 'no-store',
    });

    if (!res.ok) {
      const body = await res.text();
      return new NextResponse(body, {
        status: res.status,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const bytes = await res.arrayBuffer();
    const disposition =
      res.headers.get('content-disposition') ??
      `inline; filename="kosztorys_${dealId}.pdf"`;

    return new NextResponse(bytes, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': disposition,
        'Cache-Control': 'no-cache, must-revalidate',
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: 'Backend unavailable', detail: String(err) },
      { status: 503 },
    );
  }
}
