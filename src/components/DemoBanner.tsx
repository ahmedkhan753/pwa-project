export function DemoBanner() {
  const isDemo = process.env.NEXT_PUBLIC_DEMO_MODE === 'true';

  if (!isDemo) {
    return (
      <div className="bg-red-600 text-white text-center text-[10px] py-1 font-black uppercase tracking-widest sticky top-0 z-[100] shadow-xl">
        ⚠️ REAL MODE ACTIVE — Mock data is DISABLED
      </div>
    );
  }
    
  return (
    <div className="bg-amber-500 text-black text-center text-xs py-1 font-bold sticky top-0 z-[100] shadow-md uppercase tracking-tighter">
      🔶 TRYB DEMO — Symulacja Bitrix24 Aktywna
    </div>
  )
}
