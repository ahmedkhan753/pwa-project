"use client"
import { useState, useEffect } from "react"

interface Inspector {
  id: number
  name: string
  phone: string
  email: string
  is_active: boolean
  bitrix_synced: boolean
}

interface DealOrder {
  ID: string
  TITLE: string
  STAGE_ID: string
  DATE_CREATE: string
  status: string
  clientName?: string
  inspectionAddress?: string
  scheduledDate?: string
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"

// Order status code → Polish label. Shared by the order card render and the
// orders search filter so both stay in sync.
const STATUS_LABELS: Record<string, string> = {
  new: "Nowe",
  assigned: "Przypisane",
  scheduled: "Zaplanowane",
  completed: "Zakończone",
  in_valuation: "W wycenie",
  closed: "Zamknięte",
  lost: "Utracone",
}
const statusLabel = (s: string): string => STATUS_LABELS[s] || s

// Phone validation for the New / Edit inspector forms.
// Allows digits, spaces, dashes, plus and parentheses; requires ≥9 digits.
const PHONE_RE = /^[0-9+\-\s()]+$/
const phoneError = (phone: string): string => {
  const p = (phone || "").trim()
  if (!p) return ""
  if (!PHONE_RE.test(p)) return "Numer telefonu może zawierać tylko cyfry"
  if ((p.match(/\d/g) || []).length < 9) return "Numer telefonu musi mieć min. 9 cyfr"
  return ""
}
const MAX_NAME_LEN = 100

export default function AdminPanel() {
  const [authed, setAuthed] = useState(false)
  const [password, setPassword] = useState("")
  const [adminToken, setAdminToken] = useState("")
  const [inspectors, setInspectors] = useState<Inspector[]>([])
  const [selectedInspector, setSelectedInspector] = useState<Inspector | null>(null)
  const [orders, setOrders] = useState<DealOrder[]>([])
  const [showAddForm, setShowAddForm] = useState(false)
  const [newInspector, setNewInspector] = useState({
    name: "", phone: "", pin: "1234", email: ""
  })
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState("")
  const [showInspectorList, setShowInspectorList] = useState(true)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editForm, setEditForm] = useState({ name: "", phone: "", email: "", pin: "" })
  const [sortBy, setSortBy] = useState<'name' | 'status' | 'bitrix'>('name')
  const [orderSearch, setOrderSearch] = useState("")

  // Check for existing admin session
  useEffect(() => {
    const saved = localStorage.getItem("admin_token")
    if (saved) {
      setAdminToken(saved)
      setAuthed(true)
      fetchInspectors(saved)
    }
  }, [])

  // Clear message after 3s
  useEffect(() => {
    if (message) {
      const t = setTimeout(() => setMessage(""), 3000)
      return () => clearTimeout(t)
    }
  }, [message])

