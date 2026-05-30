"use client"
import { useCallback, useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"

interface SchemaEntry {
  type: "number" | "enum" | "text" | "structured" | "date"
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

interface AdminPhoto {
  slot_id: string
  label: string
  url: string | null
  size_bytes: number
  is_video: boolean
  present: boolean
}

interface DamagePhoto {
  source: "ext" | "int"
  damage_index: number
  label: string
  photo_index: number
  url: string
}

interface AdminPhotosResponse {
  deal_id: number
  photos: AdminPhoto[]
  damage_photos: DamagePhoto[]
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

  // ── Photo management (list / replace / delete) ─────────────────────────
  const [photos, setPhotos] = useState<AdminPhoto[]>([])
  const [damagePhotos, setDamagePhotos] = useState<DamagePhoto[]>([])
  const [photosLoading, setPhotosLoading] = useState(false)
  const [photoBusy, setPhotoBusy] = useState<Set<string>>(new Set())
  const [photoCacheBust, setPhotoCacheBust] = useState<Record<string, number>>({})

  // CEPIK / Historia Szkodowości — view + replace PDFs.
  const [docStatus, setDocStatus] = useState<{ has_cepik: boolean; has_damage_history: boolean }>({ has_cepik: false, has_damage_history: false })
  const [docBusy, setDocBusy] = useState<Set<string>>(new Set())

  const setSlotBusy = (slot: string, busy: boolean) => {
    setPhotoBusy(prev => {
      const next = new Set(prev)
      if (busy) next.add(slot)
      else next.delete(slot)
      return next
    })
  }

  const fetchPhotos = useCallback(async () => {
    if (!token) return
    setPhotosLoading(true)
    try {
      const res = await fetch(`${API_BASE}/admin/reports/${dealId}/photos`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.status === 401) {
        sessionStorage.removeItem("admin_token")
        router.push("/admin")
        return
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json: AdminPhotosResponse = await res.json()
      setPhotos(json.photos || [])
      setDamagePhotos(json.damage_photos || [])
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      setToast({ kind: "err", msg: `Nie udało się pobrać zdjęć: ${msg}` })
    } finally {
      setPhotosLoading(false)
    }
  }, [token, dealId, router])

  useEffect(() => { fetchPhotos() }, [fetchPhotos])

  // Documents: status + replace. Uses relative /api/report/... — same pattern
  // as the public report page; do NOT prefix API_BASE (would double /api).
  const fetchDocStatus = useCallback(async () => {
    try {
      const res = await fetch(`/api/report/${dealId}/documents/status`)
      if (!res.ok) return
      const json = await res.json()
      setDocStatus({
        has_cepik: !!json.has_cepik,
        has_damage_history: !!json.has_damage_history,
      })
    } catch { /* non-fatal — section just shows "Brak" */ }
  }, [dealId])

  useEffect(() => { fetchDocStatus() }, [fetchDocStatus])

  const setDocBusyFn = (k: string, busy: boolean) => {
    setDocBusy(prev => {
      const next = new Set(prev)
      if (busy) next.add(k); else next.delete(k)
      return next
    })
  }

  const onReplaceDocument = async (docType: "cepik" | "damage_history", file: File) => {
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      setToast({ kind: "err", msg: "Dozwolone są tylko pliki PDF" })
      return
    }
    setDocBusyFn(docType, true)
    try {
      const fd = new FormData()
      fd.append("file", file)
      const res = await fetch(`/api/report/${dealId}/document/${docType}`, {
        method: "POST",
        body: fd,
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      await fetchDocStatus()
      setToast({
        kind: "ok",
        msg: `Wgrano dokument: ${docType === "cepik" ? "CEPIK" : "Historia szkodowości"}`,
      })
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      setToast({ kind: "err", msg: `Nie udało się wgrać: ${msg}` })
    } finally {
      setDocBusyFn(docType, false)
    }
  }

  const onReplacePhoto = async (slot: string, file: File) => {
    if (!token) return
    setSlotBusy(slot, true)
    try {
      const fd = new FormData()
      fd.append("deal_id", String(dealId))
      fd.append("field_key", slot)
      fd.append("file", file)
      const res = await fetch(`${API_BASE}/api/files/upload-binary`, {
        method: "POST",
        body: fd,
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setPhotoCacheBust(prev => ({ ...prev, [slot]: Date.now() }))
      setToast({ kind: "ok", msg: `Zamieniono zdjęcie: ${slot}` })
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      setToast({ kind: "err", msg: `Nie udało się zamienić: ${msg}` })
    } finally {
      setSlotBusy(slot, false)
    }
  }

  // Upload into an empty canonical slot. Same upload-binary endpoint as
  // replace, but afterwards we refetch /photos so the slot flips
  // present=false → present=true with its new URL + size.
  const onUploadEmpty = async (slot: string, file: File) => {
    if (!token) return
    setSlotBusy(slot, true)
    try {
      const fd = new FormData()
      fd.append("deal_id", String(dealId))
      fd.append("field_key", slot)
      fd.append("file", file)
      const res = await fetch(`${API_BASE}/api/files/upload-binary`, {
        method: "POST",
        body: fd,
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      await fetchPhotos()
      setToast({ kind: "ok", msg: `Dodano zdjęcie: ${slot}` })
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      setToast({ kind: "err", msg: `Nie udało się dodać: ${msg}` })
    } finally {
      setSlotBusy(slot, false)
    }
  }

  const onDeletePhoto = async (slot: string) => {
    if (!token) return
    const ok = window.confirm(
      `Czy na pewno chcesz trwale usunąć to zdjęcie?\n\nSlot: ${slot}\n\nTej operacji nie można cofnąć.`
    )
    if (!ok) return
    setSlotBusy(slot, true)
    try {
      const res = await fetch(`${API_BASE}/admin/reports/${dealId}/photo/${slot}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.status === 401) {
        sessionStorage.removeItem("admin_token")
        router.push("/admin")
        return
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      // Refetch so the deleted slot reappears as an empty placeholder in its
      // canonical position — preserves grid order (no shift) and lets the
      // admin re-upload to the same slot via the "Dodaj zdjęcie" button.
      await fetchPhotos()
      // If admin deleted the slot that was set as hero, drop the override
      // locally so the badge disappears immediately.
      setHeroSlot(prev => (prev === slot ? null : prev))
      setToast({ kind: "ok", msg: `Usunięto zdjęcie: ${slot}` })
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      setToast({ kind: "err", msg: `Nie udało się usunąć: ${msg}` })
    } finally {
      setSlotBusy(slot, false)
    }
  }

  // Hero photo override — admin picks one photo as the report banner.
  // Reads current value from data.vehicle.heroPhotoSlot on each fetchEdit
  // and writes via a standalone PUT to the existing edit endpoint.
  const [heroSlot, setHeroSlot] = useState<string | null>(null)

  useEffect(() => {
    const v = (data?.vehicle as Record<string, unknown> | undefined)?.heroPhotoSlot
    setHeroSlot(typeof v === "string" && v ? v : null)
  }, [data])

  const onSetHero = async (slot: string) => {
    if (!token) return
    setSlotBusy(slot, true)
    try {
      const res = await fetch(`${API_BASE}/admin/reports/${dealId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          changes: [{ path: "vehicle.heroPhotoSlot", value: slot }],
        }),
      })
      if (res.status === 401) {
        sessionStorage.removeItem("admin_token")
        router.push("/admin")
        return
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setHeroSlot(slot)
      setToast({ kind: "ok", msg: `Ustawiono jako główne: ${slot}` })
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      setToast({ kind: "err", msg: `Nie udało się ustawić: ${msg}` })
    } finally {
      setSlotBusy(slot, false)
    }
  }

  useEffect(() => {
    if (!toast) return
    const h = setTimeout(() => setToast(null), 4000)
    return () => clearTimeout(h)
  }, [toast])

  // Paint panel display order — mirrors backend PAINT_PANEL_KEYS /
  // report.py PAINT_PANELS_19 / inspector wizard order. Keeps the admin
  // edit list aligned with the Condition Report instead of alphabetical.
  const PAINT_ORDER = [
    "hood","leftFrontFender","rightFrontFender","leftFrontDoor","rightFrontDoor",
    "leftRearDoor","rightRearDoor","leftRearFender","rightRearFender","trunk",
    "roof","leftAColumn","rightAColumn","leftBColumn","rightBColumn",
    "leftSill","rightSill","frontBumper","rearBumper",
  ]

  // Schema entries that are written through a dedicated UI (not the generic
  // form), so they must NOT render as text inputs. The schema entry still
  // exists for PUT validation; the GET response still surfaces the value.
  const HIDDEN_SCHEMA_PATHS = new Set(["vehicle.heroPhotoSlot"])

  const schemaPaths = useMemo(() => {
    const keys = Object.keys(data?.schema || {}).filter(p => !HIDDEN_SCHEMA_PATHS.has(p))
    const paintIdx = (p: string) => {
      const panel = p.split(".")[1] || ""
      const i = PAINT_ORDER.indexOf(panel)
      return i === -1 ? 999 : i
    }
    return keys.sort((a, b) => {
      const ra = a.split(".")[0], rb = b.split(".")[0]
      if (ra !== rb) return ra.localeCompare(rb)
      if (ra === "paint") return paintIdx(a) - paintIdx(b)
      return a.localeCompare(b)
    })
  }, [data])

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

    if (schema.type === "date") {
      // slice(0,10) trims ISO datetime values ("2021-05-12T00:00:00") to the
      // YYYY-MM-DD shape <input type="date"> requires.
      return (
        <input
          type="date"
          value={inputStr ? inputStr.slice(0, 10) : ""}
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

        {/* Zdjęcia — photo management (list / replace / delete) */}
        <section
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
          <div className="px-5 sm:px-7 py-4 sm:py-5 flex items-start gap-3">
            <div
              className="flex items-center justify-center flex-shrink-0"
              style={{
                width: 42, height: 42, borderRadius: 8,
                background: "#FEF2F2", color: "#B71C1C", fontSize: 17,
              }}
            >
              <i className="fa-solid fa-images" />
            </div>
            <div className="min-w-0 flex-1">
              <div
                className="font-bold uppercase"
                style={{ fontSize: 11, color: "#B71C1C", letterSpacing: 2, marginBottom: 2 }}
              >
                04 / Zdjęcia
              </div>
              <div className="font-bold" style={{ fontSize: 19, color: "#1D1D1F", lineHeight: 1.3 }}>
                Zarządzanie zdjęciami
              </div>
              <div className="text-xs sm:text-sm mt-1" style={{ color: "#86868B" }}>
                Zamień lub usuń zdjęcia z raportu. Usuwanie jest trwałe.
              </div>
            </div>
          </div>
          <div
            className="px-5 sm:px-7 pb-5 sm:pb-6 pt-4"
            style={{ borderTop: "1px solid #E8E8ED" }}
          >
            {photosLoading && (
              <div className="text-sm" style={{ color: "#86868B" }}>
                <i className="fa-solid fa-spinner fa-spin mr-2" />
                Ładowanie zdjęć…
              </div>
            )}
            {!photosLoading && photos.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
                {photos.map(p => {
                  const busy = photoBusy.has(p.slot_id)
                  const bust = photoCacheBust[p.slot_id]
                  // p.url is already a root-relative path that starts with /api/
                  // (e.g. /api/gallery/1864/media/photo_front). Do NOT prefix
                  // API_BASE — it ends in /api and would double-prefix → 404.
                  const src = p.url ? `${p.url}${bust ? `?t=${bust}` : ""}` : ""
                  const sizeKb = Math.round(p.size_bytes / 1024)

                  if (!p.present) {
                    // Empty canonical slot — show "Dodaj zdjęcie".
                    return (
                      <div
                        key={p.slot_id}
                        style={{
                          border: "1px dashed #D1D1D6",
                          borderRadius: 10,
                          background: "#fff",
                          overflow: "hidden",
                          display: "flex",
                          flexDirection: "column",
                        }}
                      >
                        <div
                          style={{
                            aspectRatio: "4 / 3",
                            background: "#F5F5F7",
                            display: "flex",
                            flexDirection: "column",
                            alignItems: "center",
                            justifyContent: "center",
                            gap: 6,
                            color: "#86868B",
                          }}
                        >
                          <i
                            className={`fa-solid ${p.is_video ? "fa-film" : "fa-image"}`}
                            style={{ fontSize: 26, opacity: 0.45 }}
                          />
                          <span className="text-[10px] font-bold uppercase tracking-wider">
                            Pusty slot
                          </span>
                        </div>
                        <div className="px-3 py-2.5 flex flex-col gap-2">
                          <div
                            className="font-semibold truncate"
                            style={{ fontSize: 12, color: "#1D1D1F" }}
                            title={p.label}
                          >
                            {p.label}
                          </div>
                          <div
                            className="font-mono truncate"
                            style={{ fontSize: 10, color: "#AEAEB2" }}
                            title={p.slot_id}
                          >
                            {p.slot_id}
                          </div>
                          <label
                            className="inline-flex items-center justify-center gap-1.5 text-xs font-semibold cursor-pointer transition-colors"
                            style={{
                              minHeight: 36,
                              borderRadius: 8,
                              background: busy ? "#F5F5F7" : "#FEF2F2",
                              color: busy ? "#AEAEB2" : "#B71C1C",
                              border: `1px solid ${busy ? "#E8E8ED" : "rgba(183,28,28,0.3)"}`,
                              opacity: busy ? 0.6 : 1,
                              pointerEvents: busy ? "none" : "auto",
                            }}
                          >
                            <i
                              className={`fa-solid ${busy ? "fa-spinner fa-spin" : "fa-plus"}`}
                              style={{ fontSize: 11 }}
                            />
                            Dodaj zdjęcie
                            <input
                              type="file"
                              accept={p.is_video ? "video/*" : "image/*"}
                              style={{ display: "none" }}
                              onChange={e => {
                                const f = e.target.files?.[0]
                                if (f) onUploadEmpty(p.slot_id, f)
                                e.target.value = ""
                              }}
                            />
                          </label>
                        </div>
                      </div>
                    )
                  }

                  return (
                    <div
                      key={p.slot_id}
                      style={{
                        border: "1px solid #E8E8ED",
                        borderRadius: 10,
                        background: "#fff",
                        overflow: "hidden",
                        display: "flex",
                        flexDirection: "column",
                      }}
                    >
                      <div
                        style={{
                          aspectRatio: "4 / 3",
                          background: "#F5F5F7",
                          position: "relative",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          overflow: "hidden",
                        }}
                      >
                        {p.is_video ? (
                          <>
                            <video
                              controls
                              src={src}
                              style={{ width: "100%", height: "100%", objectFit: "cover", background: "#000" }}
                            />
                            <div
                              aria-hidden
                              style={{
                                position: "absolute",
                                bottom: 6, left: 6,
                                background: "rgba(0,0,0,0.65)",
                                color: "#fff",
                                fontSize: 9,
                                fontWeight: 800,
                                letterSpacing: 1,
                                padding: "2px 6px",
                                borderRadius: 4,
                                textTransform: "uppercase",
                              }}
                            >
                              <i className="fa-solid fa-film" style={{ fontSize: 9, marginRight: 4 }} />
                              Film
                            </div>
                          </>
                        ) : (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={src}
                            alt={p.label}
                            loading="lazy"
                            style={{ width: "100%", height: "100%", objectFit: "cover" }}
                          />
                        )}
                        {busy && (
                          <div
                            style={{
                              position: "absolute", inset: 0,
                              background: "rgba(255,255,255,0.7)",
                              display: "flex", alignItems: "center", justifyContent: "center",
                              color: "#B71C1C", fontSize: 24,
                            }}
                          >
                            <i className="fa-solid fa-spinner fa-spin" />
                          </div>
                        )}
                        {heroSlot === p.slot_id && (
                          <div
                            aria-label="Główne zdjęcie raportu"
                            style={{
                              position: "absolute",
                              top: 6, left: 6,
                              background: "#B71C1C",
                              color: "#fff",
                              fontSize: 10,
                              fontWeight: 800,
                              letterSpacing: 1,
                              padding: "3px 8px",
                              borderRadius: 6,
                              textTransform: "uppercase",
                              boxShadow: "0 1px 3px rgba(0,0,0,0.15)",
                            }}
                          >
                            <i className="fa-solid fa-star" style={{ fontSize: 9, marginRight: 4 }} />
                            Główne
                          </div>
                        )}
                      </div>
                      <div className="px-3 py-2.5 flex flex-col gap-2">
                        <div
                          className="font-semibold truncate"
                          style={{ fontSize: 12, color: "#1D1D1F" }}
                          title={p.label}
                        >
                          {p.label}
                        </div>
                        <div
                          className="font-mono truncate"
                          style={{ fontSize: 10, color: "#AEAEB2" }}
                          title={p.slot_id}
                        >
                          {p.slot_id} · {sizeKb} KB
                        </div>
                        <div className="flex gap-2 mt-1">
                          <label
                            className="flex-1 inline-flex items-center justify-center gap-1.5 text-xs font-semibold cursor-pointer transition-colors"
                            style={{
                              minHeight: 36,
                              borderRadius: 8,
                              background: busy ? "#F5F5F7" : "#fff",
                              color: busy ? "#AEAEB2" : "#1D1D1F",
                              border: "1px solid #E8E8ED",
                              opacity: busy ? 0.6 : 1,
                              pointerEvents: busy ? "none" : "auto",
                            }}
                          >
                            <i className="fa-solid fa-upload" style={{ fontSize: 11 }} />
                            Zamień
                            <input
                              type="file"
                              accept={p.is_video ? "video/*" : "image/*"}
                              style={{ display: "none" }}
                              onChange={e => {
                                const f = e.target.files?.[0]
                                if (f) onReplacePhoto(p.slot_id, f)
                                e.target.value = ""
                              }}
                            />
                          </label>
                          <button
                            type="button"
                            onClick={() => onDeletePhoto(p.slot_id)}
                            disabled={busy}
                            className="inline-flex items-center justify-center gap-1.5 text-xs font-semibold transition-colors disabled:cursor-not-allowed"
                            style={{
                              minHeight: 36,
                              borderRadius: 8,
                              padding: "0 12px",
                              background: busy ? "#F5F5F7" : "#fff",
                              color: busy ? "#AEAEB2" : "#B71C1C",
                              border: `1px solid ${busy ? "#E8E8ED" : "#B71C1C"}`,
                              opacity: busy ? 0.6 : 1,
                            }}
                          >
                            <i className="fa-solid fa-trash" style={{ fontSize: 11 }} />
                            Usuń
                          </button>
                        </div>
                        {!p.is_video && heroSlot !== p.slot_id && (
                          <button
                            type="button"
                            onClick={() => onSetHero(p.slot_id)}
                            disabled={busy}
                            className="inline-flex items-center justify-center gap-1.5 text-xs font-semibold transition-colors disabled:cursor-not-allowed"
                            style={{
                              minHeight: 32,
                              borderRadius: 8,
                              padding: "0 12px",
                              background: busy ? "#F5F5F7" : "#FEF2F2",
                              color: busy ? "#AEAEB2" : "#B71C1C",
                              border: `1px solid ${busy ? "#E8E8ED" : "rgba(183,28,28,0.3)"}`,
                              opacity: busy ? 0.6 : 1,
                            }}
                          >
                            <i className="fa-solid fa-star" style={{ fontSize: 10 }} />
                            Ustaw jako główne
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {!photosLoading && damagePhotos.length > 0 && (
              <div className="mt-6">
                <div
                  className="font-bold uppercase mb-3"
                  style={{ fontSize: 11, color: "#B71C1C", letterSpacing: 2 }}
                >
                  Zdjęcia uszkodzeń
                </div>
                {(() => {
                  const groups = new Map<string, DamagePhoto[]>()
                  for (const dp of damagePhotos) {
                    const arr = groups.get(dp.label) ?? []
                    arr.push(dp)
                    groups.set(dp.label, arr)
                  }
                  return Array.from(groups.entries()).map(([label, list]) => (
                    <div key={label} className="mb-4">
                      <div
                        className="font-semibold mb-2"
                        style={{ fontSize: 12, color: "#1D1D1F" }}
                      >
                        {label}{" "}
                        <span style={{ color: "#86868B", fontWeight: 400 }}>
                          · {list.length} {list.length === 1 ? "zdjęcie" : "zdjęć"}
                        </span>
                      </div>
                      <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-2">
                        {list.map(dp => (
                          <div
                            key={`${dp.source}-${dp.damage_index}-${dp.photo_index}`}
                            style={{
                              aspectRatio: "4 / 3",
                              overflow: "hidden",
                              borderRadius: 8,
                              border: "1px solid #E8E8ED",
                              background: "#F5F5F7",
                            }}
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={dp.url}
                              alt={`${label}-${dp.photo_index}`}
                              loading="lazy"
                              style={{ width: "100%", height: "100%", objectFit: "cover" }}
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  ))
                })()}
              </div>
            )}
          </div>
        </section>

        {/* Dokumenty — CEPIK / Historia szkodowości (view + replace) */}
        <section
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
          <div className="px-5 sm:px-7 py-4 sm:py-5 flex items-start gap-3">
            <div
              className="flex items-center justify-center flex-shrink-0"
              style={{
                width: 42, height: 42, borderRadius: 8,
                background: "#FEF2F2", color: "#B71C1C", fontSize: 17,
              }}
            >
              <i className="fa-solid fa-file-pdf" />
            </div>
            <div className="min-w-0 flex-1">
              <div
                className="font-bold uppercase"
                style={{ fontSize: 11, color: "#B71C1C", letterSpacing: 2, marginBottom: 2 }}
              >
                05 / Dokumenty
              </div>
              <div className="font-bold" style={{ fontSize: 19, color: "#1D1D1F", lineHeight: 1.3 }}>
                CEPIK i Historia szkodowości
              </div>
              <div className="text-xs sm:text-sm mt-1" style={{ color: "#86868B" }}>
                Podejrzyj lub wgraj nowy plik PDF (max 20 MB).
              </div>
            </div>
          </div>
          <div
            className="px-5 sm:px-7 pb-5 sm:pb-6 pt-4"
            style={{ borderTop: "1px solid #E8E8ED" }}
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
              {([
                { key: "cepik" as const, label: "CEPIK", has: docStatus.has_cepik },
                { key: "damage_history" as const, label: "Historia szkodowości", has: docStatus.has_damage_history },
              ]).map(d => {
                const busy = docBusy.has(d.key)
                return (
                  <div
                    key={d.key}
                    style={{
                      border: "1px solid #E8E8ED",
                      borderRadius: 10,
                      background: "#fff",
                      padding: 14,
                      display: "flex",
                      flexDirection: "column",
                      gap: 10,
                    }}
                  >
                    <div className="flex items-center gap-2">
                      <i className="fa-solid fa-file-pdf" style={{ color: "#B71C1C", fontSize: 16 }} />
                      <div className="font-semibold" style={{ fontSize: 13, color: "#1D1D1F" }}>{d.label}</div>
                      <span
                        className="ml-auto text-[10px] font-bold uppercase"
                        style={{
                          padding: "2px 8px",
                          borderRadius: 999,
                          background: d.has ? "#ECFDF5" : "#F5F5F7",
                          color: d.has ? "#047857" : "#86868B",
                          letterSpacing: 1,
                        }}
                      >
                        {d.has ? "Dostępny" : "Brak"}
                      </span>
                    </div>
                    <div className="flex gap-2 mt-auto">
                      <a
                        href={d.has ? `/api/report/${dealId}/document/${d.key}` : undefined}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-disabled={!d.has}
                        className="flex-1 inline-flex items-center justify-center gap-1.5 text-xs font-semibold transition-colors"
                        style={{
                          minHeight: 36,
                          borderRadius: 8,
                          background: d.has ? "#fff" : "#F5F5F7",
                          color: d.has ? "#1D1D1F" : "#AEAEB2",
                          border: "1px solid #E8E8ED",
                          pointerEvents: d.has ? "auto" : "none",
                          opacity: d.has ? 1 : 0.6,
                        }}
                      >
                        <i className="fa-solid fa-eye" style={{ fontSize: 11 }} />
                        Podgląd
                      </a>
                      <label
                        className="flex-1 inline-flex items-center justify-center gap-1.5 text-xs font-semibold cursor-pointer transition-colors"
                        style={{
                          minHeight: 36,
                          borderRadius: 8,
                          background: busy ? "#F5F5F7" : "#FEF2F2",
                          color: busy ? "#AEAEB2" : "#B71C1C",
                          border: `1px solid ${busy ? "#E8E8ED" : "rgba(183,28,28,0.3)"}`,
                          opacity: busy ? 0.6 : 1,
                          pointerEvents: busy ? "none" : "auto",
                        }}
                      >
                        <i className={`fa-solid ${busy ? "fa-spinner fa-spin" : "fa-upload"}`} style={{ fontSize: 11 }} />
                        {d.has ? "Zamień" : "Wgraj"}
                        <input
                          type="file"
                          accept=".pdf,application/pdf"
                          style={{ display: "none" }}
                          onChange={e => {
                            const f = e.target.files?.[0]
                            if (f) onReplaceDocument(d.key, f)
                            e.target.value = ""
                          }}
                        />
                      </label>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </section>
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
