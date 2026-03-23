"use client";

import { useInspectionStore } from "@/store/useInspectionStore";
import { DamageBlock } from "../DamageBlock";
import { Plus, AlertTriangle } from "lucide-react";
import type { DamageEntry } from "@/store/useInspectionStore";

const EXTERIOR_PARTS = [
    "Maska / Pokrywa silnika", "Zderzak przedni", "Zderzak tylny",
    "Błotnik przedni lewy", "Błotnik przedni prawy",
    "Błotnik tylny lewy", "Błotnik tylny prawy",
    "Drzwi przednie lewe", "Drzwi przednie prawe",
    "Drzwi tylne lewe", "Drzwi tylne prawe",
    "Dach", "Klapa / Pokrywa bagażnika",
    "Próg lewy", "Próg prawy",
    "Lusterko lewe", "Lusterko prawe",
    "Szyba przednia", "Szyba tylna",
    "Szyba boczna lewa", "Szyba boczna prawa",
    "Reflektor przedni lewy", "Reflektor przedni prawy",
    "Lampa tylna lewa", "Lampa tylna prawa",
    "Felga przednia lewa", "Felga przednia prawa",
    "Felga tylna lewa", "Felga tylna prawa",
    "Inne",
];

const DAMAGE_TYPES = [
    "Zarysowanie", "Wgniecenie", "Pęknięcie", "Odprysk",
    "Korozja / Rdza", "Lakierowanie", "Szpachlowanie",
    "Wytarcie", "Pęcherze lakieru", "Uszkodzenie mechaniczne",
    "Brak elementu", "Inne",
];

export function ExteriorDamageStep() {
    const { data, addDamage, removeDamage, updateDamage, jobs } = useInspectionStore();
    const dealId = jobs.currentJobId;
    const damages = data.exteriorDamage;

    const handleAdd = () => {
        const entry: DamageEntry = {
            id: `ext-${Date.now()}`,
            part: '',
            type: '',
            size: '',
            description: '',
            action: '',
            photos: [],
        };
        addDamage('exteriorDamage', entry);
    };

    return (
        <div className="space-y-4 animate-fade-in">
            <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                    <AlertTriangle size={18} className="text-primary" />
                    <h3 className="text-sm font-bold text-foreground uppercase tracking-wider">
                        Uszkodzenia Zewnętrzne
                    </h3>
                </div>
                <span className="text-xs font-bold text-secondary">
                    {damages.length} {damages.length === 1 ? 'uszkodzenie' : 'uszkodzeń'}
                </span>
            </div>

            {damages.length === 0 && (
                <div className="section-card text-center py-8">
                    <AlertTriangle size={32} className="mx-auto text-muted mb-2" />
                    <p className="text-sm text-secondary font-medium">Brak uszkodzeń zewnętrznych</p>
                    <p className="text-xs text-muted">Kliknij poniżej aby dodać uszkodzenie</p>
                </div>
            )}

            {damages.map((dmg, i) => (
                <DamageBlock
                    key={dmg.id}
                    entry={dmg}
                    index={i}
                    dealId={dealId}
                    parts={EXTERIOR_PARTS}
                    types={DAMAGE_TYPES}
                    onUpdate={(update) => updateDamage('exteriorDamage', dmg.id, update)}
                    onRemove={() => removeDamage('exteriorDamage', dmg.id)}
                    onAddPhoto={(b64) => updateDamage('exteriorDamage', dmg.id, { photos: [...dmg.photos, b64] })}
                />
            ))}

            <button
                onClick={handleAdd}
                className="w-full py-5 border-2 border-dashed border-primary text-primary rounded-2xl font-black text-sm uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-primary-light transition-all active:scale-[0.95]"
                aria-label="Add exterior damage"
            >
                <Plus size={20} className="stroke-[3]" />
                Dodaj uszkodzenie
            </button>
        </div>
    );
}
