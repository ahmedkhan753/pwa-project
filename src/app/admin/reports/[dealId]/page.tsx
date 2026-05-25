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

// Sections rendered in this order. Eyebrow numbering mirrors the
// Condition Report numbering (01 / Dane pojazdu, …) so admins and report
// readers share the same mental map.
const SECTION_ROOTS: Array<{
  root: string
  eyebrow: string
  title: string
  subtitle?: string
  icon: string
}> = [
  {
    root: "vehicle",
    eyebrow: "01 / Dane pojazdu",
    title: "Dane pojazdu",
    subtitle: "Marka, model, identyfikatory, parametry techniczne",
    icon: "fa-solid fa-car",
  },
  {
    root: "paint",
    eyebrow: "02 / Pomiar lakieru",
    title: "Pomiar lakieru",
    subtitle: "Zakres µm dla każdego panelu — wybór z listy",
    icon: "fa-solid fa-paint-roller",
  },
  {
    root: "bitrix_extras",
    eyebrow: "03 / Wyposażenie i komentarze",
    title: "Wyposażenie i komentarze",
    subtitle: "Pola zapisywane bezpośrednio w Bitrix24",
    icon: "fa-solid fa-clipboard-list",
  },
]

// Path-walker shared with the JSON blobs returned by the edit endpoint.
const getByPath = (
  root: Record<string, unknown> | unknown[] | null,
  parts: string[]
): unknown => {
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

  useEffect(() => { fetchEdit() }, [fetchEdit])

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
    // Number fields: reject negatives + bare zero before storing.
    // Schema's own min (e.g. year=1900) still applies on top via the input.
    if (schema?.type === "number") {
      raw = String(raw).replace("-", "")
      if (/^0+$/.test(raw)) raw = ""
    }
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
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#F5F5F7" }}>
        <p className="text-sm" style={{ color: "#86868B" }}>Przekierowywanie…</p>
      </div>
    )
  }

  // ── Field renderer ────────────────────────────────────────────────────────
  const inputBase =
    "w-full text-sm font-medium outline-none transition-colors bg-white placeholder:text-gray-400"
  const inputStyle: React.CSSProperties = {
    color: "#1D1D1F",
    border: "1px solid #E8E8ED",
    borderRadius: 10,
    padding: "12px 14px",
    minHeight: 44,
  }
  const inputFocus = (e: React.FocusEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    e.currentTarget.style.borderColor = "#B71C1C"
    e.currentTarget.style.boxShadow = "0 0 0 3px rgba(183,28,28,0.12)"
  }
  const inputBlur = (e: React.FocusEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    e.currentTarget.style.borderColor = "#E8E8ED"
    e.currentTarget.style.boxShadow = "none"
  }

  const renderField = (path: string, schema: SchemaEntry) => {
    const orig = originalValueFor(path)
    const isChanged = path in changes
    const current = isChanged ? changes[path] : orig
    const inputStr = toInputString(current)

    if (schema.type === "structured") {
      return (
        <div
          className="text-xs italic px-3 py-2"
          style={{
            color: "#86868B",
            background: "#F5F5F7",
            border: "1px dashed #E8E8ED",
            borderRadius: 10,
          }}
        >
          Edytowanie tej sekcji niedostępne w v1
        </div>
      )
    }

    if (schema.type === "enum") {
      const opts = schema.options || []
      const currentStr = inputStr
      const merged = opts.includes(currentStr) ? opts : [...opts, currentStr]
      return (
        <select
          value={inputStr}
          onChange={e => onFieldChange(path, schema, e.target.value)}
          onFocus={inputFocus}
          onBlur={inputBlur}
          className={inputBase}
          style={inputStyle}
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
          onFocus={inputFocus}
          onBlur={inputBlur}
          className={inputBase}
          style={inputStyle}
        />
      )
    }

    if (wantsTextarea(path, orig)) {
      return (
        <textarea
          value={inputStr}
          rows={4}
          onChange={e => onFieldChange(path, schema, e.target.value)}
          onFocus={inputFocus}
          onBlur={inputBlur}
          className={inputBase}
          style={{ ...inputStyle, minHeight: 96, resize: "vertical" }}
        />
      )
    }
    return (
      <input
        type="text"
        value={inputStr}
        onChange={e => onFieldChange(path, schema, e.target.value)}
        onFocus={inputFocus}
        onBlur={inputBlur}
        className={inputBase}
        style={inputStyle}
      />
    )
  }

  return (
    <div className="min-h-screen pb-40" style={{ background: "#F5F5F7", color: "#1D1D1F" }}>
      <div className="max-w-4xl mx-auto px-3 py-4 sm:px-6 sm:py-6 flex flex-col gap-4">

        {/* Header card */}
        <header
          className="bg-white relative overflow-hidden"
          style={{
            borderRadius: 12,
            border: "1px solid #E8E8ED",
            boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
          }}
        >
          <span
            aria-hidden
            className="absolute left-0 top-0 bottom-0"
            style={{ width: 3, background: "#B71C1C", borderRadius: "0 3px 3px 0" }}
          />
          <div className="px-5 sm:px-7 py-5 sm:py-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="min-w-0">
              <div
                className="font-bold uppercase mb-1.5"
                style={{ fontSize: 11, color: "#B71C1C", letterSpacing: 2 }}
              >
                Edycja raportu · #{dealId}
              </div>
              <h1
                className="font-bold truncate"
                style={{ fontSize: 24, color: "#1D1D1F", lineHeight: 1.2 }}
              >
                {data?.title || (loading ? "Ładowanie…" : "—")}
              </h1>
              {data?.updated_at && (
                <p className="mt-1 flex items-center gap-2 text-xs" style={{ color: "#86868B" }}>
                  <i className="fa-regular fa-clock" style={{ fontSize: 11 }} />
                  Ostatnia aktualizacja:{" "}
                  {new Date(data.updated_at).toLocaleString("pl-PL")}
                </p>
              )}
            </div>
            <a
              href="/admin/reports"
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
              Lista
            </a>
          </div>
        </header>

        {/* Toast */}
        {toast && (
          <div
            className="px-4 py-3 text-sm font-medium flex items-center gap-3"
            style={{
              background:
                toast.kind === "ok" ? "#ECFDF5"
                : toast.kind === "warn" ? "#FFFBEB"
                : "#FEF2F2",
              color:
                toast.kind === "ok" ? "#047857"
                : toast.kind === "warn" ? "#B45309"
                : "#B71C1C",
              border:
                toast.kind === "ok" ? "1px solid rgba(5,150,105,0.2)"
                : toast.kind === "warn" ? "1px solid rgba(217,119,6,0.2)"
                : "1px solid rgba(183,28,28,0.2)",
              borderRadius: 12,
            }}
          >
            <i
              className={
                toast.kind === "ok" ? "fa-solid fa-circle-check"
                : toast.kind === "warn" ? "fa-solid fa-triangle-exclamation"
                : "fa-solid fa-circle-xmark"
              }
            />
            <span className="flex-1">{toast.msg}</span>
          </div>
        )}

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
            <button onClick={fetchEdit} className="font-bold underline hover:no-underline">
              Spróbuj ponownie
            </button>
          </div>
        )}

        {/* Loading skeleton */}
        {loading && !data && (
          <div className="flex flex-col gap-3">
            {[0, 1, 2].map(i => (
              <div
                key={i}
                className="bg-white"
                style={{ borderRadius: 12, border: "1px solid #E8E8ED", padding: 20 }}
              >
                <div className="h-4 w-1/3 rounded animate-pulse mb-4" style={{ background: "#F5F5F7" }} />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {[0, 1, 2, 3].map(j => (
                    <div key={j} className="h-10 rounded animate-pulse" style={{ background: "#F5F5F7" }} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Sections */}
        {data && SECTION_ROOTS.map(({ root, eyebrow, title, subtitle, icon }) => {
          const paths = schemaPaths.filter(p => p.startsWith(`${root}.`))
          if (paths.length === 0) return null
          return (
            <section
              key={root}
              className="bg-white relative overflow-hidden transition-shadow"
              style={{
                borderRadius: 12,
                border: "1px solid #E8E8ED",
                boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
              }}
            >
              <span
                aria-hidden
                className="absolute left-0 top-0 bottom-0"
                style={{ width: 3, background: "#B71C1C", borderRadius: "0 3px 3px 0" }}
              />
              <div className="flex items-center gap-3 sm:gap-4 px-5 sm:px-7 pt-5 sm:pt-6 pb-4">
                <div
                  className="flex items-center justify-center flex-shrink-0"
                  style={{
                    width: 42, height: 42, borderRadius: 8,
                    background: "#FEF2F2", color: "#B71C1C", fontSize: 17,
                  }}
                >
                  <i className={icon} />
                </div>
                <div className="min-w-0 flex-1">
                  <div
                    className="font-bold uppercase"
                    style={{ fontSize: 11, color: "#B71C1C", letterSpacing: 2, marginBottom: 2 }}
                  >
                    {eyebrow}
                  </div>
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
                className="px-5 sm:px-7 pb-5 sm:pb-6 pt-4"
                style={{ borderTop: "1px solid #E8E8ED" }}
              >
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-5">
                  {paths.map(p => {
                    const schema = data.schema[p]
                    const isChanged = p in changes
                    const fullWidth =
                      schema.type === "structured" || wantsTextarea(p, originalValueFor(p))
                    return (
                      <div key={p} className={fullWidth ? "sm:col-span-2" : ""}>
                        <div className="flex items-center justify-between mb-1.5 gap-2">
                          <label
                            className="font-bold uppercase flex items-center gap-2"
                            style={{ fontSize: 10, color: "#86868B", letterSpacing: 1.2 }}
                          >
                            {isChanged && (
                              <span
                                className="inline-block"
                                aria-label="zmienione"
                                style={{
                                  width: 8, height: 8, borderRadius: "50%",
                                  background: "#B71C1C",
                                  boxShadow: "0 0 0 3px rgba(183,28,28,0.15)",
                                }}
                              />
                            )}
                            <span style={{ color: "#1D1D1F" }}>{schema.label}</span>
                          </label>
                          {isChanged && (
                            <button
                              type="button"
                              onClick={() => resetField(p)}
                              className="text-xs font-semibold hover:underline"
                              style={{ color: "#B71C1C" }}
                            >
                              Cofnij
                            </button>
                          )}
                        </div>
                        {renderField(p, schema)}
                        <div
                          className="font-mono italic truncate mt-1"
                          style={{ fontSize: 10, color: "#AEAEB2" }}
                        >
                          {p}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </section>
          )
        })}
      </div>

      {/* Sticky save bar */}
      {data && (
        <div
          className="fixed bottom-0 left-0 right-0 z-10"
          style={{
            background: "#fff",
            borderTop: "1px solid #E8E8ED",
            boxShadow: "0 -4px 12px rgba(0,0,0,0.05)",
          }}
        >
          <div className="max-w-4xl mx-auto px-3 sm:px-6 py-3 sm:py-4 flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3">
            <div className="text-xs sm:text-sm font-medium flex-1 flex items-center gap-2" style={{ color: "#86868B" }}>
              {changedPaths.length > 0 && (
                <span
                  className="inline-block"
                  style={{
                    width: 8, height: 8, borderRadius: "50%",
                    background: "#B71C1C",
                    boxShadow: "0 0 0 3px rgba(183,28,28,0.15)",
                  }}
                />
              )}
              {changedPaths.length === 0
                ? "Brak zmian do zapisania"
                : `${changedPaths.length} ${
                    changedPaths.length === 1 ? "zmiana" : "zmian"
                  } do zapisania`}
            </div>
            <button
              onClick={resetAll}
              disabled={changedPaths.length === 0 || saving}
              className="text-xs sm:text-sm font-semibold transition-colors disabled:cursor-not-allowed"
              style={{
                minHeight: 44,
                borderRadius: 10,
                padding: "10px 14px",
                background: changedPaths.length === 0 ? "#F5F5F7" : "#fff",
                color: changedPaths.length === 0 ? "#AEAEB2" : "#86868B",
                border: "1px solid #E8E8ED",
                opacity: changedPaths.length === 0 ? 0.6 : 1,
              }}
            >
              Cofnij wszystkie
            </button>
            <button
              onClick={() => router.push("/admin/reports")}
              className="text-xs sm:text-sm font-semibold transition-colors"
              style={{
                minHeight: 44,
                borderRadius: 10,
                padding: "10px 16px",
                background: "#fff",
                color: "#B71C1C",
                border: "1px solid #B71C1C",
              }}
            >
              Anuluj
            </button>
            <button
              onClick={save}
              disabled={changedPaths.length === 0 || saving}
              className="inline-flex items-center justify-center gap-2 text-sm font-bold transition-transform active:scale-[0.98] disabled:cursor-not-allowed disabled:active:scale-100"
              style={{
                minHeight: 44,
                borderRadius: 10,
                padding: "12px 20px",
                background: changedPaths.length === 0 || saving ? "#E8E8ED" : "#B71C1C",
                color: changedPaths.length === 0 || saving ? "#86868B" : "#fff",
                boxShadow:
                  changedPaths.length === 0 || saving
                    ? "none"
                    : "0 2px 6px rgba(183,28,28,0.25)",
              }}
            >
              {saving ? (
                <>
                  <i className="fa-solid fa-spinner fa-spin" />
                  Zapisywanie…
                </>
              ) : (
                <>
                  <i className="fa-solid fa-floppy-disk" />
                  Zapisz zmiany {changedPaths.length > 0 && `(${changedPaths.length})`}
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
