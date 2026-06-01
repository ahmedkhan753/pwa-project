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

// Section / page chrome shared across both admin/reports views. Mirrors the
// CollapsibleSection header style from src/app/report/[dealId]/page.tsx so
// the admin tooling stays visually aligned with the report it edits.
function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="min-h-screen px-3 py-4 sm:px-6 sm:py-6"
      style={{ background: "#F5F5F7", color: "#1D1D1F" }}
    >
      <div className="max-w-4xl mx-auto flex flex-col gap-4">{children}</div>
    </div>
  )
}

function SectionCard({
  eyebrow, icon, title, subtitle, children,
}: {
  eyebrow?: string
  icon?: string
  title: string
  subtitle?: string
  children: React.ReactNode
}) {
  return (
    <section
      className="bg-white relative overflow-hidden transition-shadow"
      style={{
        borderRadius: 12,
        border: "1px solid #E8E8ED",
        boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
      }}
    >
      {/* Left red accent bar */}
      <span
        aria-hidden
        className="absolute left-0 top-0 bottom-0"
        style={{ width: 3, background: "#B71C1C", borderRadius: "0 3px 3px 0" }}
      />
      <div className="flex items-center gap-3 sm:gap-4 px-5 sm:px-7 pt-5 sm:pt-6 pb-4">
        {icon && (
          <div
            className="flex items-center justify-center flex-shrink-0"
            style={{
              width: 42, height: 42, borderRadius: 8,
              background: "#FEF2F2", color: "#B71C1C", fontSize: 17,
            }}
          >
            <i className={icon} />
          </div>
        )}
        <div className="min-w-0 flex-1">
          {eyebrow && (
            <div
              className="font-bold uppercase"
              style={{ fontSize: 11, color: "#B71C1C", letterSpacing: 2, lineHeight: 1.2, marginBottom: 2 }}
            >
              {eyebrow}
            </div>
          )}
          <div className="font-bold" style={{ fontSize: 19, color: "#1D1D1F", lineHeight: 1.3 }}>
            {title}
          </div>
          {subtitle && (
            <div className="text-xs sm:text-sm mt-1" style={{ color: "#86868B" }}>
              {subtitle}
            </div>
          )}
        </div>
      </div>
      <div
        className="px-5 sm:px-7 pb-5 sm:pb-6 pt-2"
        style={{ borderTop: "1px solid #E8E8ED" }}
      >
        {children}
      </div>
    </section>
  )
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

  // Auth guard.
  useEffect(() => {
    const t = sessionStorage.getItem("admin_token")
    if (!t) {
      router.push("/admin")
      return
    }
    setToken(t)
  }, [router])

  // Debounced search.
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
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json: ListResponse = await res.json()
      setData(json)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      setError(`Nie udało się pobrać listy: ${msg}`)
    } finally {
      setLoading(false)
    }
  }, [token, page, debouncedSearch, router])

  useEffect(() => { fetchList() }, [fetchList])

  const totalPages = useMemo(
    () => (data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1),
    [data]
  )

  if (!token) {
    return (
      <PageShell>
        <p className="text-sm text-center py-12" style={{ color: "#86868B" }}>
          Przekierowywanie…
        </p>
      </PageShell>
    )
  }

  return (
    <PageShell>
      {/* Header card */}
      <header
        className="bg-white px-5 sm:px-7 py-5 sm:py-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4"
        style={{
          borderRadius: 12,
          border: "1px solid #E8E8ED",
          boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
        }}
      >
        <div className="min-w-0">
          <div
            className="font-bold uppercase mb-1.5"
            style={{ fontSize: 11, color: "#B71C1C", letterSpacing: 2 }}
          >
            Panel administracyjny
          </div>
          <h1
            className="font-bold"
            style={{ fontSize: 24, color: "#1D1D1F", lineHeight: 1.2 }}
          >
            Raporty — edycja
          </h1>
          <p className="text-xs sm:text-sm mt-1" style={{ color: "#86868B" }}>
            Edycja danych Condition Report (tekst / liczby / enum)
          </p>
        </div>
        <a
          href="/admin"
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold transition-colors"
          style={{
            minHeight: 44,
            borderRadius: 10,
            background: "#F5F5F7",
            color: "#1D1D1F",
            border: "1px solid #E8E8ED",
          }}
        >
          <i className="fa-solid fa-arrow-left" style={{ fontSize: 12 }} />
          Panel
        </a>
      </header>

      {/* Search card */}
      <div
        className="bg-white px-4 sm:px-5 py-3 sm:py-4 flex items-center gap-3"
        style={{
          borderRadius: 12,
          border: "1px solid #E8E8ED",
          boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
        }}
      >
        <i
          className="fa-solid fa-magnifying-glass"
          style={{ fontSize: 14, color: "#86868B" }}
          aria-hidden
        />
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Szukaj po ID zlecenia lub tytule…"
          className="flex-1 outline-none bg-white text-sm font-medium placeholder:text-gray-400"
          style={{ color: "#1D1D1F", minHeight: 36 }}
        />
        {search && (
          <button
            onClick={() => setSearch("")}
            className="text-xs font-semibold"
            style={{ color: "#86868B" }}
            aria-label="Wyczyść"
          >
            <i className="fa-solid fa-xmark" />
          </button>
        )}
      </div>

      {/* Error */}
      {error && (
        <div
          className="px-4 py-3 text-sm font-medium flex items-center gap-3"
          style={{
            background: "#FEF2F2",
            color: "#B71C1C",
            border: "1px solid rgba(183,28,28,0.2)",
            borderRadius: 12,
          }}
        >
          <i className="fa-solid fa-triangle-exclamation" />
          <span className="flex-1">{error}</span>
          <button
            onClick={fetchList}
            className="font-bold underline hover:no-underline"
          >
            Spróbuj ponownie
          </button>
        </div>
      )}

      {/* Loading skeleton */}
      {loading && (
        <div className="flex flex-col gap-2">
          {[0, 1, 2, 3].map(i => (
            <div
              key={i}
              className="bg-white animate-pulse"
              style={{
                borderRadius: 12,
                border: "1px solid #E8E8ED",
                height: 76,
              }}
            />
          ))}
        </div>
      )}

      {/* Empty */}
      {!loading && data && data.items.length === 0 && (
        <SectionCard
          eyebrow="Brak wyników"
          icon="fa-solid fa-folder-open"
          title={
            debouncedSearch
              ? `Brak raportów dla „${debouncedSearch}”`
              : "Wszystkie raporty zostały sprawdzone"
          }
          subtitle={
            debouncedSearch
              ? "Spróbuj innego ID lub fragmentu tytułu."
              : "Nowe raporty pojawią się tutaj po przesłaniu inspekcji."
          }
        >
          <div className="py-2" />
        </SectionCard>
      )}

      {/* List */}
      {!loading && data && data.items.length > 0 && (
        <ul className="flex flex-col gap-2">
          {data.items.map(row => (
            <li
              key={row.deal_id}
              onClick={() => router.push(`/admin/reports/${row.deal_id}`)}
              className="bg-white flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 px-4 sm:px-5 py-4 cursor-pointer group transition-all"
              style={{
                borderRadius: 12,
                border: "1px solid #E8E8ED",
                boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
              }}
              onMouseEnter={e => {
                e.currentTarget.style.borderColor = "rgba(183,28,28,0.3)"
                e.currentTarget.style.boxShadow = "0 4px 16px rgba(0,0,0,0.06)"
              }}
              onMouseLeave={e => {
                e.currentTarget.style.borderColor = "#E8E8ED"
                e.currentTarget.style.boxShadow = "0 1px 3px rgba(0,0,0,0.04)"
              }}
            >
              {/* Deal ID badge */}
              <div
                className="flex items-center justify-center flex-shrink-0 font-bold"
                style={{
                  width: 56, height: 56, borderRadius: 10,
                  background: "#FEF2F2", color: "#B71C1C",
                  fontSize: 13, letterSpacing: 0.5,
                }}
              >
                #{row.deal_id}
              </div>

              <div className="flex-1 min-w-0">
                <div
                  className="font-semibold truncate"
                  style={{ fontSize: 15, color: "#1D1D1F" }}
                >
                  {row.title || (
                    <span className="italic" style={{ color: "#86868B" }}>
                      Bez tytułu
                    </span>
                  )}
                </div>
                <div
                  className="mt-1 flex items-center gap-2 text-xs"
                  style={{ color: "#86868B" }}
                >
                  <i className="fa-regular fa-clock" style={{ fontSize: 11 }} />
                  <span>Aktualizacja: {formatDate(row.updated_at)}</span>
                </div>
              </div>

              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  onClick={e => {
                    e.stopPropagation()
                    router.push(`/admin/kosztorys/${row.deal_id}`)
                  }}
                  className="inline-flex items-center justify-center gap-2 font-bold text-sm transition-transform active:scale-[0.98]"
                  style={{
                    minHeight: 44,
                    borderRadius: 10,
                    padding: "10px 16px",
                    background: "#fff",
                    color: "#B71C1C",
                    border: "1.5px solid #B71C1C",
                  }}
                >
                  Kosztorys
                  <i className="fa-solid fa-coins" style={{ fontSize: 12 }} />
                </button>
                <button
                  onClick={e => {
                    e.stopPropagation()
                    router.push(`/admin/reports/${row.deal_id}`)
                  }}
                  className="inline-flex items-center justify-center gap-2 font-bold text-sm transition-transform active:scale-[0.98]"
                  style={{
                    minHeight: 44,
                    borderRadius: 10,
                    padding: "10px 16px",
                    background: "#B71C1C",
                    color: "#fff",
                    boxShadow: "0 2px 6px rgba(183,28,28,0.18)",
                  }}
                >
                  Edytuj
                  <i className="fa-solid fa-pen-to-square" style={{ fontSize: 12 }} />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* Pagination */}
      {data && data.total > PAGE_SIZE && (
        <div
          className="bg-white flex items-center justify-between gap-3 px-4 sm:px-5 py-3 sm:py-4"
          style={{
            borderRadius: 12,
            border: "1px solid #E8E8ED",
            boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
          }}
        >
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page <= 1 || loading}
            className="inline-flex items-center gap-2 text-sm font-semibold transition-colors disabled:cursor-not-allowed"
            style={{
              minHeight: 40,
              borderRadius: 10,
              padding: "8px 14px",
              background: page <= 1 ? "#F5F5F7" : "#fff",
              color: page <= 1 ? "#86868B" : "#1D1D1F",
              border: "1px solid #E8E8ED",
              opacity: page <= 1 ? 0.6 : 1,
            }}
          >
            <i className="fa-solid fa-arrow-left" style={{ fontSize: 11 }} />
            Poprzednia
          </button>
          <span className="text-xs sm:text-sm font-medium text-center" style={{ color: "#86868B" }}>
            Strona <span style={{ color: "#1D1D1F" }}>{page}</span> z {totalPages}
            <span className="hidden sm:inline"> · {data.total} zleceń</span>
          </span>
          <button
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages || loading}
            className="inline-flex items-center gap-2 text-sm font-semibold transition-colors disabled:cursor-not-allowed"
            style={{
              minHeight: 40,
              borderRadius: 10,
              padding: "8px 14px",
              background: page >= totalPages ? "#F5F5F7" : "#fff",
              color: page >= totalPages ? "#86868B" : "#1D1D1F",
              border: "1px solid #E8E8ED",
              opacity: page >= totalPages ? 0.6 : 1,
            }}
          >
            Następna
            <i className="fa-solid fa-arrow-right" style={{ fontSize: 11 }} />
          </button>
        </div>
      )}
    </PageShell>
  )
}
