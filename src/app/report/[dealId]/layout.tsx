import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Raport Stanu Pojazdu — Zaufaj Rzeczoznawcy',
  description: 'Profesjonalny raport stanu technicznego pojazdu.',
};

export default function ReportLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {/* Font Awesome for section icons */}
      {/* eslint-disable-next-line @next/next/no-page-custom-font */}
      <link
        rel="stylesheet"
        href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css"
        crossOrigin="anonymous"
      />
      {children}
    </>
  );
}
