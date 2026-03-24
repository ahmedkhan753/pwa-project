"use client"
import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { useInspectionStore } from "@/store/useInspectionStore"

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

export default function ReviewInspectionPage() {
  const params = useParams()
  const router = useRouter()
  const dealId = params.id as string
  const [deal, setDeal] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchDeal = async () => {
      try {
        const token = useInspectionStore.getState().auth?.token
        const res = await fetch(`${BASE_URL}/deals/${dealId}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        })
        const data = await res.json()
        console.log('[Review] Deal data:', data)
        setDeal(data)
      } catch (e) {
        console.error('[Review] Error:', e)
      } finally {
        setLoading(false)
      }
    }
    fetchDeal()
  }, [dealId])

  const handleOpenReport = () => {
    const token = useInspectionStore.getState().auth?.token
    if (!token) {
      alert("Brak autoryzacji. Zaloguj się ponownie.")
      return
    }
    fetch(`${BASE_URL}/inspection/${dealId}/report`, {
      headers: { 'Authorization': `Bearer ${token}` }
    })
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.blob()
      })
      .then(blob => {
        const url = URL.createObjectURL(blob)
        window.open(url, '_blank')
        setTimeout(() => URL.revokeObjectURL(url), 10000)
      })
      .catch(err => {
        console.error('Report error:', err)
        alert('Nie można otworzyć raportu. Spróbuj ponownie.')
      })
  }

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <p className="text-gray-500">Ładowanie danych...</p>
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 p-4">
      <div className="max-w-2xl mx-auto">

        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={() => router.back()}
            className="p-2 rounded-xl bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700"
          >
            ← Powrót
          </button>
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">Podgląd oględzin</h1>
            <p className="text-sm text-gray-500">{deal?.TITLE || `Zlecenie #${dealId}`}</p>
          </div>
          <span className="ml-auto px-3 py-1 bg-green-100 text-green-700 rounded-full text-xs font-bold">
            ✅ Zakończone
          </span>
        </div>

        {/* Deal Info Card */}
        <div className="bg-white dark:bg-gray-900 rounded-2xl shadow p-5 mb-4">
          <h2 className="font-bold text-sm uppercase text-gray-400 mb-3">Dane zlecenia</h2>
          <div className="space-y-2">
            <Row label="Nr zlecenia" value={deal?.TITLE || deal?.title} />
            <Row label="Marka" value={deal?.vehicle_brand || deal?.make} />
            <Row label="Model" value={deal?.vehicle_model || deal?.model} />
            <Row label="Nr rejestracyjny" value={deal?.registration_number || deal?.registrationPlates} />
            <Row label="VIN" value={deal?.vin || deal?.UF_CRM_1766057539531} />
            <Row label="Rok produkcji" value={deal?.production_year || deal?.year} />
            <Row label="Przebieg" value={deal?.mileage} />
            <Row label="Kolor" value={deal?.vehicle_color || deal?.color} />
            <Row label="Typ nadwozia" value={deal?.body_type} />
            <Row label="Skrzynia biegów" value={deal?.gearbox_type} />
            <Row label="Rodzaj napędu" value={deal?.drive_type} />
            <Row label="Pojemność silnika" value={deal?.engine_capacity} />
            <Row label="Moc silnika" value={deal?.engine_power} />
            <Row label="Paliwo" value={deal?.fuel_type} />
            <Row label="Miejsce oględzin" value={deal?.inspectionAddress || deal?.inspection_place} />
            <Row label="Osoba kontaktowa" value={deal?.contactPerson || deal?.contact_person} />
            <Row label="Tel. kontaktowy" value={deal?.contactPhone || deal?.contact_phone} />
            <Row label="Status" value={deal?.status} />
            <Row label="Data utworzenia" value={deal?.DATE_CREATE || deal?.date_create ? new Date(deal?.DATE_CREATE || deal?.date_create).toLocaleDateString('pl-PL') : ''} />
          </div>
        </div>

        {/* Status Card */}
        <div className="bg-white dark:bg-gray-900 rounded-2xl shadow p-5 mb-4">
          <h2 className="font-bold text-sm uppercase text-gray-400 mb-3">Status</h2>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-green-500"></span>
            <span className="font-bold text-green-700 dark:text-green-400">Oględziny zakończone</span>
          </div>
        </div>

        {/* PDF Button */}
        <button
          onClick={handleOpenReport}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white py-4 rounded-2xl font-bold text-lg mb-4 transition-all active:scale-[0.98]"
        >
          📄 Otwórz raport PDF
        </button>

        <p className="text-center text-xs text-gray-400">
          Dane są tylko do odczytu. Oględziny zostały zakończone.
        </p>
      </div>
    </div>
  )
}

function Row({ label, value }: { label: string, value?: string }) {
  return (
    <div className="flex justify-between py-2 border-b border-gray-100 dark:border-gray-800 last:border-0">
      <span className="text-sm text-gray-500">{label}</span>
      <span className="text-sm font-bold text-right text-gray-900 dark:text-white">{value || "—"}</span>
    </div>
  )
}
