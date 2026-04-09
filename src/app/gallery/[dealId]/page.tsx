'use client';

import React, { useEffect, useState, useCallback, useRef } from 'react';

/* ═══════════════════════════════════════════════════════════════
   GALLERY / MEDIA PORTFOLIO PAGE
   Public page — shows all inspection photos & videos for a deal.
   Route: /gallery/[dealId]
   ═══════════════════════════════════════════════════════════════ */

// ─── Types ───────────────────────────────────────────────────────────────────

interface MediaItem {
  slot_id: string;
  label: string;
  category: string;
  is_video: boolean;
  url: string; // data URI (base64)
}

interface GalleryData {
  deal_id: number;
  vehicle_name: string;
  inspection_date: string;
  total_photos: number;
  total_videos: number;
  media: MediaItem[];
}

// ─── Category config ─────────────────────────────────────────────────────────

const CATEGORY_CONFIG: Record<string, { label: string; icon: string; order: number }> = {
  exterior:  { label: 'Nadwozie',       icon: '🚗', order: 1 },
  interior:  { label: 'Wnętrze',        icon: '🪑', order: 2 },
  engine:    { label: 'Silnik',          icon: '⚙️', order: 3 },
  documents: { label: 'Dokumenty',        icon: '📄', order: 4 },
  damages:   { label: 'Uszkodzenia',     icon: '⚠️', order: 5 },
  videos:    { label: 'Materiały wideo', icon: '🎬', order: 6 },
  other:     { label: 'Inne',            icon: '📎', order: 7 },
};

const LOGO_URL = 'https://i.postimg.cc/VsgMRGYH/SPROWADZENIE-SAMOCHODOW-Z-USAPOD-DOM-500-x-500-px-800-x-500-px-700-x-300-px-2.png';

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function downloadMedia(url: string, filename: string) {
  try {
    const res = await fetch(url);
    const blob = await res.blob();
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(blobUrl);
  } catch {
    window.open(url, '_blank', 'noopener,noreferrer');
  }
}