  const adminLogin = async () => {
    try {
      const res = await fetch(`${API_BASE}/auth/admin/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password })
      })
      if (res.ok) {
        const data = await res.json()
        setAdminToken(data.access_token)
        localStorage.setItem("admin_token", data.access_token)
        setAuthed(true)
        fetchInspectors(data.access_token)
      } else {
        setMessage("❌ Nieprawidłowe hasło")
      }
    } catch {
      setMessage("❌ Błąd połączenia z serwerem")
    }
  }

  const logout = () => {
    localStorage.removeItem("admin_token")
    setAdminToken("")
    setAuthed(false)
    setInspectors([])
    setSelectedInspector(null)
    setOrders([])
  }

  const fetchInspectors = async (token: string) => {
    try {
      const res = await fetch(`${API_BASE}/admin/inspectors`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      if (res.ok) setInspectors(await res.json())
    } catch (e) {
      console.error("Failed to fetch inspectors:", e)
    }
  }

  const fetchInspectorOrders = async (phone: string) => {
    try {
      const res = await fetch(`${API_BASE}/admin/inspectors/${phone}/orders`, {
        headers: { Authorization: `Bearer ${adminToken}` }
      })
      if (res.ok) setOrders(await res.json())
    } catch (e) {
      console.error("Failed to fetch orders:", e)
      setOrders([])
    }
  }

  const addInspector = async () => {
    if (!newInspector.name || !newInspector.phone || !newInspector.pin) {
      setMessage("❌ Wypełnij wszystkie wymagane pola")
      return
    }
    const pErr = phoneError(newInspector.phone)
    if (pErr) {
      setMessage(`❌ ${pErr}`)
      return
    }
    setLoading(true)
    try {
      const res = await fetch(`${API_BASE}/admin/inspectors`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${adminToken}`
        },
        body: JSON.stringify(newInspector)
      })
      if (res.ok) {
        const result = await res.json()
        const syncNote = result.bitrix_synced
          ? "✅ Inspektor dodany i zsynchronizowany z Bitrix!"
          : "✅ Inspektor dodany (⚠️ synchronizacja z Bitrix nie powiodła się — sprawdź logi)"
        setMessage(syncNote)
        setShowAddForm(false)
        setNewInspector({ name: "", phone: "", pin: "1234", email: "" })
        fetchInspectors(adminToken)
      } else {
        const err = await res.json()
        setMessage(`❌ ${err.detail || "Błąd dodawania inspektora"}`)
      }
    } catch {
      setMessage("❌ Błąd połączenia")
    }
    setLoading(false)
  }

  const resetPin = async (id: number) => {
    const newPin = prompt("Podaj nowy PIN (4 cyfry):")
    if (!newPin || newPin.length !== 4) return
    try {
      const res = await fetch(`${API_BASE}/admin/inspectors/${id}/pin`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${adminToken}`
        },
        body: JSON.stringify({ pin: newPin })
      })
      if (res.ok) setMessage("✅ PIN zresetowany!")
    } catch {
      setMessage("❌ Błąd resetu PIN")
    }
  }

  const toggleActive = async (id: number, isActive: boolean) => {
    const endpoint = isActive
      ? `${API_BASE}/admin/inspectors/${id}/deactivate`
      : `${API_BASE}/admin/inspectors/${id}/activate`
    try {
      const res = await fetch(endpoint, {
        method: "PUT",
        headers: { Authorization: `Bearer ${adminToken}` }
      })
      if (res.ok) {
        const result = await res.json()
        const baseMsg = isActive ? "Inspektor dezaktywowany" : "Inspektor aktywowany"
        const syncNote = result.bitrix_synced !== undefined
          ? (result.bitrix_synced ? " i zsynchronizowany z Bitrix" : " (Bitrix: brak synchronizacji)")
          : ""
        setMessage(`✅ ${baseMsg}${syncNote}`)
        fetchInspectors(adminToken)
      }
    } catch {
      setMessage("❌ Błąd zmiany statusu")
    }
  }

  const deleteInspectorPermanent = async (id: number, name: string) => {
    const ok = window.confirm(
      `Czy na pewno chcesz trwale usunąć inspektora ${name}? Tej operacji nie można cofnąć.`
    )
    if (!ok) return
    setLoading(true)
    try {
      const res = await fetch(`${API_BASE}/admin/inspectors/${id}/permanent`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${adminToken}` }
      })
      if (res.ok) {
        setMessage("✅ Inspektor trwale usunięty")
        if (selectedInspector?.id === id) {
          setSelectedInspector(null)
          setOrders([])
        }
        if (editingId === id) setEditingId(null)
        fetchInspectors(adminToken)
      } else {
        const err = await res.json().catch(() => ({}))
        setMessage(`❌ ${err.detail || "Błąd trwałego usuwania inspektora"}`)
      }
    } catch {
      setMessage("❌ Błąd połączenia")
    }
    setLoading(false)
  }

  const sendNotification = async (inspectorPhone: string, order: DealOrder) => {
    try {
      const res = await fetch(`${API_BASE}/admin/inspectors/notify`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${adminToken}`
        },
        body: JSON.stringify({
          phone: inspectorPhone,
          order_title: order.TITLE || `Zlecenie #${order.ID}`,
          order_id: order.ID,
          client_name: order.clientName || "",
          inspection_address: order.inspectionAddress || "",
          inspection_date: order.scheduledDate || "",
        })
      })
      if (res.ok) {
        const data = await res.json()
        setMessage(`✅ Email wysłany do ${data.email_sent_to}`)
      } else {
        const err = await res.json()
        setMessage(`❌ ${err.detail}`)
      }
    } catch {
      setMessage("❌ Błąd wysyłki emaila")
    }
  }

  const startEdit = (inspector: Inspector, e: React.MouseEvent) => {
    e.stopPropagation()
    setEditingId(inspector.id)
    setEditForm({ name: inspector.name, phone: inspector.phone, email: inspector.email || "", pin: "" })
  }

  const cancelEdit = (e: React.MouseEvent) => {
    e.stopPropagation()
    setEditingId(null)
    setEditForm({ name: "", phone: "", email: "", pin: "" })
  }

  const saveEdit = async (id: number, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!editForm.name.trim()) {
      setMessage("❌ Imię i nazwisko nie może być puste")
      return
    }
    const pErr = phoneError(editForm.phone)
    if (pErr) {
      setMessage(`❌ ${pErr}`)
      return
    }
    setLoading(true)
    try {
      const body: Record<string, string> = {
        name: editForm.name.trim(),
        email: editForm.email.trim(),
        phone: editForm.phone.trim(),
      }
      if (editForm.pin.length === 4) body.pin = editForm.pin

      const res = await fetch(`${API_BASE}/admin/inspectors/${id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${adminToken}`
        },
        body: JSON.stringify(body)
      })
      if (res.ok) {
        const result = await res.json()
        const bitrixNote = result.bitrix_updated ? " i zaktualizowany w Bitrix" : ""
        setMessage(`✅ Dane inspektora zaktualizowane${bitrixNote}`)
        setEditingId(null)
        fetchInspectors(adminToken)
      } else {
        const err = await res.json()
        setMessage(`❌ ${err.detail || "Błąd aktualizacji"}`)
      }
    } catch {
      setMessage("❌ Błąd połączenia")
    }
    setLoading(false)
  }

  const selectInspector = (inspector: Inspector) => {
    setSelectedInspector(inspector)
    setOrderSearch("")
    fetchInspectorOrders(inspector.phone)
    // On mobile, auto-hide inspector list when one is selected
    if (window.innerWidth < 1024) {
      setShowInspectorList(false)
    }
  }

  // Client-side order search — matches order number/title, deal ID and status.
  const orderQuery = orderSearch.trim().toLowerCase()
  const filteredOrders = orderQuery
    ? orders.filter(o =>
        (o.TITLE || "").toLowerCase().includes(orderQuery) ||
        String(o.ID).toLowerCase().includes(orderQuery) ||
        (o.status || "").toLowerCase().includes(orderQuery) ||
        statusLabel(o.status).toLowerCase().includes(orderQuery)
      )
    : orders

  // ─── Login Screen ─────────────────────────────────
  if (!authed) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="bg-white p-6 sm:p-8 rounded-2xl shadow-xl w-full max-w-sm border border-gray-100">
        <div className="text-center mb-8">
          <div className="w-14 h-14 sm:w-16 sm:h-16 bg-blue-600 rounded-2xl mx-auto flex items-center justify-center mb-4 shadow-lg shadow-blue-600/20">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            </svg>
          </div>
          <h1 className="text-lg sm:text-xl font-bold text-gray-900">Panel Administracyjny</h1>
          <p className="text-xs sm:text-sm text-gray-500 mt-1">Zarządzanie inspektorami</p>
        </div>
        <div className="space-y-4">
          <input
            type="password"
            placeholder="Hasło administratora"
            value={password}
            onChange={e => setPassword(e.target.value)}
            onKeyDown={e => e.key === "Enter" && adminLogin()}
            className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 text-sm font-medium focus:border-blue-500 focus:ring-0 outline-none transition-colors"
          />
          {message && <p className="text-red-500 text-sm font-medium text-center">{message}</p>}
          <button
            onClick={adminLogin}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-xl font-bold transition-colors shadow-lg shadow-blue-600/20 min-h-[48px]"
          >
            Zaloguj się
          </button>
        </div>

        <div className="mt-6 text-center">
          <a href="/" className="text-xs text-gray-400 hover:text-gray-600 transition-colors">
            ← Powrót do logowania
          </a>
        </div>
      </div>
    </div>
  )

  // ─── Main Admin Dashboard ─────────────────────────
  return (
    <div className="min-h-screen bg-gray-50 p-3 lg:p-6">
      <div className="max-w-6xl mx-auto">

        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-4 sm:mb-6 bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
          <div>
            <h1 className="text-lg lg:text-xl font-bold text-gray-900">Panel Administracyjny</h1>
            <p className="text-[10px] sm:text-xs text-gray-500 mt-0.5">Zarządzanie inspektorami i zleceniami</p>
          </div>
          <div className="flex gap-2 w-full sm:w-auto">
            <button
              onClick={() => setShowAddForm(!showAddForm)}
              className="flex-1 sm:flex-none bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-colors shadow-sm min-h-[44px]"
            >
              + Dodaj
            </button>
            <button
              onClick={logout}
              className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-colors min-h-[44px]"
            >
              Wyloguj
            </button>
          </div>
        </div>

        {/* Message Toast */}
        {message && (
          <div className={`px-4 py-3 rounded-xl mb-4 font-medium text-sm border ${
            message.includes("✅") 
              ? "bg-green-50 text-green-700 border-green-200" 
              : "bg-red-50 text-red-700 border-red-200"
          }`}>
            {message}
          </div>
        )}

        {/* Add Inspector Form */}
        {showAddForm && (
          <div className="bg-white rounded-2xl shadow-sm p-4 sm:p-6 mb-4 sm:mb-6 border border-gray-100">
            <h2 className="font-bold text-base sm:text-lg mb-4 text-gray-900">Nowy Inspektor</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
              <div>
                <label className="text-[10px] font-bold uppercase text-gray-500 mb-1 block tracking-wider">Imię i nazwisko *</label>
                <input
                  type="text"
                  value={newInspector.name}
                  onChange={e => setNewInspector({...newInspector, name: e.target.value})}
                  placeholder="Jan Kowalski"
                  maxLength={MAX_NAME_LEN}
                  className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 text-sm font-medium focus:border-blue-500 outline-none transition-colors"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase text-gray-500 mb-1 block tracking-wider">Numer telefonu *</label>
                <input
                  type="tel"
                  value={newInspector.phone}
                  onChange={e => setNewInspector({...newInspector, phone: e.target.value})}
                  placeholder="790469341"
                  className={`w-full border-2 rounded-xl px-4 py-3 text-sm font-medium outline-none transition-colors ${
                    phoneError(newInspector.phone) ? "border-red-400 focus:border-red-500" : "border-gray-200 focus:border-blue-500"
                  }`}
                />
                {phoneError(newInspector.phone) && (
                  <p className="text-red-500 text-[10px] font-bold mt-1">{phoneError(newInspector.phone)}</p>
                )}
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase text-gray-500 mb-1 block tracking-wider">Email</label>
                <input
                  type="email"
                  value={newInspector.email}
                  onChange={e => setNewInspector({...newInspector, email: e.target.value})}
                  placeholder="jan@example.com"
                  className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 text-sm font-medium focus:border-blue-500 outline-none transition-colors"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase text-gray-500 mb-1 block tracking-wider">Domyślny PIN *</label>
                <input
                  type="text"
                  value={newInspector.pin}
                  onChange={e => setNewInspector({...newInspector, pin: e.target.value.replace(/\D/g, '').slice(0,4)})}
                  placeholder="1234"
                  maxLength={4}
                  className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 text-sm font-medium focus:border-blue-500 outline-none transition-colors"
                />
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button
                onClick={addInspector}
                disabled={loading || !!phoneError(newInspector.phone)}
                className="flex-1 sm:flex-none bg-green-600 hover:bg-green-700 text-white px-6 py-2.5 rounded-xl font-bold text-sm transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px]"
              >
                {loading ? "Dodawanie..." : "Dodaj inspektora"}
              </button>
              <button
                onClick={() => setShowAddForm(false)}
                className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-6 py-2.5 rounded-xl font-bold text-sm transition-colors min-h-[44px]"
              >
                Anuluj
              </button>
            </div>
          </div>
        )}

        {/* Mobile Toggle */}
        {selectedInspector && (
          <div className="lg:hidden mb-3">
            <button
              onClick={() => setShowInspectorList(!showInspectorList)}
              className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 text-sm font-bold text-gray-700 flex justify-between items-center min-h-[48px]"
            >
              <span>{showInspectorList ? "Ukryj listę inspektorów" : `← ${selectedInspector.name} — pokaż listę`}</span>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d={showInspectorList ? "M18 15l-6-6-6 6" : "M6 9l6 6 6-6"} />
              </svg>
            </button>
          </div>
        )}

        {/* Two column layout — stacks on mobile */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">

          {/* Inspector List */}
          <div className={`col-span-1 bg-white rounded-2xl shadow-sm p-3 sm:p-4 border border-gray-100 ${
            !showInspectorList && selectedInspector ? "hidden lg:block" : ""
          }`}>
            <h2 className="font-bold text-sm sm:text-base mb-2 text-gray-900">
              Inspektorzy ({inspectors.length})
            </h2>

            {/* Sort controls */}
            <div className="flex items-center gap-1 mb-3">
              <span className="text-[10px] font-bold uppercase text-gray-400 mr-1">Sortuj:</span>
              {(['name', 'status', 'bitrix'] as const).map(opt => (
                <button
                  key={opt}
                  onClick={() => setSortBy(opt)}
                  className={`text-[10px] px-2.5 py-1 rounded-lg font-bold transition-colors ${
                    sortBy === opt ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {opt === 'name' ? 'A–Z' : opt === 'status' ? 'Status' : 'Bitrix'}
                </button>
              ))}
            </div>

            <div className="space-y-2 sm:space-y-3">
              {inspectors.length === 0 ? (
                <p className="text-gray-400 text-sm text-center py-8">Brak inspektorów</p>
              ) : (
                [...inspectors]
                  .sort((a, b) => {
                    if (sortBy === 'status') {
                      if (a.is_active !== b.is_active) return a.is_active ? -1 : 1
                    } else if (sortBy === 'bitrix') {
                      if (a.bitrix_synced !== b.bitrix_synced) return a.bitrix_synced ? -1 : 1
                    }
                    return a.name.localeCompare(b.name, 'pl')
                  })
                  .map(inspector => (
                  <div
                    key={inspector.id}
                    onClick={() => selectInspector(inspector)}
                    className={`p-3 sm:p-4 rounded-xl border-2 cursor-pointer transition-all min-h-[72px] ${
                      selectedInspector?.id === inspector.id
                        ? "border-blue-500 bg-blue-50"
                        : "border-gray-100 hover:border-gray-300 active:border-blue-300"
                    } ${!inspector.is_active ? "opacity-50" : ""}`}
                  >
                    <div className="flex justify-between items-start">
                      <div className="min-w-0 flex-1">
                        <p className="font-bold text-sm text-gray-900 truncate">{inspector.name}</p>
                        <p className="text-xs text-gray-500 font-mono">{inspector.phone}</p>
                        {inspector.email && (
                          <p className="text-[10px] text-gray-400 truncate">{inspector.email}</p>
                        )}
                      </div>
                      <div className="flex flex-col items-end gap-1 ml-2">
                        <span className={`text-[10px] px-2 py-1 rounded-full font-bold whitespace-nowrap ${
                          inspector.is_active
                            ? "bg-green-100 text-green-700"
                            : "bg-red-100 text-red-500"
                        }`}>
                          {inspector.is_active ? "Aktywny" : "Nieaktywny"}
                        </span>
                        <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold whitespace-nowrap ${
                          inspector.bitrix_synced
                            ? "bg-blue-50 text-blue-500"
                            : "bg-yellow-50 text-yellow-600"
                        }`}>
                          {inspector.bitrix_synced ? "Bitrix ✓" : "Bitrix ⚠"}
                        </span>
                      </div>
                    </div>
                    <div className="flex gap-2 mt-2 flex-wrap">
                      <button
                        onClick={e => startEdit(inspector, e)}
                        className="text-[10px] bg-blue-100 hover:bg-blue-200 text-blue-700 px-3 py-1.5 rounded-lg font-bold transition-colors min-h-[32px]"
                      >
                        Edytuj
                      </button>
                      <button
                        onClick={e => { e.stopPropagation(); resetPin(inspector.id) }}
                        className="text-[10px] bg-yellow-100 hover:bg-yellow-200 text-yellow-700 px-3 py-1.5 rounded-lg font-bold transition-colors min-h-[32px]"
                      >
                        Reset PIN
                      </button>
                      <button
                        onClick={e => { e.stopPropagation(); toggleActive(inspector.id, inspector.is_active) }}
                        className={`text-[10px] px-3 py-1.5 rounded-lg font-bold transition-colors min-h-[32px] ${
                          inspector.is_active
                            ? "bg-red-100 hover:bg-red-200 text-red-600"
                            : "bg-green-100 hover:bg-green-200 text-green-600"
                        }`}
                      >
                        {inspector.is_active ? "Dezaktywuj" : "Aktywuj"}
                      </button>
                      <button
                        onClick={e => { e.stopPropagation(); deleteInspectorPermanent(inspector.id, inspector.name) }}
                        className="text-[10px] bg-red-600 hover:bg-red-700 text-white px-3 py-1.5 rounded-lg font-bold transition-colors min-h-[32px]"
                      >
                        Usuń trwale
                      </button>
                    </div>

                    {/* Inline edit form */}
                    {editingId === inspector.id && (
                      <div
                        onClick={e => e.stopPropagation()}
                        className="mt-3 pt-3 border-t border-gray-200 space-y-2"
                      >
                        <div>
                          <label className="text-[9px] font-bold uppercase text-gray-400 tracking-wider">Imię i nazwisko</label>
                          <input
                            type="text"
                            value={editForm.name}
                            onChange={e => setEditForm({ ...editForm, name: e.target.value })}
                            maxLength={MAX_NAME_LEN}
                            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-xs font-medium focus:border-blue-500 outline-none mt-0.5"
                          />
                        </div>
                        <div>
                          <label className="text-[9px] font-bold uppercase text-gray-400 tracking-wider">Numer telefonu</label>
                          <input
                            type="tel"
                            value={editForm.phone}
                            onChange={e => setEditForm({ ...editForm, phone: e.target.value })}
                            className={`w-full border rounded-lg px-3 py-2 text-xs font-mono font-medium outline-none mt-0.5 ${
                              phoneError(editForm.phone) ? "border-red-400 focus:border-red-500" : "border-gray-300 focus:border-blue-500"
                            }`}
                          />
                          {phoneError(editForm.phone) && (
                            <p className="text-red-500 text-[10px] font-bold mt-1">{phoneError(editForm.phone)}</p>
                          )}
                        </div>
                        <div>
                          <label className="text-[9px] font-bold uppercase text-gray-400 tracking-wider">Email</label>
                          <input
                            type="email"
                            value={editForm.email}
                            onChange={e => setEditForm({ ...editForm, email: e.target.value })}
                            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-xs font-medium focus:border-blue-500 outline-none mt-0.5"
                          />
                        </div>
                        <div>
                          <label className="text-[9px] font-bold uppercase text-gray-400 tracking-wider">Nowy PIN (opcjonalnie)</label>
                          <input
                            type="text"
                            value={editForm.pin}
                            onChange={e => setEditForm({ ...editForm, pin: e.target.value.replace(/\D/g, '').slice(0, 4) })}
                            placeholder="zostaw puste aby nie zmieniać"
                            maxLength={4}
                            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-xs font-medium focus:border-blue-500 outline-none mt-0.5"
                          />
                        </div>
                        <div className="flex gap-2 pt-1">
                          <button
                            onClick={e => saveEdit(inspector.id, e)}
                            disabled={loading || !!phoneError(editForm.phone)}
                            className="flex-1 bg-green-600 hover:bg-green-700 text-white py-2 rounded-lg text-xs font-bold disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                          >
                            {loading ? "Zapisywanie..." : "Zapisz"}
                          </button>
                          <button
                            onClick={cancelEdit}
                            className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 py-2 rounded-lg text-xs font-bold transition-colors"
                          >
                            Anuluj
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                  ))
              )}
            </div>
          </div>

          {/* Orders for selected inspector */}
          <div className={`col-span-1 lg:col-span-2 bg-white rounded-2xl shadow-sm p-3 sm:p-4 border border-gray-100 ${
            showInspectorList && !selectedInspector ? "" : ""
          }`}>
            <h2 className="font-bold text-sm sm:text-base mb-3 sm:mb-4 text-gray-900">
              {selectedInspector
                ? `Zlecenia — ${selectedInspector.name} (${orderQuery ? `${filteredOrders.length}/${orders.length}` : orders.length})`
                : "Wybierz inspektora"}
            </h2>
            {selectedInspector ? (
              <div className="space-y-2 sm:space-y-3">
                {/* Search bar — client-side filter by order number, deal ID, status */}
                {orders.length > 0 && (
                  <div className="relative mb-1">
                    <input
                      type="text"
                      value={orderSearch}
                      onChange={e => setOrderSearch(e.target.value)}
                      placeholder="Szukaj zamówienia..."
                      className="w-full border-2 border-gray-200 rounded-xl pl-9 pr-9 py-2.5 text-sm font-medium focus:border-blue-500 outline-none transition-colors"
                    />
                    <svg
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                      width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                    >
                      <circle cx="11" cy="11" r="8" />
                      <path d="M21 21l-4.35-4.35" />
                    </svg>
                    {orderSearch && (
                      <button
                        onClick={() => setOrderSearch("")}
                        aria-label="Wyczyść wyszukiwanie"
                        className="absolute right-2 top-1/2 -translate-y-1/2 w-6 h-6 flex items-center justify-center text-gray-400 hover:text-gray-700 rounded-full hover:bg-gray-100 transition-colors"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                          <path d="M18 6L6 18M6 6l12 12" />
                        </svg>
                      </button>
                    )}
                  </div>
                )}
                {orders.length === 0 ? (
                  <div className="text-center py-8 sm:py-12">
                    <p className="text-gray-400 text-sm">Brak zleceń</p>
                    <p className="text-gray-300 text-[10px] mt-1">Zlecenia pojawią się po przypisaniu w Bitrix24</p>
                  </div>
                ) : filteredOrders.length === 0 ? (
                  <div className="text-center py-8 sm:py-12">
                    <p className="text-gray-400 text-sm">Brak wyników dla „{orderSearch}”</p>
                    <p className="text-gray-300 text-[10px] mt-1">Spróbuj innego numeru, ID lub statusu</p>
                  </div>
                ) : (
                  filteredOrders.map((order) => (
                    <div key={order.ID} className="p-3 sm:p-4 border-2 border-gray-100 rounded-xl hover:border-gray-200 transition-colors">
                      <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="font-bold text-sm text-gray-900 truncate">{order.TITLE || `Zlecenie #${order.ID}`}</p>
                          <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1">
                            <p className="text-xs text-gray-500 font-mono">ID: {order.ID}</p>
                            {order.DATE_CREATE && (
                              <p className="text-xs text-gray-400">
                                {new Date(order.DATE_CREATE).toLocaleDateString('pl-PL')}
                              </p>
                            )}
                            {order.clientName && (
                              <p className="text-xs text-gray-500">🏢 {order.clientName}</p>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <span className={`text-[10px] px-3 py-1.5 rounded-full font-bold whitespace-nowrap ${
                            order.status === "completed"
                              ? "bg-green-100 text-green-700"
                              : order.status === "scheduled"
                              ? "bg-orange-100 text-orange-700"
                              : order.status === "assigned"
                              ? "bg-blue-100 text-blue-700"
                              : order.status === "in_valuation"
                              ? "bg-purple-100 text-purple-700"
                              : order.status === "closed"
                              ? "bg-gray-100 text-gray-700"
                              : "bg-sky-100 text-sky-700"
                          }`}>
                            {statusLabel(order.status)}
                          </span>
                          <button
                            onClick={() => sendNotification(selectedInspector!.phone, order)}
                            className="text-[10px] bg-blue-100 hover:bg-blue-200 text-blue-700 px-3 py-1.5 rounded-lg font-bold transition-colors min-h-[32px] whitespace-nowrap"
                          >
                            📧 Powiadom
                          </button>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            ) : (
              <div className="text-center py-12 sm:py-16">
                <div className="w-14 h-14 sm:w-16 sm:h-16 bg-gray-100 rounded-2xl mx-auto flex items-center justify-center mb-4">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2">
                    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/>
                    <circle cx="9" cy="7" r="4"/>
                    <path d="M22 21v-2a4 4 0 0 0-3-3.87"/>
                    <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                  </svg>
                </div>
                <p className="text-gray-400 text-sm">Kliknij inspektora po lewej</p>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="mt-6 text-center">
          <a href="/" className="text-xs text-gray-400 hover:text-gray-600 transition-colors">
            ← Powrót do aplikacji
          </a>
        </div>
      </div>
    </div>
  )
}
