'use client';

/**
 * Public customer documents page — /dokumenty/{token}
 *
 * No login: the unguessable token in the URL is the only credential. All
 * document links come from the backend; PDFs are served through the backend
 * proxy so no Bitrix URL, file id or auth token is ever exposed here.
 */
import { useEffect, useState } from 'react';
import { COLORS } from '../../kosztorys/_components/styles';

interface ClientDocument {
  label: string;
  kind: 'pdf' | 'link';
  url: string;
}

interface DocumentsData {
  deal_id: number;
  vehicle_title: string;
  plate: string;
  hero_image_url: string | null;
  contact_name: string;
  documents: ClientDocument[];
}

export default function DokumentyPage({ params }: { params: { token: string } }) {
  const { token } = params;
  const [data, setData] = useState<DocumentsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    fetch(`/api/documents/${token}`, { cache: 'no-store' })
      .then(async r => {
        if (!r.ok) {
          setNotFound(true);
          return null;
        }
        return (await r.json()) as DocumentsData;
      })
      .catch(() => {
        setNotFound(true);
        return null;
      })
      .then(d => {
        if (d) setData(d);
        setLoading(false);
      });
  }, [token]);

  const shell = (children: React.ReactNode) => (
    <div style={{
      minHeight: '100vh', background: COLORS.bg, color: COLORS.text,
      fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
      padding: '24px 16px 64px',
    }}>
      <div style={{ maxWidth: 720, margin: '0 auto' }}>{children}</div>
    </div>
  );

  if (loading) {
    return shell(
      <div style={{
        textAlign: 'center', padding: '80px 20px',
        color: COLORS.muted, fontSize: 14,
      }}>
        Ładowanie dokumentów…
      </div>
    );
  }

  if (notFound || !data) {
    return shell(
      <div style={{
        background: COLORS.surface, borderRadius: 12,
        border: `1px solid ${COLORS.border}`, padding: '48px 24px',
        textAlign: 'center',
      }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>🔍</div>
        <h1 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 8px' }}>
          Nie znaleziono dokumentów
        </h1>
        <p style={{ fontSize: 14, color: COLORS.muted, margin: 0, lineHeight: 1.6 }}>
          Link jest nieprawidłowy lub wygasł. Prosimy o kontakt z naszym biurem.
        </p>
      </div>
    );
  }

  const identity = [data.vehicle_title, data.plate].filter(Boolean).join(' · ');

  return shell(
    <>
      {/* Hero — same photo the conditional report uses */}
      {data.hero_image_url && (
        <div style={{
          borderRadius: 12, overflow: 'hidden', aspectRatio: '4 / 3',
          background: COLORS.mutedLt, marginBottom: 20,
          border: `1px solid ${COLORS.border}`,
        }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={data.hero_image_url}
            alt={data.vehicle_title || 'Pojazd'}
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          />
        </div>
      )}

      {/* Order identity */}
      <div style={{
        background: COLORS.surface, borderRadius: 12,
        border: `1px solid ${COLORS.border}`, padding: '20px 24px',
        marginBottom: 20,
      }}>
        {identity && (
          <div style={{ fontSize: 19, fontWeight: 700, lineHeight: 1.3 }}>
            {identity}
          </div>
        )}
        <div style={{ fontSize: 13, color: COLORS.muted, marginTop: 6 }}>
          Zlecenie nr {data.deal_id}
        </div>
        {data.contact_name && (
          <div style={{ fontSize: 13, color: COLORS.muted, marginTop: 2 }}>
            {data.contact_name}
          </div>
        )}
      </div>

      <h2 style={{
        fontSize: 11, fontWeight: 700, color: COLORS.muted,
        textTransform: 'uppercase', letterSpacing: 1,
        margin: '0 0 12px 4px',
      }}>
        Dokumenty
      </h2>

      {data.documents.length === 0 ? (
        <div style={{
          background: COLORS.surface, borderRadius: 12,
          border: `1px dashed ${COLORS.border}`, padding: '32px 24px',
          textAlign: 'center', color: COLORS.muted, fontSize: 14,
        }}>
          Brak dokumentów do wyświetlenia.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {data.documents.map((doc, i) => {
            const isPdf = doc.kind === 'pdf';
            return (
              <div key={i} style={{
                background: COLORS.surface, borderRadius: 12,
                border: `1px solid ${COLORS.border}`, padding: '16px 20px',
                display: 'flex', alignItems: 'center', gap: 14,
                flexWrap: 'wrap',
              }}>
                <div style={{ flex: 1, minWidth: 180 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, lineHeight: 1.4 }}>
                    {doc.label}
                  </div>
                  <span style={{
                    display: 'inline-block', marginTop: 6,
                    fontSize: 10, fontWeight: 700, letterSpacing: 0.6,
                    textTransform: 'uppercase', padding: '2px 8px',
                    borderRadius: 10,
                    background: isPdf ? COLORS.primaryLt : COLORS.greenLt,
                    color: isPdf ? COLORS.primary : COLORS.green,
                  }}>
                    {isPdf ? 'PDF' : 'Link'}
                  </span>
                </div>
                <a
                  href={doc.url}
                  {...(isPdf
                    ? {}
                    : { target: '_blank', rel: 'noopener noreferrer' })}
                  style={{
                    flexShrink: 0,
                    background: COLORS.primary, color: '#fff',
                    textDecoration: 'none', fontSize: 13, fontWeight: 700,
                    padding: '10px 18px', borderRadius: 8,
                  }}
                >
                  {isPdf ? 'Pobierz plik' : 'Otwórz'}
                </a>
              </div>
            );
          })}
        </div>
      )}

      <div style={{
        marginTop: 28, textAlign: 'center',
        fontSize: 12, color: COLORS.muted, lineHeight: 1.6,
      }}>
        W razie pytań prosimy o kontakt.<br />Zaufaj Rzeczoznawcy
      </div>
    </>
  );
}
