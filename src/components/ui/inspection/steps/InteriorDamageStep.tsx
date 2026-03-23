"use client";

import { useInspectionStore } from "@/store/useInspectionStore";
import { DamageBlock } from "../DamageBlock";
import { Plus, Armchair } from "lucide-react";
import type { DamageEntry } from "@/store/useInspectionStore";

const INTERIOR_PARTS = [
    "Fotel kierowcy", "Fotel pasażera",
    "Kanapa tylna", "Zagłówki",
    "Deska rozdzielcza", "Konsola środkowa",
    "Kierownica", "Dźwignia zmiany biegów",
    "Podsufitka", "Wykładzina podłogowa",
    "Panel drzwi przednich lewych", "Panel drzwi przednich prawych",
    "Panel drzwi tylnych lewych", "Panel drzwi tylnych prawych",
    "Podłokietnik", "Schowek",
    "Lusterko wsteczne", "Osłony przeciwsłoneczne",
    "Pas bezpieczeństwa przód", "Pas bezpieczeństwa tył",
    "Bagażnik — wykładzina", "Bagażnik — ścianki",
    "Pedały", "Dywaniki",
    "Inne",
];

const INTERIOR_DAMAGE_TYPES = [
    "Zarysowanie", "Przetarcie", "Rozdarcie",
    "Zabrudzenie", "Przypalenie", "Pęknięcie",
    "Brak elementu", "Uszkodzenie mechaniczne",
    "Odbarwienie", "Plama", "Złamanie",
    "Inne",
];

export function InteriorDamageStep() {
    const { data, addDamage, removeDamage, updateDamage, jobs } = useInspectionStore();
    const dealId = jobs.currentJobId;
    const damages = data.interiorDamage;

    const handleAdd = () => {
        const entry: DamageEntry = {
            id: `int-${Date.now()}`,
            part: '',
            type: '',
            size: '',
            description: '',
            action: '',
            photos: [],
        };
        addDamage('interiorDamage', entry);
    };

    return (
        <div className="space-y-4 animate-fade-in">
            <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                    <Armchair size={18} className="text-primary" />
                    <h3 className="text-sm font-bold text-foreground uppercase tracking-wider">
                        Uszkodzenia Wewnętrzne
                    </h3>
                </div>
                <span className="text-xs font-bold text-secondary">
                    {damages.length} {damages.length === 1 ? 'uszkodzenie' : 'uszkodzeń'}
                </span>
            </div>

            {damages.length === 0 && (
                <div className="section-card text-center py-8">
                    <Armchair size={32} className="mx-auto text-muted mb-2" />
                    <p className="text-sm text-secondary font-medium">Brak uszkodzeń wewnętrznych</p>
                    <p className="text-xs text-muted">Kliknij poniżej aby dodać uszkodzenie</p>
                </div>
            )}

            {damages.map((dmg, i) => (
                <DamageBlock
                    key={dmg.id}
                    entry={dmg}
                    index={i}
                    dealId={dealId}
                    parts={INTERIOR_PARTS}
                    types={INTERIOR_DAMAGE_TYPES}
                    onUpdate={(update) => updateDamage('interiorDamage', dmg.id, update)}
                    onRemove={() => removeDamage('interiorDamage', dmg.id)}
                    onAddPhoto={(b64) => updateDamage('interiorDamage', dmg.id, { photos: [...dmg.photos, b64] })}
                />
            ))}

            <button
                onClick={handleAdd}
                className="w-full py-5 border-2 border-dashed border-primary text-primary rounded-2xl font-black text-sm uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-primary-light transition-all active:scale-[0.95]"
                aria-label="Add interior damage"
            >
                <Plus size={20} className="stroke-[3]" />
                Dodaj uszkodzenie
            </button>
        </div>
    );
}
