"use client"
import { useState, useEffect } from "react"

interface Inspector {
  id: number
  name: string
  phone: string
  email: string
  is_active: boolean
}

interface DealOrder {
  ID: string
  TITLE: string
  STAGE_ID: string
  DATE_CREATE: string
  status: string
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"

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
      if (res.ok) {
        const data = await res.json()
        setInspectors(data)
      }
    } catch (e) {
      console.error("Failed to fetch inspectors:", e)
    }
  }

  const fetchInspectorOrders = async (phone: string) => {
    try {
      const res = await fetch(`${API_BASE}/admin/inspectors/${phone}/orders`, {
        headers: { Authorization: `Bearer ${adminToken}` }
      })
      if (res.ok) {
        const data = await res.json()
        setOrders(data)
      }
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
        setMessage("✅ Inspektor dodany pomyślnie!")
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
        fetchInspectors(adminToken)
        setMessage(isActive ? "✅ Inspektor dezaktywowany" : "✅ Inspektor aktywowany")
      }
    } catch {
      setMessage("❌ Błąd zmiany statusu")
    }
  }

  // ─── Login Screen ─────────────────────────────────
  if (!authed) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="bg-white p-8 rounded-2xl shadow-xl w-96 border border-gray-100">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-blue-600 rounded-2xl mx-auto flex items-center justify-center mb-4 shadow-lg shadow-blue-600/20">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            </svg>
          </div>
          <h1 className="text-xl font-bold text-gray-900">Panel Administracyjny</h1>
          <p className="text-sm text-gray-500 mt-1">Zarządzanie inspektorami</p>
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
            className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-xl font-bold transition-colors shadow-lg shadow-blue-600/20"
          >
            Zaloguj się
          </button>
        </div>
      </div>
    </div>
  )

  // ─── Main Admin Dashboard ─────────────────────────
  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-6">
      <div className="max-w-7xl mx-auto">

        {/* Header */}
        <div className="flex justify-between items-center mb-6 bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Panel Administracyjny</h1>
            <p className="text-xs text-gray-500 mt-0.5">Zarządzanie inspektorami i zleceniami</p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => setShowAddForm(!showAddForm)}
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-xl text-sm font-bold transition-colors shadow-sm"
            >
              + Dodaj inspektora
            </button>
            <button
              onClick={logout}
              className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2.5 rounded-xl text-sm font-bold transition-colors"
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
          <div className="bg-white rounded-2xl shadow-sm p-6 mb-6 border border-gray-100">
            <h2 className="font-bold text-lg mb-4 text-gray-900">Nowy Inspektor</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-bold uppercase text-gray-500 mb-1 block tracking-wider">Imię i nazwisko *</label>
                <input
                  type="text"
                  value={newInspector.name}
                  onChange={e => setNewInspector({...newInspector, name: e.target.value})}
                  placeholder="Jan Kowalski"
                  className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 text-sm font-medium focus:border-blue-500 outline-none transition-colors"
                />
              </div>
              <div>
                <label className="text-xs font-bold uppercase text-gray-500 mb-1 block tracking-wider">Numer telefonu *</label>
                <input
                  type="tel"
                  value={newInspector.phone}
                  onChange={e => setNewInspector({...newInspector, phone: e.target.value})}
                  placeholder="790469341"
                  className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 text-sm font-medium focus:border-blue-500 outline-none transition-colors"
                />
              </div>
              <div>
                <label className="text-xs font-bold uppercase text-gray-500 mb-1 block tracking-wider">Email</label>
                <input
                  type="email"
                  value={newInspector.email}
                  onChange={e => setNewInspector({...newInspector, email: e.target.value})}
                  placeholder="jan@example.com"
                  className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 text-sm font-medium focus:border-blue-500 outline-none transition-colors"
                />
              </div>
              <div>
                <label className="text-xs font-bold uppercase text-gray-500 mb-1 block tracking-wider">Domyślny PIN *</label>
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
                disabled={loading}
                className="bg-green-600 hover:bg-green-700 text-white px-6 py-2.5 rounded-xl font-bold text-sm transition-colors shadow-sm disabled:opacity-50"
              >
                {loading ? "Dodawanie..." : "Dodaj inspektora"}
              </button>
              <button
                onClick={() => setShowAddForm(false)}
                className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-6 py-2.5 rounded-xl font-bold text-sm transition-colors"
              >
                Anuluj
              </button>
            </div>
          </div>
        )}

        {/* Two column layout */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

          {/* Inspector List */}
          <div className="col-span-1 bg-white rounded-2xl shadow-sm p-4 border border-gray-100">
            <h2 className="font-bold text-base mb-4 text-gray-900">
              Inspektorzy ({inspectors.length})
            </h2>
            <div className="space-y-3">
              {inspectors.length === 0 ? (
                <p className="text-gray-400 text-sm text-center py-8">Brak inspektorów</p>
              ) : (
                inspectors.map(inspector => (
                  <div
                    key={inspector.id}
                    onClick={() => {
                      setSelectedInspector(inspector)
                      fetchInspectorOrders(inspector.phone)
                    }}
                    className={`p-3 rounded-xl border-2 cursor-pointer transition-all ${
                      selectedInspector?.id === inspector.id
                        ? "border-blue-500 bg-blue-50"
                        : "border-gray-100 hover:border-gray-300"
                    } ${!inspector.is_active ? "opacity-50" : ""}`}
                  >
                    <div className="flex justify-between items-start">
                      <div className="min-w-0">
                        <p className="font-bold text-sm text-gray-900 truncate">{inspector.name}</p>
                        <p className="text-xs text-gray-500 font-mono">{inspector.phone}</p>
                        {inspector.email && (
                          <p className="text-xs text-gray-400 truncate">{inspector.email}</p>
                        )}
                      </div>
                      <span className={`text-[10px] px-2 py-1 rounded-full font-bold whitespace-nowrap ml-2 ${
                        inspector.is_active
                          ? "bg-green-100 text-green-700"
                          : "bg-red-100 text-red-500"
                      }`}>
                        {inspector.is_active ? "Aktywny" : "Nieaktywny"}
                      </span>
                    </div>
                    <div className="flex gap-2 mt-2">
                      <button
                        onClick={e => { e.stopPropagation(); resetPin(inspector.id) }}
                        className="text-[10px] bg-yellow-100 hover:bg-yellow-200 text-yellow-700 px-2 py-1 rounded-lg font-bold transition-colors"
                      >
                        Reset PIN
                      </button>
                      <button
                        onClick={e => { e.stopPropagation(); toggleActive(inspector.id, inspector.is_active) }}
                        className={`text-[10px] px-2 py-1 rounded-lg font-bold transition-colors ${
                          inspector.is_active
                            ? "bg-red-100 hover:bg-red-200 text-red-600"
                            : "bg-green-100 hover:bg-green-200 text-green-600"
                        }`}
                      >
                        {inspector.is_active ? "Dezaktywuj" : "Aktywuj"}
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Orders for selected inspector */}
          <div className="col-span-1 md:col-span-2 bg-white rounded-2xl shadow-sm p-4 border border-gray-100">
            <h2 className="font-bold text-base mb-4 text-gray-900">
              {selectedInspector
                ? `Zlecenia — ${selectedInspector.name} (${orders.length})`
                : "Wybierz inspektora, aby zobaczyć zlecenia"}
            </h2>
            {selectedInspector ? (
              <div className="space-y-3">
                {orders.length === 0 ? (
                  <div className="text-center py-12">
                    <p className="text-gray-400 text-sm">Brak zleceń dla tego inspektora</p>
                    <p className="text-gray-300 text-xs mt-1">Zlecenia pojawią się po przypisaniu w Bitrix24</p>
                  </div>
                ) : (
                  orders.map((order) => (
                    <div key={order.ID} className="p-4 border-2 border-gray-100 rounded-xl hover:border-gray-200 transition-colors">
                      <div className="flex justify-between items-center">
                        <div className="min-w-0">
                          <p className="font-bold text-sm text-gray-900 truncate">{order.TITLE || `Zlecenie #${order.ID}`}</p>
                          <div className="flex gap-3 mt-1">
                            <p className="text-xs text-gray-500 font-mono">ID: {order.ID}</p>
                            {order.DATE_CREATE && (
                              <p className="text-xs text-gray-400">
                                {new Date(order.DATE_CREATE).toLocaleDateString('pl-PL')}
                              </p>
                            )}
                          </div>
                        </div>
                        <span className={`text-[10px] px-3 py-1.5 rounded-full font-bold whitespace-nowrap ml-3 ${
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
                          {order.status === "new" ? "Nowe" :
                           order.status === "assigned" ? "Przypisane" :
                           order.status === "scheduled" ? "Zaplanowane" :
                           order.status === "completed" ? "Zakończone" :
                           order.status === "in_valuation" ? "W wycenie" :
                           order.status === "closed" ? "Zamknięte" :
                           order.status === "lost" ? "Utracone" :
                           order.status}
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            ) : (
              <div className="text-center py-16">
                <div className="w-16 h-16 bg-gray-100 rounded-2xl mx-auto flex items-center justify-center mb-4">
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
      </div>
    </div>
  )
}
