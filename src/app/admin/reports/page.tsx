"use client"
import { useCallback, useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"

interface ReportRow {
  deal_id: number
  title: string
  updated_at: string | null
  has_data: Record<string, boolean>
}

interface ListResponse {
  items: ReportRow[]
  page: number
  limit: number
  total: number
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"
const PAGE_SIZE = 50

const formatDate = (iso: string | null): string => {
  if (!iso) return "—"
  try {
    const d = new Date(iso)
    return d.toLocaleString("pl-PL", {
      day: "2-digit", month: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    })
  } catch {
    return iso
  }
}

export default function AdminReportsListPage() {
  const router = useRouter()
  const [token, setToken] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState("")
  const [debouncedSearch, setDebouncedSearch] = useState("")
  const [data, setData] = useState<ListResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  // Auth guard — read once on mount.
  useEffect(() => {
    const t = sessionStorage.getItem("admin_token")
    if (!t) {
      router.push("/admin")
      return
    }
    setToken(t)
  }, [router])

  // Debounce search input by 300ms.
  useEffect(() => {
    const h = setTimeout(() => {
      setDebouncedSearch(search.trim())
      setPage(1)
    }, 300)
    return () => clearTimeout(h)
  }, [search])

  const fetchList = useCallback(async () => {
    if (!token) return
    setLoading(true)
    setError("")
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(PAGE_SIZE),
      })
      if (debouncedSearch) params.set("search", debouncedSearch)
      const res = await fetch(`${API_BASE}/admin/reports?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.status === 401) {
        sessionStorage.removeItem("admin_token")
        router.push("/admin")
        return
      }
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`)
      }
      const json: ListResponse = await res.json()
      setData(json)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      setError(`Nie udało się pobrać listy: ${msg}`)
    } finally {
      setLoading(false)
    }
  }, [token, page, debouncedSearch, router])

  useEffect(() => {
    fetchList()
  }, [fetchList])

  const totalPages = useMemo(
    () => (data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1),
    [data]
  )

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-sm text-gray-500">Przekierowywanie…</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 p-3 lg:p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-4 sm:mb-6 bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
          <div>
            <h1 className="text-lg lg:text-xl font-bold text-gray-900">Raporty — edycja</h1>
            <p className="text-[10px] sm:text-xs text-gray-500 mt-0.5">
              Edycja danych Condition Report (tekst / liczby / enum)
            </p>
          </div>
          <a
            href="/admin"
            className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-colors min-h-[44px] inline-flex items-center"
          >
            ← Panel
          </a>
        </div>

        {/* Search */}
        <div className="bg-white rounded-2xl shadow-sm p-3 sm:p-4 border border-gray-100 mb-4">
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Szukaj po ID zlecenia lub tytule…"
            className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 text-sm font-medium focus:border-blue-500 outline-none transition-colors min-h-[44px]"
          />
        </div>

        {/* Error */}
        {error && (
          <div className="bg-red-50 text-red-700 border border-red-200 rounded-xl px-4 py-3 mb-4 text-sm font-medium">
            {error}
            <button
              onClick={fetchList}
              className="ml-3 underline hover:no-underline font-bold"
            >
              Spróbuj ponownie
            </button>
          </div>
        )}

        {/* List */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          {loading && (
            <div className="p-8 text-center text-sm text-gray-500">Ładowanie…</div>
          )}

          {!loading && data && data.items.length === 0 && (
            <div className="p-12 text-center text-sm text-gray-400">
              {debouncedSearch
                ? `Brak wyników dla „${debouncedSearch}”`
                : "Brak raportów do edycji"}
            </div>
          )}

          {!loading && data && data.items.length > 0 && (
            <ul className="divide-y divide-gray-100">
              {data.items.map(row => (
                <li
                  key={row.deal_id}
                  className="flex flex-col sm:flex-row sm:items-center gap-3 p-4 hover:bg-gray-50 transition-colors cursor-pointer"
                  onClick={() => router.push(`/admin/reports/${row.deal_id}`)}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2 flex-wrap">
                      <span className="font-bold text-sm text-gray-900">#{row.deal_id}</span>
                      <span className="text-sm text-gray-700 truncate">
                        {row.title || <em className="text-gray-400">bez tytułu</em>}
                      </span>
                    </div>
                    <div className="text-[11px] text-gray-500 mt-1">
                      Aktualizacja: {formatDate(row.updated_at)}
                    </div>
                  </div>
                  <button
                    onClick={e => {
                      e.stopPropagation()
                      router.push(`/admin/reports/${row.deal_id}`)
                    }}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl text-xs font-bold transition-colors min-h-[40px] sm:flex-none w-full sm:w-auto"
                  >
                    Edytuj
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Pagination */}
        {data && data.total > PAGE_SIZE && (
          <div className="flex items-center justify-between mt-4 bg-white rounded-2xl shadow-sm p-3 border border-gray-100">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page <= 1 || loading}
              className="bg-gray-100 hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed text-gray-700 px-4 py-2 rounded-xl text-xs font-bold transition-colors min-h-[40px]"
            >
              ← Poprzednia
            </button>
            <span className="text-xs sm:text-sm font-medium text-gray-500">
              Strona {page} z {totalPages} · {data.total} zleceń
            </span>
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages || loading}
              className="bg-gray-100 hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed text-gray-700 px-4 py-2 rounded-xl text-xs font-bold transition-colors min-h-[40px]"
            >
              Następna →
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
