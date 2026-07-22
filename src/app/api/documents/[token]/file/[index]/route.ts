/**
 * Next.js API Proxy — /api/documents/[token]/file/[index]
 *
 * Streams a valuation PDF from the FastAPI backend, which fetches it from
 * Bitrix server-side. The customer never sees a Bitrix URL or auth token.
 * Content-Type / Content-Disposition are passed through so the browser
 * downloads the file with the backend's filename.
 */
import { NextRequest, NextResponse } from 'next/server';

// Server-only env var — never baked into the client bundle.
const BACKEND = process.env.BACKEND_URL || 'http://backend:8000';

export async function GET(
  _req: NextRequest,
  { params }: { params: { token: string; index: string } },
) {
  const { token, index } = params;

  try {
    // Backend router prefix is /documents (no /api) — this proxy hits the
    // backend container directly (bypassing nginx), so it uses the real path.
    const res = await fetch(
      `${BACKEND}/documents/${token}/file/${index}`,
      { cache: 'no-store' },
    );

    if (!res.ok) {
      // Mirror the backend status (404 unknown token/index, 502 upstream).
      return NextResponse.json(
        { error: 'Nie udało się pobrać pliku' },
        { status: res.status },
      );
    }

    const buf = await res.arrayBuffer();

    return new NextResponse(buf, {
      status: 200,
      headers: {
        'Content-Type': res.headers.get('content-type') || 'application/pdf',
        'Content-Disposition':
          res.headers.get('content-disposition') || 'attachment',
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: 'Backend unavailable', detail: String(err) },
      { status: 503 },
    );
  }
}
