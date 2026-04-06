/**
 * Next.js API Proxy — /api/report/[dealId]/document/[docType]
 *
 * Proxies PDF document downloads from the FastAPI backend.
 * The backend fetches the file from Bitrix24 server-side, so the
 * client never needs Bitrix authentication.
 *
 * docType: 'cepik' | 'damage_history'
 */
import { NextRequest, NextResponse } from 'next/server';

const BACKEND = process.env.BACKEND_URL || 'http://backend:8000';

export async function GET(
  _req: NextRequest,
  { params }: { params: { dealId: string; docType: string } },
) {
  const { dealId, docType } = params;

  // Only allow known document types
  if (!['cepik', 'damage_history'].includes(docType)) {
    return NextResponse.json({ error: 'Unknown document type' }, { status: 404 });
  }

  try {
    const res = await fetch(`${BACKEND}/report/${dealId}/document/${docType}`, {
      cache: 'no-store',
    });

    if (!res.ok) {
      const errText = await res.text();
      return new NextResponse(errText, {
        status: res.status,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Stream the PDF back to the client
    const contentType = res.headers.get('content-type') || 'application/pdf';
    const contentDisposition = res.headers.get('content-disposition') || '';
    const body = await res.arrayBuffer();

    return new NextResponse(body, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        ...(contentDisposition && { 'Content-Disposition': contentDisposition }),
        'Cache-Control': 'public, max-age=3600',
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: 'Backend unavailable', detail: String(err) },
      { status: 503 },
    );
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: { dealId: string; docType: string } },
) {
  const { dealId, docType } = params;

  if (!['cepik', 'damage_history'].includes(docType)) {
    return NextResponse.json({ error: 'Unknown document type' }, { status: 404 });
  }

  try {
    const formData = await req.formData();
    const res = await fetch(`${BACKEND}/report/${dealId}/document/${docType}`, {
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
