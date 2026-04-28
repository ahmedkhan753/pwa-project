import type { Viewport } from 'next';

// Per-route viewport override. The global viewport in app/layout.tsx sets
// userScalable: false / maximumScale: 1 to lock the inspection wizard at
// 1×, but iOS Safari respects those flags at the browser level and never
// dispatches multi-touch pinch events to JS — which broke pinch-to-zoom
// on the public Condition Report's photo lightbox (commit 0fc9722, QA
// report 2026-04-29). This layout opts the entire /report/* segment back
// in to user zoom so react-zoom-pan-pinch can receive the gestures.
export const viewport: Viewport = {
    width: 'device-width',
    initialScale: 1,
    maximumScale: 5,
    userScalable: true,
};

export default function ReportLayout({ children }: { children: React.ReactNode }) {
    return children;
}