function formatFilename(item: MediaItem, dealId: number) {
  const ext = item.is_video ? 'mp4' : 'jpg';
  const safe = item.label.replace(/[^a-zA-Z0-9ąćęłńóśźżĄĆĘŁŃÓŚŹŻ ]/g, '').replace(/\s+/g, '_');
  return `${dealId}_${safe}.${ext}`;
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function GalleryPage({ params }: { params: { dealId: string } }) {
  const dealId = parseInt(params.dealId, 10);
  const [data, setData] = useState<GalleryData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [lightbox, setLightbox] = useState<number | null>(null);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [downloading, setDownloading] = useState(false);

  // Flat list of all media for lightbox navigation
  const allMedia = data?.media ?? [];
  const photoMedia = allMedia.filter(m => !m.is_video);

  useEffect(() => {
    if (isNaN(dealId)) {
      setError('Nieprawidłowy identyfikator zlecenia');
      setLoading(false);
      return;
    }
    (async () => {
      try {
        const res = await fetch(`/api/gallery/${dealId}`);
        if (!res.ok) {
          const msg = res.status === 404
            ? 'Nie znaleziono materiałów dla tego zlecenia.'
            : `Błąd serwera (${res.status})`;
          setError(msg);
          return;
        }
        setData(await res.json());
      } catch {
        setError('Nie udało się załadować galerii. Spróbuj ponownie.');
      } finally {
        setLoading(false);
      }
    })();
  }, [dealId]);

  const toggleCategory = (cat: string) => {
    setCollapsed(prev => ({ ...prev, [cat]: !prev[cat] }));
  };

  const handleDownloadAll = useCallback(async () => {
    if (!data || downloading) return;
    setDownloading(true);
    const photos = data.media.filter(m => !m.is_video);
    for (let i = 0; i < photos.length; i++) {
      const item = photos[i];
      await downloadMedia(item.url, formatFilename(item, dealId));
      // Small delay between downloads to avoid browser throttling
      if (i < photos.length - 1) await new Promise(r => setTimeout(r, 300));
    }
    setDownloading(false);
  }, [data, dealId, downloading]);

  // Group media by category
  const grouped = React.useMemo(() => {
    if (!data) return [];
    const map: Record<string, MediaItem[]> = {};
    for (const item of data.media) {
      if (!map[item.category]) map[item.category] = [];
      map[item.category].push(item);
    }
    return Object.entries(map)
      .sort(([a], [b]) => (CATEGORY_CONFIG[a]?.order ?? 99) - (CATEGORY_CONFIG[b]?.order ?? 99));
  }, [data]);

  // ─── Lightbox keyboard ────────────────────────────────────────────────
  useEffect(() => {
    if (lightbox === null) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLightbox(null);
      if (e.key === 'ArrowRight') setLightbox(prev => prev !== null && prev < photoMedia.length - 1 ? prev + 1 : prev);
      if (e.key === 'ArrowLeft') setLightbox(prev => prev !== null && prev > 0 ? prev - 1 : prev);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [lightbox, photoMedia.length]);

  // ─── Loading / Error states ────────────────────────────────────────────
  if (loading) return <LoadingScreen />;
  if (error) return <ErrorScreen message={error} />;
  if (!data) return <ErrorScreen message="Brak danych" />;

  return (
    <div style={{ overflowX: 'hidden', width: '100%', maxWidth: '100vw' }}>
      {/* eslint-disable-next-line @next/next/no-page-custom-font */}
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" />
      <style dangerouslySetInnerHTML={{ __html: GLOBAL_CSS }} />

      {/* ─── Header ─────────────────────────────────────────────── */}
      <header className="gal-header">
        <div className="gal-header-inner">
          <img src={LOGO_URL} alt="Zaufaj Rzeczoznawcy" className="gal-logo" />
          <div className="gal-header-text">
            <h1 className="gal-title">{data.vehicle_name}</h1>
            <p className="gal-subtitle">
              Portfolio inspekcji #{data.deal_id}
              {data.inspection_date && ` • ${data.inspection_date}`}
            </p>
          </div>
        </div>
        <div className="gal-stats-bar">
          <div className="gal-stat">
            <span className="gal-stat-num">{data.total_photos}</span>
            <span className="gal-stat-label">Zdjęcia</span>
          </div>
          <div className="gal-stat-divider" />
          <div className="gal-stat">
            <span className="gal-stat-num">{data.total_videos}</span>
            <span className="gal-stat-label">Wideo</span>
          </div>
          <div className="gal-stat-divider" />
          <div className="gal-stat">
            <span className="gal-stat-num">{grouped.length}</span>
            <span className="gal-stat-label">Kategorie</span>
          </div>
          <div className="gal-stat-divider" />
          <div className="gal-stat">
            <button
              className="gal-dl-all-btn"
              onClick={handleDownloadAll}
              disabled={downloading}
              title="Pobierz wszystkie zdjęcia"
            >
              {downloading ? '⏳' : '⬇'} {downloading ? 'Pobieranie...' : 'Pobierz wszystkie'}
            </button>
          </div>
        </div>
      </header>

      {/* ─── Category Sections ──────────────────────────────────── */}
      <main className="gal-main">
        {grouped.map(([cat, items]) => {
          const cfg = CATEGORY_CONFIG[cat] ?? { label: cat, icon: '📁', order: 99 };
          const isOpen = !collapsed[cat];
          return (
            <section key={cat} className="gal-section">
              <button className="gal-section-header" onClick={() => toggleCategory(cat)}>
                <div className="gal-section-title-row">
                  <span className="gal-section-icon">{cfg.icon}</span>
                  <h2 className="gal-section-title">{cfg.label}</h2>
                  <span className="gal-section-count">{items.length}</span>
                </div>
                <span className={`gal-chevron ${isOpen ? 'open' : ''}`}>▼</span>
              </button>
              {isOpen && (
                <div className="gal-grid">
                  {items.map((item, idx) => (
                    <MediaCard
                      key={item.slot_id}
                      item={item}
                      dealId={dealId}
                      onOpen={() => {
                        if (!item.is_video) {
                          const globalIdx = photoMedia.findIndex(m => m.slot_id === item.slot_id);
                          setLightbox(globalIdx >= 0 ? globalIdx : null);
                        }
                      }}
                    />
                  ))}
                </div>
              )}
            </section>
          );
        })}
      </main>

      {/* ─── Footer ────────────────────────────────────────────── */}
      <footer className="gal-footer">
        <img src={LOGO_URL} alt="ZR" className="gal-footer-logo" />
        <p>© 2025 Zaufaj Rzeczoznawcy — Portfolio inspekcji #{data.deal_id}</p>
      </footer>

      {/* ─── Lightbox ──────────────────────────────────────────── */}
      {lightbox !== null && photoMedia[lightbox] && (
        <Lightbox
          items={photoMedia}
          currentIdx={lightbox}
          onClose={() => setLightbox(null)}
          onPrev={() => setLightbox(Math.max(0, lightbox - 1))}
          onNext={() => setLightbox(Math.min(photoMedia.length - 1, lightbox + 1))}
          dealId={dealId}
        />
      )}
    </div>
  );
}

// ─── MediaCard ───────────────────────────────────────────────────────────────

function MediaCard({ item, dealId, onOpen }: { item: MediaItem; dealId: number; onOpen: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [videoErr, setVideoErr] = useState(false);

  return (
    <div className="gal-card">
      <div
        className={`gal-card-media${item.is_video ? ' is-video' : ''}`}
        onClick={() => !item.is_video && onOpen()}
      >
        {item.is_video ? (
          videoErr ? (
            <div style={{
              width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center', gap: 8, color: '#fff',
              background: '#1A1A2E', padding: 12, textAlign: 'center',
            }}>
              <span style={{ fontSize: 32 }}>🎬</span>
              <span style={{ fontSize: 12 }}>Nie można odtworzyć w przeglądarce</span>
              <a href={item.url} download={formatFilename(item, dealId)}
                 style={{ fontSize: 11, color: '#B71C1C', fontWeight: 700, textDecoration: 'underline' }}>
                Pobierz wideo
              </a>
            </div>
          ) : (
            <video
              ref={videoRef}
              src={item.url}
              controls
              playsInline
              preload="metadata"
              className="gal-card-video"
              onError={() => setVideoErr(true)}
            >
              <source src={item.url} type="video/mp4" />
              <source src={item.url} type="video/webm" />
            </video>
          )
        ) : (
          <img
            src={item.url}
            alt={item.label}
            loading="lazy"
            className="gal-card-img"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = 'none';
            }}
          />
        )}
        {!item.is_video && (
          <div className="gal-card-overlay">
            <span className="gal-zoom-icon">🔍</span>
          </div>
        )}
      </div>
      <div className="gal-card-info">
        <span className="gal-card-label">{item.label}</span>
        <button
          className="gal-card-dl"
          title="Pobierz"
          onClick={(e) => {
            e.stopPropagation();
            downloadMedia(item.url, formatFilename(item, dealId));
          }}
        >
          ⬇
        </button>
      </div>
    </div>
  );
}

// ─── Lightbox ────────────────────────────────────────────────────────────────

function Lightbox({
  items, currentIdx, onClose, onPrev, onNext, dealId
}: {
  items: MediaItem[]; currentIdx: number; onClose: () => void;
  onPrev: () => void; onNext: () => void; dealId: number;
}) {
  const item = items[currentIdx];
  // Swipe support
  const touchStart = useRef(0);

  return (
    <div className="lb-overlay" onClick={onClose}>
      <div className="lb-content" onClick={e => e.stopPropagation()}
        onTouchStart={e => { touchStart.current = e.touches[0].clientX; }}
        onTouchEnd={e => {
          const diff = e.changedTouches[0].clientX - touchStart.current;
          if (diff > 60) onPrev();
          else if (diff < -60) onNext();
        }}
      >
        <button className="lb-close" onClick={onClose}>✕</button>
        <button className="lb-prev" onClick={onPrev} disabled={currentIdx <= 0}>‹</button>
        <img src={item.url} alt={item.label} className="lb-img" />
        <button className="lb-next" onClick={onNext} disabled={currentIdx >= items.length - 1}>›</button>
        <div className="lb-info">
          <span className="lb-label">{item.label}</span>
          <span className="lb-counter">{currentIdx + 1} / {items.length}</span>
          <button
            className="lb-download"
            onClick={() => downloadMedia(item.url, formatFilename(item, dealId))}
          >
            ⬇ Pobierz
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Loading/Error ───────────────────────────────────────────────────────────

function LoadingScreen() {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', fontFamily: "'Inter',system-ui,sans-serif" }}>
      <style dangerouslySetInnerHTML={{ __html: '@keyframes spin { to { transform: rotate(360deg); } }' }} />
      <header style={{ background: '#1A1A2E', padding: '20px 24px', position: 'relative', textAlign: 'center' }}>
        <img src={LOGO_URL} alt="Zaufaj Rzeczoznawcy" style={{ height: 44, width: 'auto' }} />
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 3, background: '#B71C1C' }} />
      </header>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#F5F5F7', gap: 16 }}>
        <div style={{ width: 44, height: 44, border: '3px solid #E8E8ED', borderTopColor: '#B71C1C', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        <p style={{ color: '#86868B', fontSize: 14, fontWeight: 500 }}>Ładowanie galerii...</p>
      </div>
    </div>
  );
}

function ErrorScreen({ message }: { message: string }) {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', fontFamily: "'Inter',system-ui,sans-serif" }}>
      <header style={{ background: '#1A1A2E', padding: '20px 24px', position: 'relative', textAlign: 'center' }}>
        <img src={LOGO_URL} alt="Zaufaj Rzeczoznawcy" style={{ height: 44, width: 'auto' }} />
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 3, background: '#B71C1C' }} />
      </header>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#F5F5F7', padding: 32, textAlign: 'center', gap: 12 }}>
        <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#FEF2F2', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28 }}>⚠️</div>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: '#1D1D1F', margin: 0 }}>Wystąpił problem</h2>
        <p style={{ color: '#86868B', fontSize: 14, maxWidth: 400, margin: 0 }}>{message}</p>
      </div>
    </div>
  );
}

