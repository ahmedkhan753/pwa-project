"use client"
import { useCallback, useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"

interface SchemaEntry {
  type: "number" | "enum" | "text" | "structured"
  label: string
  options?: string[]
  min?: number
  max?: number
}

interface EditPayload {
  deal_id: number
  title: string
  vehicle: Record<string, unknown>
  paint: Record<string, unknown>
  equipment: Record<string, unknown>
  full_equipment: Record<string, unknown>
  tires: Record<string, unknown>
  mechanical: Record<string, unknown>
  exterior_damages: unknown[]
  interior_damages: unknown[]
  notes: Record<string, unknown>
  bitrix_extras: Record<string, string>
  schema: Record<string, SchemaEntry>
  updated_at?: string | null
}

interface SaveResponse {
  success: boolean
  deal_id: number
  applied: number
  audit_rows: number
  bitrix_fields_synced: string[]
  warnings: string[]
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"

const SECTION_ROOTS: Array<{ root: string; title: string; subtitle?: string }> = [
  { root: "vehicle",        title: "Dane pojazdu" },
  { root: "paint",          title: "Pomiar lakieru", subtitle: "Wartości µm — wybór z listy" },
  { root: "bitrix_extras",  title: "Wyposażenie i komentarze", subtitle: "Zapisywane bezpośrednio w Bitrix24" },
]

// Walk a dotted path through the data object. Components are split by '.';
// numeric components index into arrays.
const getByPath = (root: Record<string, unknown> | unknown[] | null, parts: string[]): unknown => {
  let cur: unknown = root
  for (const p of parts) {
    if (cur === null || cur === undefined) return undefined
    if (/^\d+$/.test(p)) {
      const idx = Number(p)
      if (!Array.isArray(cur)) return undefined
      cur = cur[idx]
    } else {
      if (typeof cur !== "object" || Array.isArray(cur)) return undefined
      cur = (cur as Record<string, unknown>)[p]
    }
  }
  return cur
}

const toInputString = (v: unknown): string => {
  if (v === null || v === undefined) return ""
  if (typeof v === "object") return JSON.stringify(v)
  return String(v)
}

// Lightweight diff: returns the typed value the user expects, used to decide
// whether the current input is back to its original. Numbers are compared as
// numbers (so "100" and 100 match) and everything else as strings.
const isUnchanged = (original: unknown, current: unknown, type: SchemaEntry["type"]): boolean => {
  if (type === "number") {
    if (current === "" || current === null || current === undefined) {
      return original === null || original === undefined || original === ""
    }
    return Number(original) === Number(current)
  }
  return toInputString(original) === toInputString(current)
}

const coerceForApi = (raw: string, type: SchemaEntry["type"]): unknown => {
  if (type === "number") {
    if (raw === "") return null
    const n = Number(raw)
    return Number.isFinite(n) ? n : raw
  }
  return raw
}

// Long-text heuristic — comment / equipment / "uszkodzenia" fields and any
// existing value >100 chars get a textarea instead of a plain input.
const wantsTextarea = (path: string, value: unknown): boolean => {
  const lower = path.toLowerCase()
  if (lower.includes("komentarz")) return true
  if (lower.includes("wyposazenie")) return true
  if (lower.includes("czynniki")) return true
  if (typeof value === "string" && value.length > 100) return true
  return false
}

export default function AdminReportEditPage({ params }: { params: { dealId: string } }) {
  const router = useRouter()
  const dealId = Number(params.dealId)

  const [token, setToken] = useState<string | null>(null)
  const [data, setData] = useState<EditPayload | null>(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [toast, setToast] = useState<{ kind: "ok" | "err" | "warn"; msg: string } | null>(null)
  const [changes, setChanges] = useState<Record<string, unknown>>({})

  // Auth guard.
  useEffect(() => {
    const t = sessionStorage.getItem("admin_token")
    if (!t) {
      router.push("/admin")
      return
    }
    setToken(t)
  }, [router])

  const fetchEdit = useCallback(async () => {
    if (!token) return
    setLoading(true)
    setError("")
    try {
      const res = await fetch(`${API_BASE}/admin/reports/${dealId}/edit`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.status === 401) {
        sessionStorage.removeItem("admin_token")
        router.push("/admin")
        return
      }
      if (!res.ok) {
        const txt = await res.text()
        throw new Error(`HTTP ${res.status}: ${txt}`)
      }
      const json: EditPayload = await res.json()
      setData(json)
      setChanges({})
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      setError(msg)
    } finally {
      setLoading(false)
    }
  }, [token, dealId, router])

  useEffect(() => {
    fetchEdit()
  }, [fetchEdit])

  // Auto-clear toast.
  useEffect(() => {
    if (!toast) return
    const h = setTimeout(() => setToast(null), 4000)
    return () => clearTimeout(h)
  }, [toast])

  const schemaPaths = useMemo(() => Object.keys(data?.schema || {}).sort(), [data])

  const originalValueFor = useCallback(
    (path: string): unknown => {
      if (!data) return undefined
      const parts = path.split(".")
      const root = parts[0] as keyof EditPayload
      const blob = data[root]
      if (blob === undefined || blob === null) return undefined
      return getByPath(blob as Record<string, unknown> | unknown[], parts.slice(1))
    },
    [data]
  )

  const onFieldChange = (path: string, schema: SchemaEntry, raw: string) => {
    const coerced = coerceForApi(raw, schema.type)
    const orig = originalValueFor(path)
    setChanges(prev => {
      const next = { ...prev }
      if (isUnchanged(orig, coerced, schema.type)) {
        delete next[path]
      } else {
        next[path] = coerced
      }
      return next
    })
  }

  const resetField = (path: string) => {
    setChanges(prev => {
      const next = { ...prev }
      delete next[path]
      return next
    })
  }

  const resetAll = () => setChanges({})

  const changedPaths = Object.keys(changes)

  const save = async () => {
    if (!token || !data || changedPaths.length === 0) return
    const ok = window.confirm(
      `Zastosować ${changedPaths.length} zmian dla zlecenia #${dealId}?`
    )
    if (!ok) return

    setSaving(true)
    try {
      const payload = {
        changes: changedPaths.map(p => ({ path: p, value: changes[p] })),
      }
      const res = await fetch(`${API_BASE}/admin/reports/${dealId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      })
      if (res.status === 401) {
        sessionStorage.removeItem("admin_token")
        router.push("/admin")
        return
      }
      if (res.status >= 500) {
        setToast({ kind: "err", msg: "Błąd serwera. Spróbuj ponownie." })
        return
      }
      if (!res.ok) {
        const body = await res.json().catch(() => ({ detail: `HTTP ${res.status}` }))
        const msg = typeof body.detail === "string" ? body.detail : JSON.stringify(body.detail)
        setToast({ kind: "err", msg: `Błąd walidacji: ${msg}` })
        return
      }
      const result: SaveResponse = await res.json()
      if (result.warnings && result.warnings.length > 0) {
        setToast({
          kind: "warn",
          msg: `Zapisano w bazie (${result.applied}), ale: ${result.warnings.join("; ")}`,
        })
      } else {
        setToast({ kind: "ok", msg: `Zapisano ${result.applied} zmian` })
      }
      // Reload to pick up server-side state.
      await fetchEdit()
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      setToast({ kind: "err", msg: `Błąd sieci: ${msg}` })
    } finally {
      setSaving(false)
    }
  }

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-sm text-gray-500">Przekierowywanie…</p>
      </div>
    )
  }

  const renderField = (path: string, schema: SchemaEntry) => {
    const orig = originalValueFor(path)
    const isChanged = path in changes
    const current = isChanged ? changes[path] : orig
    const inputStr = toInputString(current)

    if (schema.type === "structured") {
      // v1: read-only preview only.
      return (
        <div className="text-xs text-gray-500 italic bg-gray-50 border border-dashed border-gray-200 rounded-lg px-3 py-2">
          Edytowanie tej sekcji niedostępne w v1
        </div>
      )
    }

    if (schema.type === "enum") {
      const opts = schema.options || []
      // Defensive: always include the current value so we never silently
      // wipe legacy / out-of-spec data.
      const currentStr = inputStr
      const merged = opts.includes(currentStr) ? opts : [...opts, currentStr]
      return (
        <select
          value={inputStr}
          onChange={e => onFieldChange(path, schema, e.target.value)}
          className="w-full border-2 border-gray-200 rounded-xl px-3 py-2.5 text-sm font-medium focus:border-blue-500 outline-none transition-colors min-h-[44px] bg-white text-gray-900"
        >
          {merged.map(opt => (
            <option key={opt} value={opt}>
              {opt === "" ? "— brak —" : opt}
            </option>
          ))}
        </select>
      )
    }

    if (schema.type === "number") {
      return (
        <input
          type="number"
          value={inputStr}
          min={schema.min}
          max={schema.max}
          onChange={e => onFieldChange(path, schema, e.target.value)}
          className="w-full border-2 border-gray-200 rounded-xl px-3 py-2.5 text-sm font-medium focus:border-blue-500 outline-none transition-colors min-h-[44px] bg-white text-gray-900 placeholder:text-gray-400"
        />
      )
    }

    // text
    if (wantsTextarea(path, orig)) {
      return (
        <textarea
          value={inputStr}
          rows={4}
          onChange={e => onFieldChange(path, schema, e.target.value)}
          className="w-full border-2 border-gray-200 rounded-xl px-3 py-2.5 text-sm font-medium focus:border-blue-500 outline-none transition-colors bg-white text-gray-900 placeholder:text-gray-400"
        />
      )
    }
    return (
      <input
        type="text"
        value={inputStr}
        onChange={e => onFieldChange(path, schema, e.target.value)}
        className="w-full border-2 border-gray-200 rounded-xl px-3 py-2.5 text-sm font-medium focus:border-blue-500 outline-none transition-colors min-h-[44px] bg-white text-gray-900 placeholder:text-gray-400"
      />
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 p-3 lg:p-6 pb-32">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-4 sm:mb-6 bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
          <div className="min-w-0">
            <h1 className="text-lg lg:text-xl font-bold text-gray-900">
              Zlecenie #{dealId}
            </h1>
            <p className="text-xs sm:text-sm text-gray-500 mt-0.5 truncate">
              {data?.title || (loading ? "Ładowanie…" : "—")}
            </p>
            {data?.updated_at && (
              <p className="text-[11px] text-gray-400 mt-0.5">
                Ostatnia aktualizacja:{" "}
                {new Date(data.updated_at).toLocaleString("pl-PL")}
              </p>
            )}
          </div>
          <div className="flex gap-2 w-full sm:w-auto">
            <a
              href="/admin/reports"
              className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-colors min-h-[44px] inline-flex items-center"
            >
              ← Lista
            </a>
          </div>
        </div>

        {/* Toast */}
        {toast && (
          <div
            className={`px-4 py-3 rounded-xl mb-4 font-medium text-sm border ${
              toast.kind === "ok"
                ? "bg-green-50 text-green-700 border-green-200"
                : toast.kind === "warn"
                ? "bg-amber-50 text-amber-700 border-amber-200"
                : "bg-red-50 text-red-700 border-red-200"
            }`}
          >
            {toast.msg}
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="bg-red-50 text-red-700 border border-red-200 rounded-xl px-4 py-3 mb-4 text-sm font-medium">
            {error}
            <button
              onClick={fetchEdit}
              className="ml-3 underline hover:no-underline font-bold"
            >
              Spróbuj ponownie
            </button>
          </div>
        )}

        {/* Loading skeleton */}
        {loading && !data && (
          <div className="space-y-3">
            {[0, 1, 2].map(i => (
              <div key={i} className="bg-white rounded-2xl shadow-sm p-6 border border-gray-100">
                <div className="h-4 w-1/3 bg-gray-100 rounded mb-4 animate-pulse" />
                <div className="space-y-2">
                  {[0, 1, 2, 3].map(j => (
                    <div key={j} className="h-10 bg-gray-50 rounded animate-pulse" />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Form sections */}
        {data && SECTION_ROOTS.map(({ root, title, subtitle }) => {
          const paths = schemaPaths.filter(p => p.startsWith(`${root}.`))
          if (paths.length === 0) return null
          return (
            <section
              key={root}
              className="bg-white rounded-2xl shadow-sm p-4 sm:p-6 border border-gray-100 mb-4"
            >
              <div className="mb-4">
                <h2 className="font-bold text-base sm:text-lg text-gray-900">{title}</h2>
                {subtitle && (
                  <p className="text-[11px] sm:text-xs text-gray-500 mt-0.5">{subtitle}</p>
                )}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {paths.map(p => {
                  const schema = data.schema[p]
                  const isChanged = p in changes
                  // Comments / textarea fields span full width for usability.
                  const fullWidth =
                    schema.type === "structured" || wantsTextarea(p, originalValueFor(p))
                  return (
                    <div key={p} className={fullWidth ? "sm:col-span-2" : ""}>
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-[10px] font-bold uppercase text-gray-500 tracking-wider flex items-center gap-2">
                          {isChanged && (
                            <span
                              className="inline-block w-2 h-2 rounded-full bg-blue-500"
                              aria-label="zmienione"
                            />
                          )}
                          {schema.label}
                        </label>
                        {isChanged && (
                          <button
                            type="button"
                            onClick={() => resetField(p)}
                            className="text-[10px] text-blue-600 hover:text-blue-800 font-bold uppercase"
                          >
                            Cofnij
                          </button>
                        )}
                      </div>
                      {renderField(p, schema)}
                      <div className="text-[10px] text-gray-300 mt-1 font-mono truncate">{p}</div>
                    </div>
                  )
                })}
              </div>
            </section>
          )
        })}

        {/* Sticky save bar */}
        {data && (
          <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 shadow-lg p-3 sm:p-4 z-10">
            <div className="max-w-4xl mx-auto flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3">
              <div className="text-xs sm:text-sm font-medium text-gray-600 flex-1">
                {changedPaths.length === 0
                  ? "Brak zmian"
                  : `${changedPaths.length} ${
                      changedPaths.length === 1 ? "zmiana" : "zmian"
                    } do zapisania`}
              </div>
              <button
                onClick={resetAll}
                disabled={changedPaths.length === 0 || saving}
                className="bg-gray-100 hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed text-gray-700 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-colors min-h-[44px]"
              >
                Cofnij wszystkie
              </button>
              <button
                onClick={() => router.push("/admin/reports")}
                className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-colors min-h-[44px]"
              >
                Anuluj
              </button>
              <button
                onClick={save}
                disabled={changedPaths.length === 0 || saving}
                className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-300 disabled:text-gray-600 disabled:cursor-not-allowed text-white px-6 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-colors shadow-sm min-h-[44px]"
              >
                {saving ? "Zapisywanie…" : `Zapisz zmiany (${changedPaths.length})`}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
