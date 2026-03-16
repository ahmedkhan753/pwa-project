export function DemoBanner() {
  if (process.env.NEXT_PUBLIC_DEMO_MODE !== 'true')
    return null
    
  return (
    <div className="bg-amber-500 text-black text-center text-xs py-1 font-semibold sticky top-0 z-[100] shadow-md">
      🔶 TRYB DEMO — Dane testowe, bez połączenia z Bitrix24
    </div>
  )
}