// ─── CSS ─────────────────────────────────────────────────────────────────────

const GLOBAL_CSS = `
*,*::before,*::after { box-sizing: border-box; margin: 0; padding: 0; }
html, body { font-family: 'Inter', system-ui, -apple-system, sans-serif;
  background: #F5F5F7 !important; color: #1D1D1F !important;
  overflow-x: hidden; width: 100%; max-width: 100vw; -webkit-font-smoothing: antialiased; }

/* ─── Header ─── */
.gal-header {
  background: #1A1A2E;
  border-bottom: 3px solid #B71C1C;
  padding: 28px 24px 0;
  position: relative;
}
.gal-header-inner {
  max-width: 1100px; margin: 0 auto;
  display: flex; align-items: center; gap: 20px;
  padding-bottom: 24px;
}
.gal-logo { height: 50px; width: auto; flex-shrink: 0; }
.gal-header-text { flex: 1; min-width: 0; }
.gal-title { font-size: 22px; font-weight: 800; color: #fff; line-height: 1.25; }
.gal-subtitle { font-size: 13px; color: rgba(255,255,255,0.5); margin-top: 3px; }
.gal-stats-bar {
  max-width: 1100px; margin: 0 auto;
  display: flex; gap: 0; padding: 14px 0;
  border-top: 1px solid rgba(255,255,255,0.08);
}
.gal-stat {
  flex: 1; display: flex; flex-direction: column; align-items: center; gap: 2px;
}
.gal-stat-num { font-size: 20px; font-weight: 800; color: #B71C1C; }
.gal-stat-label { font-size: 10px; color: rgba(255,255,255,0.4); text-transform: uppercase; letter-spacing: 1px; font-weight: 600; }
.gal-stat-divider { width: 1px; background: rgba(255,255,255,0.1); margin: 2px 0; }
.gal-dl-all-btn {
  background: #B71C1C; color: #fff; border: none; border-radius: 8px;
  font-size: 11px; font-weight: 700; padding: 6px 12px; cursor: pointer;
  white-space: nowrap; transition: background 0.2s; font-family: inherit;
}
.gal-dl-all-btn:hover { background: #D32F2F; }
.gal-dl-all-btn:disabled { background: #555; cursor: default; }

/* ─── Main ─── */
.gal-main {
  max-width: 1100px; margin: 0 auto; padding: 24px 16px 60px;
  display: flex; flex-direction: column; gap: 16px;
}

/* ─── Section ─── */
.gal-section {
  border-radius: 12px; overflow: hidden;
  background: #fff; border: 1px solid #E8E8ED;
  box-shadow: 0 1px 3px rgba(0,0,0,0.04);
}
.gal-section-header {
  width: 100%; display: flex; justify-content: space-between; align-items: center;
  padding: 18px 22px; cursor: pointer;
  background: #fff; border: none; color: #1D1D1F;
  font-family: inherit; transition: background 0.2s; position: relative;
}
.gal-section-header::before {
  content: ''; position: absolute; left: 0; top: 0; bottom: 0;
  width: 3px; background: #B71C1C; border-radius: 0 3px 3px 0;
}
.gal-section-header:hover { background: #FAFAFA; }
.gal-section-title-row { display: flex; align-items: center; gap: 12px; }
.gal-section-icon { font-size: 18px; }
.gal-section-title { font-size: 15px; font-weight: 700; color: #1D1D1F; }
.gal-section-count {
  background: #B71C1C; color: #fff; font-size: 11px; font-weight: 700;
  padding: 2px 8px; border-radius: 10px; min-width: 24px; text-align: center;
}
.gal-chevron {
  font-size: 11px; color: #86868B; transition: transform 0.3s;
}
.gal-chevron.open { transform: rotate(180deg); }

/* ─── Grid ─── */
.gal-grid {
  display: grid; grid-template-columns: repeat(auto-fill, minmax(210px, 1fr));
  gap: 12px; padding: 16px; border-top: 1px solid #E8E8ED;
  background: #F5F5F7;
}

/* ─── Card ─── */
.gal-card {
  border-radius: 10px; overflow: hidden; background: #fff;
  border: 1px solid #E8E8ED;
  box-shadow: 0 1px 2px rgba(0,0,0,0.04);
  transition: transform 0.2s, box-shadow 0.2s;
}
.gal-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(0,0,0,0.10);
}
.gal-card-media {
  position: relative; aspect-ratio: 4/3; overflow: hidden; cursor: pointer;
  background: #E8E8ED;
}
.gal-card-media.is-video {
  /* Videos need more vertical room for native controls; cover crops them in some browsers */
  aspect-ratio: 16/10; cursor: default;
}
.gal-card-img {
  width: 100%; height: 100%; object-fit: cover; display: block;
  transition: transform 0.3s;
}
.gal-card:hover .gal-card-img { transform: scale(1.04); }
.gal-card-video {
  width: 100%; height: 100%; object-fit: contain; display: block; background: #1A1A2E;
}
.gal-card-overlay {
  position: absolute; inset: 0; background: rgba(0,0,0,0.35);
  display: flex; align-items: center; justify-content: center;
  opacity: 0; transition: opacity 0.2s;
}
.gal-card:hover .gal-card-overlay { opacity: 1; }
.gal-zoom-icon { font-size: 26px; }
.gal-card-info {
  padding: 8px 12px; display: flex; justify-content: space-between; align-items: center;
  gap: 6px; background: #fff;
}
.gal-card-label {
  font-size: 11px; font-weight: 600; color: #3C3C43; white-space: nowrap;
  overflow: hidden; text-overflow: ellipsis; min-width: 0; line-height: 1.3;
}
.gal-card-dl {
  flex-shrink: 0; width: 26px; height: 26px; border-radius: 6px;
  background: #FEF2F2; border: 1px solid #FECACA;
  color: #B71C1C; font-size: 13px; cursor: pointer; display: flex;
  align-items: center; justify-content: center; transition: all 0.2s;
}
.gal-card-dl:hover {
  background: #B71C1C; color: #fff; border-color: #B71C1C;
}

/* ─── Footer ─── */
.gal-footer {
  text-align: center; padding: 28px 24px; border-top: 1px solid #E8E8ED;
  color: #86868B; font-size: 12px; background: #fff;
}
.gal-footer-logo { height: 32px; margin-bottom: 10px; }

/* ─── Lightbox ─── */
.lb-overlay {
  position: fixed; inset: 0; z-index: 9999; background: rgba(0,0,0,0.93);
  display: flex; align-items: center; justify-content: center;
  animation: lbFadeIn 0.2s;
}
@keyframes lbFadeIn { from { opacity: 0; } to { opacity: 1; } }
.lb-content {
  position: relative; max-width: 90vw; max-height: 90vh;
  display: flex; flex-direction: column; align-items: center;
}
.lb-img {
  max-width: 90vw; max-height: 75vh; object-fit: contain; border-radius: 6px;
  box-shadow: 0 0 60px rgba(0,0,0,0.6);
}
.lb-close {
  position: fixed; top: 16px; right: 16px; z-index: 10001;
  width: 40px; height: 40px; border-radius: 50%; background: rgba(255,255,255,0.12);
  border: none; color: #fff; font-size: 18px; cursor: pointer;
  display: flex; align-items: center; justify-content: center; transition: background 0.2s;
}
.lb-close:hover { background: #B71C1C; }
.lb-prev, .lb-next {
  position: fixed; top: 50%; transform: translateY(-50%);
  width: 44px; height: 44px; border-radius: 50%; background: rgba(255,255,255,0.10);
  border: 1px solid rgba(255,255,255,0.12); color: #fff; font-size: 24px;
  cursor: pointer; display: flex; align-items: center; justify-content: center;
  transition: background 0.2s; z-index: 10001;
}
.lb-prev { left: 16px; }
.lb-next { right: 16px; }
.lb-prev:hover, .lb-next:hover { background: rgba(183,28,28,0.7); }
.lb-prev:disabled, .lb-next:disabled { opacity: 0.25; cursor: default; }
.lb-info {
  margin-top: 14px; display: flex; align-items: center; gap: 14px; color: rgba(255,255,255,0.8); font-size: 13px;
}
.lb-label { font-weight: 600; }
.lb-counter { color: rgba(255,255,255,0.4); }
.lb-download {
  padding: 6px 14px; border-radius: 6px; background: #B71C1C;
  border: none; color: #fff; font-size: 12px; font-weight: 600; cursor: pointer;
  transition: background 0.2s;
}
.lb-download:hover { background: #D32F2F; }

/* ─── Mobile ─── */
@media (max-width: 768px) {
  .gal-header { padding: 18px 16px 0; }
  .gal-header-inner { flex-direction: column; align-items: flex-start; gap: 12px; padding-bottom: 18px; }
  .gal-logo { height: 38px; }
  .gal-title { font-size: 18px; }
  .gal-grid { grid-template-columns: repeat(2, 1fr); gap: 8px; padding: 12px; }
  .gal-section-header { padding: 14px 16px; }
  .gal-section-title { font-size: 14px; }
  .gal-card-label { font-size: 10px; }
  .lb-prev, .lb-next { width: 36px; height: 36px; font-size: 20px; }
  .lb-info { flex-direction: column; gap: 8px; }
}
@media (max-width: 480px) {
  .gal-grid { grid-template-columns: repeat(2, 1fr); gap: 6px; padding: 8px; }
  .gal-stat-num { font-size: 17px; }
  .gal-card-info { padding: 7px 8px; }
  .gal-main { padding: 16px 12px 48px; gap: 12px; }
}

/* ─── Print ─── */
@media print {
  .gal-card-dl, .gal-card-overlay, .lb-overlay { display: none !important; }
  body { background: #fff !important; color: #000 !important; }
  .gal-section { break-inside: avoid; }
  .gal-card { break-inside: avoid; }
}
`;
