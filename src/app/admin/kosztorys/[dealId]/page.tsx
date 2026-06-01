"use client"
import { useCallback, useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import type {
  MacadamData,
  MacadamPart,
  MacadamVehicleHeader,
} from "@/types/kosztorysMacadam"

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"

interface AvailableDamage {
  source: "ext" | "int"
  index: number | null
  location: string
  type: string
  size: string
  description: string
  photo_urls: string[]
}

interface MacadamGetResponse extends MacadamData {
  available_damages: AvailableDamage[]
}

const emptyVehicle = (): MacadamVehicleHeader => ({
  make_model: "",
  variant: "",
  vin: "",
  registration_plate: "",
  grupa: "",
  mileage_km: null,
  first_registration: "",
  body_colour: "",
  klient: "",
  inspection_date: "",
  inspection_address: "",
  main_photo_url: null,
})

const newPartId = () =>
  (typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `p-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`)

function reindex(parts: MacadamPart[]): MacadamPart[] {
  return parts.map((p, i) => ({ ...p, index: i + 1 }))
}

function computeTotals(parts: MacadamPart[]) {
  return parts.reduce(
    (acc, p) => ({
      koszty_naprawy_pln: acc.koszty_naprawy_pln + (p.koszty_naprawy_pln ?? 0),
      amortyzacja_pln:    acc.amortyzacja_pln    + (p.koszt_amortyzacji_pln ?? 0),
      netto_pln:          acc.netto_pln          + (p.koszt_netto_pln ?? 0),
    }),
    { koszty_naprawy_pln: 0, amortyzacja_pln: 0, netto_pln: 0 }
  )
}

function parseNumberOrNull(raw: string): number | null {
  const cleaned = raw.replace(",", ".").trim()
  if (cleaned === "") return null
  const n = parseFloat(cleaned)
  return Number.isFinite(n) ? n : null
}

export default function AdminMacadamEditPage({
  params,
}: {
  params: { dealId: string }
}) {
  const { dealId } = params
  const router = useRouter()
  const [token, setToken] = useState<string | null>(null)

  const [vehicle, setVehicle] = useState<MacadamVehicleHeader>(emptyVehicle())
  const [parts, setParts] = useState<MacadamPart[]>([])
  const [available, setAvailable] = useState<AvailableDamage[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<{
    kind: "ok" | "err"
    msg: string
  } | null>(null)

  useEffect(() => {
    if (typeof window === "undefined") return
    const t = sessionStorage.getItem("admin_token")
    if (!t) {
      router.push("/admin")
      return
    }
    setToken(t)
  }, [router])

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`${API_BASE}/kosztorys-costs/${dealId}`, {
        cache: "no-store",
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json: MacadamGetResponse = await res.json()
      setVehicle(json.vehicle ?? emptyVehicle())
      setParts(reindex(json.parts ?? []))
      setAvailable(json.available_damages ?? [])
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      setToast({ kind: "err", msg: `Nie udało się wczytać: ${msg}` })
    } finally {
      setLoading(false)
    }
  }, [dealId])

  useEffect(() => {
    if (token) void fetchData()
  }, [token, fetchData])

  const usedDamageKeys = useMemo(() => {
    const used = new Set<string>()
    for (const p of parts) {
      const k = (p as MacadamPart & { _src_key?: string })._src_key
      if (k) used.add(k)
    }
    return used
  }, [parts])

  const onAddDamage = (d: AvailableDamage) => {
    const srcKey = `${d.source}-${d.index ?? ""}`
    const part: MacadamPart & { _src_key?: string } = {
      id: newPartId(),
      index: parts.length + 1,
      location: d.source === "int" ? "interior" : "exterior",
      czesc: d.location || d.type || "",
      typ: d.type,
      tryb_naprawy: "",
      koszty_naprawy_pln: null,
      koszt_amortyzacji_pln: null,
      koszt_netto_pln: null,
      photos: [...d.photo_urls],
    }
    Object.defineProperty(part, "_src_key", {
      value: srcKey,
      enumerable: false,
    })
    setParts(prev => reindex([...prev, part]))
  }

  const onAddManual = () => {
    const part: MacadamPart = {
      id: newPartId(),
      index: parts.length + 1,
      location: "exterior",
      czesc: "",
      typ: "",
      tryb_naprawy: "",
      koszty_naprawy_pln: null,
      koszt_amortyzacji_pln: null,
      koszt_netto_pln: null,
      photos: [],
    }
    setParts(prev => reindex([...prev, part]))
  }

  const updatePart = (id: string, patch: Partial<MacadamPart>) => {
    setParts(prev => prev.map(p => (p.id === id ? { ...p, ...patch } : p)))
  }

  const removePart = (id: string) => {
    setParts(prev => reindex(prev.filter(p => p.id !== id)))
  }

  const removePhotoFromPart = (partId: string, photoIdx: number) => {
    setParts(prev =>
      prev.map(p =>
        p.id === partId
          ? { ...p, photos: p.photos.filter((_, i) => i !== photoIdx) }
          : p
      )
    )
  }

  const onSave = async () => {
    if (!token) return
    // Strip the non-enumerable _src_key off the parts before sending.
    const cleanParts: MacadamPart[] = parts.map(p => ({
      id: p.id,
      index: p.index,
      location: p.location,
      czesc: p.czesc.trim(),
      typ: p.typ,
      tryb_naprawy: p.tryb_naprawy,
      koszty_naprawy_pln: p.koszty_naprawy_pln,
      koszt_amortyzacji_pln: p.koszt_amortyzacji_pln,
      koszt_netto_pln: p.koszt_netto_pln,
      photos: p.photos,
    }))
    const missing = cleanParts.findIndex(p => !p.czesc)
    if (missing >= 0) {
      setToast({
        kind: "err",
        msg: `Pozycja #${missing + 1}: pole "Część" jest wymagane`,
      })
      return
    }
    const payload: MacadamData = {
      vehicle,
      parts: cleanParts,
      totals: computeTotals(cleanParts),
    }
    setSaving(true)
    try {
      const res = await fetch(`${API_BASE}/kosztorys-costs/${dealId}`, {
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
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setToast({ kind: "ok", msg: "Zapisano kosztorys" })
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      setToast({ kind: "err", msg: `Nie udało się zapisać: ${msg}` })
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "Inter, system-ui, sans-serif",
          color: "#6B7280",
        }}
      >
        Ładowanie…
      </div>
    )
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#FAFAFA",
        color: "#1D1D1F",
        fontFamily: "Inter, system-ui, sans-serif",
      }}
    >
      <div
        style={{
          maxWidth: 1100,
          margin: "0 auto",
          padding: "32px 24px 120px",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            marginBottom: 24,
          }}
        >
          <button
            type="button"
            onClick={() => router.push("/admin/reports")}
            style={{
              background: "#fff",
              border: "1px solid #E8E8ED",
              borderRadius: 8,
              padding: "6px 12px",
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            ← Lista
          </button>
          <div style={{ flex: 1 }}>
            <div
              style={{
                fontSize: 11,
                color: "#B71C1C",
                fontWeight: 700,
                letterSpacing: 1,
                textTransform: "uppercase",
              }}
            >
              Kosztorys · Zlecenie #{dealId}
            </div>
            <h1
              style={{
                fontSize: 22,
                fontWeight: 800,
                margin: "2px 0 0",
              }}
            >
              Kosztorys ponadnormatywny
            </h1>
          </div>
          <a
            href={`/kosztorys/${dealId}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              fontSize: 12,
              color: "#16A34A",
              border: "1px solid #16A34A",
              borderRadius: 6,
              padding: "6px 12px",
              textDecoration: "none",
              fontWeight: 600,
            }}
          >
            Otwórz raport ↗
          </a>
        </div>

        {/* Vehicle (read-only) */}
        <Section title="Pojazd" subtitle="Prefill z inspekcji — tylko podgląd">
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
              gap: 10,
            }}
          >
            <ReadOnlyRow label="Marka/Model" value={vehicle.make_model} />
            <ReadOnlyRow label="VIN" value={vehicle.vin} mono />
            <ReadOnlyRow
              label="Rejestracja"
              value={vehicle.registration_plate}
            />
            <ReadOnlyRow
              label="Przebieg"
              value={
                vehicle.mileage_km !== null
                  ? `${vehicle.mileage_km} km`
                  : ""
              }
            />
            <ReadOnlyRow
              label="Pierwsza rejestracja"
              value={vehicle.first_registration}
            />
            <ReadOnlyRow label="Kolor" value={vehicle.body_colour} />
            <ReadOnlyRow label="Klient" value={vehicle.klient} />
            <ReadOnlyRow
              label="Data inspekcji"
              value={vehicle.inspection_date}
            />
          </div>
        </Section>

        {/* Parts */}
        <Section
          title="Wybrane pozycje"
          subtitle={`${parts.length} ${
            parts.length === 1 ? "pozycja" : "pozycji"
          } — koszty wprowadzane ręcznie`}
        >
          {parts.length === 0 ? (
            <div style={{ color: "#86868B", fontSize: 13 }}>
              Brak pozycji. Dodaj z listy dostępnych uszkodzeń poniżej lub ręcznie.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {parts.map(p => (
                <PartEditor
                  key={p.id}
                  part={p}
                  onChange={patch => updatePart(p.id, patch)}
                  onRemove={() => removePart(p.id)}
                  onRemovePhoto={i => removePhotoFromPart(p.id, i)}
                />
              ))}
            </div>
          )}
          <button
            type="button"
            onClick={onAddManual}
            style={{
              marginTop: 14,
              background: "#fff",
              border: "1px dashed #B71C1C",
              color: "#B71C1C",
              borderRadius: 8,
              padding: "8px 14px",
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            + Dodaj pozycję ręcznie
          </button>
        </Section>

        {/* Available damages */}
        <Section
          title="Dostępne uszkodzenia (z inspekcji)"
          subtitle="Kliknij „Dodaj”, aby utworzyć pozycję ze zdjęciami"
        >
          {available.length === 0 ? (
            <div style={{ color: "#86868B", fontSize: 13 }}>
              Brak uszkodzeń w danych inspekcji.
            </div>
          ) : (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
                gap: 10,
              }}
            >
              {available.map((d, i) => {
                const k = `${d.source}-${d.index ?? ""}`
                const isUsed = usedDamageKeys.has(k)
                return (
                  <div
                    key={`${k}-${i}`}
                    style={{
                      border: "1px solid #E8E8ED",
                      background: isUsed ? "#F5F5F7" : "#fff",
                      borderRadius: 10,
                      padding: 12,
                      display: "flex",
                      flexDirection: "column",
                      gap: 8,
                    }}
                  >
                    <div
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        color: d.source === "int" ? "#0369A1" : "#B71C1C",
                        textTransform: "uppercase",
                        letterSpacing: 1,
                      }}
                    >
                      {d.source === "int" ? "Wnętrze" : "Zewnątrz"} · #
                      {d.index ?? "?"}
                    </div>
                    <div style={{ fontWeight: 700, fontSize: 13 }}>
                      {d.location || "(brak nazwy)"}
                    </div>
                    <div style={{ fontSize: 12, color: "#6B7280" }}>
                      {d.type}
                      {d.size ? ` · ${d.size}` : ""}
                    </div>
                    {d.photo_urls.length > 0 && (
                      <div
                        style={{
                          fontSize: 11,
                          color: "#86868B",
                        }}
                      >
                        {d.photo_urls.length}{" "}
                        {d.photo_urls.length === 1 ? "zdjęcie" : "zdjęć"}
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => onAddDamage(d)}
                      disabled={isUsed}
                      style={{
                        marginTop: "auto",
                        background: isUsed ? "#F5F5F7" : "#FEF2F2",
                        border: `1px solid ${
                          isUsed ? "#E8E8ED" : "rgba(183,28,28,0.3)"
                        }`,
                        color: isUsed ? "#AEAEB2" : "#B71C1C",
                        borderRadius: 6,
                        padding: "6px 12px",
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: isUsed ? "not-allowed" : "pointer",
                      }}
                    >
                      {isUsed ? "Dodane" : "Dodaj"}
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </Section>
      </div>

      {/* Sticky save bar */}
      <div
        style={{
          position: "fixed",
          bottom: 0,
          left: 0,
          right: 0,
          background: "#fff",
          borderTop: "1px solid #E8E8ED",
          boxShadow: "0 -4px 12px rgba(0,0,0,0.05)",
        }}
      >
        <div
          style={{
            maxWidth: 1100,
            margin: "0 auto",
            padding: "14px 24px",
            display: "flex",
            alignItems: "center",
            gap: 12,
            justifyContent: "space-between",
          }}
        >
          <div style={{ fontSize: 13, color: "#6B7280" }}>
            {parts.length} pozycji · netto{" "}
            <strong style={{ color: "#16A34A" }}>
              {computeTotals(parts).netto_pln.toLocaleString("pl-PL", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}{" "}
              PLN
            </strong>
          </div>
          <button
            type="button"
            onClick={onSave}
            disabled={saving}
            style={{
              background: saving ? "#F5F5F7" : "#B71C1C",
              color: saving ? "#AEAEB2" : "#fff",
              border: "none",
              borderRadius: 8,
              padding: "10px 18px",
              fontSize: 14,
              fontWeight: 700,
              cursor: saving ? "not-allowed" : "pointer",
            }}
          >
            {saving ? "Zapisywanie…" : "Zapisz"}
          </button>
        </div>
      </div>

      {toast && (
        <div
          role="alert"
          style={{
            position: "fixed",
            top: 16,
            right: 16,
            zIndex: 100,
            background: toast.kind === "ok" ? "#ECFDF5" : "#FEF2F2",
            border: `1px solid ${
              toast.kind === "ok" ? "#A7F3D0" : "#FECACA"
            }`,
            color: toast.kind === "ok" ? "#047857" : "#B91C1C",
            padding: "10px 14px",
            borderRadius: 8,
            fontSize: 13,
            fontWeight: 600,
            maxWidth: 380,
            boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
            display: "flex",
            alignItems: "center",
            gap: 12,
          }}
        >
          <span style={{ flex: 1 }}>{toast.msg}</span>
          <button
            type="button"
            onClick={() => setToast(null)}
            aria-label="Zamknij"
            style={{
              background: "transparent",
              border: "none",
              color: "inherit",
              fontWeight: 700,
              cursor: "pointer",
              fontSize: 16,
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>
      )}
    </div>
  )
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function Section({
  title,
  subtitle,
  children,
}: {
  title: string
  subtitle?: string
  children: React.ReactNode
}) {
  return (
    <section
      style={{
        background: "#fff",
        border: "1px solid #E8E8ED",
        borderRadius: 12,
        padding: 20,
        boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
        marginBottom: 20,
      }}
    >
      <div style={{ marginBottom: 14 }}>
        <div
          style={{
            fontSize: 16,
            fontWeight: 700,
          }}
        >
          {title}
        </div>
        {subtitle && (
          <div style={{ fontSize: 12, color: "#86868B", marginTop: 2 }}>
            {subtitle}
          </div>
        )}
      </div>
      {children}
    </section>
  )
}

function ReadOnlyRow({
  label,
  value,
  mono,
}: {
  label: string
  value: string
  mono?: boolean
}) {
  return (
    <div
      style={{
        background: "#F9FAFB",
        border: "1px solid #F3F4F6",
        borderRadius: 8,
        padding: "8px 12px",
      }}
    >
      <div
        style={{
          fontSize: 10,
          color: "#86868B",
          fontWeight: 600,
          letterSpacing: 0.4,
          textTransform: "uppercase",
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 13,
          color: "#1D1D1F",
          fontFamily: mono
            ? "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace"
            : undefined,
          overflowWrap: "anywhere",
        }}
      >
        {value || "—"}
      </div>
    </div>
  )
}

function PartEditor({
  part,
  onChange,
  onRemove,
  onRemovePhoto,
}: {
  part: MacadamPart
  onChange: (patch: Partial<MacadamPart>) => void
  onRemove: () => void
  onRemovePhoto: (idx: number) => void
}) {
  return (
    <div
      style={{
        border: "1px solid #E8E8ED",
        borderRadius: 10,
        padding: 14,
        background: "#FAFBFC",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          marginBottom: 10,
        }}
      >
        <div
          style={{
            background: "#1D1D1F",
            color: "#fff",
            borderRadius: 6,
            padding: "3px 8px",
            fontSize: 12,
            fontWeight: 700,
            minWidth: 28,
            textAlign: "center",
          }}
        >
          {part.index}
        </div>
        <select
          value={part.location}
          onChange={e =>
            onChange({
              location:
                e.target.value === "interior" ? "interior" : "exterior",
            })
          }
          style={{
            background: "#fff",
            border: "1px solid #E8E8ED",
            borderRadius: 6,
            padding: "4px 8px",
            fontSize: 12,
          }}
        >
          <option value="exterior">Zewnątrz</option>
          <option value="interior">Wnętrze</option>
        </select>
        <div style={{ flex: 1 }} />
        <button
          type="button"
          onClick={onRemove}
          style={{
            background: "transparent",
            border: "1px solid #B71C1C",
            color: "#B71C1C",
            borderRadius: 6,
            padding: "4px 10px",
            fontSize: 12,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Usuń
        </button>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
          gap: 10,
        }}
      >
        <Field
          label="Część *"
          value={part.czesc}
          onChange={v => onChange({ czesc: v })}
          required
        />
        <Field
          label="Typ uszkodzenia"
          value={part.typ}
          onChange={v => onChange({ typ: v })}
        />
        <Field
          label="Tryb naprawy"
          value={part.tryb_naprawy}
          onChange={v => onChange({ tryb_naprawy: v })}
        />
        <NumberField
          label="Koszty naprawy (PLN)"
          value={part.koszty_naprawy_pln}
          onChange={n => onChange({ koszty_naprawy_pln: n })}
        />
        <NumberField
          label="Koszt amortyzacji (PLN)"
          value={part.koszt_amortyzacji_pln}
          onChange={n => onChange({ koszt_amortyzacji_pln: n })}
        />
        <NumberField
          label="Koszt netto (PLN)"
          value={part.koszt_netto_pln}
          onChange={n => onChange({ koszt_netto_pln: n })}
        />
      </div>

      {part.photos.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <div
            style={{
              fontSize: 11,
              color: "#86868B",
              fontWeight: 600,
              letterSpacing: 0.5,
              textTransform: "uppercase",
              marginBottom: 6,
            }}
          >
            Zdjęcia ({part.photos.length})
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(110px, 1fr))",
              gap: 8,
            }}
          >
            {part.photos.map((url, i) => (
              <div
                key={`${url}-${i}`}
                style={{
                  position: "relative",
                  aspectRatio: "4 / 3",
                  borderRadius: 6,
                  overflow: "hidden",
                  border: "1px solid #E8E8ED",
                  background: "#F5F5F7",
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={url}
                  alt=""
                  loading="lazy"
                  style={{
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                    display: "block",
                  }}
                />
                <button
                  type="button"
                  onClick={() => onRemovePhoto(i)}
                  aria-label="Usuń zdjęcie"
                  style={{
                    position: "absolute",
                    top: 4,
                    right: 4,
                    width: 24,
                    height: 24,
                    borderRadius: 12,
                    background: "rgba(0,0,0,0.65)",
                    color: "#fff",
                    border: "none",
                    cursor: "pointer",
                    fontSize: 14,
                    lineHeight: 1,
                    fontWeight: 700,
                  }}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function Field({
  label,
  value,
  onChange,
  required,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  required?: boolean
}) {
  return (
    <label
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 4,
      }}
    >
      <span
        style={{
          fontSize: 10,
          color: "#86868B",
          fontWeight: 600,
          letterSpacing: 0.4,
          textTransform: "uppercase",
        }}
      >
        {label}
      </span>
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        required={required}
        style={{
          background: "#fff",
          border: "1px solid #E8E8ED",
          borderRadius: 6,
          padding: "8px 10px",
          fontSize: 13,
          width: "100%",
        }}
      />
    </label>
  )
}

function NumberField({
  label,
  value,
  onChange,
}: {
  label: string
  value: number | null
  onChange: (n: number | null) => void
}) {
  const [draft, setDraft] = useState<string>(
    value === null || value === undefined
      ? ""
      : String(value)
  )

  useEffect(() => {
    setDraft(value === null || value === undefined ? "" : String(value))
  }, [value])

  return (
    <label
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 4,
      }}
    >
      <span
        style={{
          fontSize: 10,
          color: "#86868B",
          fontWeight: 600,
          letterSpacing: 0.4,
          textTransform: "uppercase",
        }}
      >
        {label}
      </span>
      <input
        type="text"
        inputMode="decimal"
        value={draft}
        placeholder="—"
        onChange={e => {
          const v = e.target.value
          setDraft(v)
          onChange(parseNumberOrNull(v))
        }}
        style={{
          background: "#fff",
          border: "1px solid #E8E8ED",
          borderRadius: 6,
          padding: "8px 10px",
          fontSize: 13,
          fontFamily:
            "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
          width: "100%",
        }}
      />
    </label>
  )
}
