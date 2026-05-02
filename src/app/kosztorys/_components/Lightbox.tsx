'use client';
import React, { useEffect, useRef, useState } from 'react';

/**
 * Full-screen image viewer with keyboard nav + swipe support.
 * Extracted from the static /kosztorys page so the dynamic
 * /kosztorys/[dealId] page can reuse the exact same UX.
 */
export function Lightbox({
  photos,
  start,
  onClose,
}: {
  photos: string[];
  start: number;
  onClose: () => void;
}) {
  const [idx, setIdx] = useState(start);
  const touchX = useRef<number | null>(null);

  const prev = () => setIdx(i => Math.max(i - 1, 0));
  const next = () => setIdx(i => Math.min(i + 1, photos.length - 1));

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape')     onClose();
      if (e.key === 'ArrowLeft')  prev();
      if (e.key === 'ArrowRight') next();
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  });

  return (
    <div
      className="no-print"
      style={{
        position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.92)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      }}
      onClick={onClose}
      onTouchStart={e => { touchX.current = e.touches[0].clientX; }}
      onTouchEnd={e => {
        if (touchX.current === null) return;
        const dx = e.changedTouches[0].clientX - touchX.current;
        if (dx > 50) prev();
        if (dx < -50) next();
        touchX.current = null;
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={photos[idx]} alt=""
        style={{ maxWidth: '92vw', maxHeight: '82vh', objectFit: 'contain', borderRadius: 8 }}
        onClick={e => e.stopPropagation()}
      />
      <div style={{ marginTop: 14, color: '#fff', fontSize: 13, opacity: 0.7 }}>
        {idx + 1} / {photos.length}
      </div>
      {idx > 0 && (
        <button onClick={e => { e.stopPropagation(); prev(); }}
          style={{
            position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)',
            background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: 50,
            width: 44, height: 44, color: '#fff', fontSize: 20, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
          ‹
        </button>
      )}
      {idx < photos.length - 1 && (
        <button onClick={e => { e.stopPropagation(); next(); }}
          style={{
            position: 'absolute', right: 16, top: '50%', transform: 'translateY(-50%)',
            background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: 50,
            width: 44, height: 44, color: '#fff', fontSize: 20, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
          ›
        </button>
      )}
    </div>
  );
}
