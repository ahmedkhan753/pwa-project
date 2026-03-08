"use client";

import { useInspectionStore } from "@/store/useInspectionStore";
import { ScanLine, Car, User, Building2, MapPin, Calendar, UserCheck } from "lucide-react";

export function VehicleDataStep() {
    const { data, updateField } = useInspectionStore();
    const v = data.vehicleData;
    const bi = v.basicInfo;

    const handleChange = (field: string, value: string) => {
        updateField('vehicleData', field, value);
    };

    const handleBasicInfoChange = (field: string, value: string) => {
        updateField('vehicleData', 'basicInfo', { ...bi, [field]: value });
    };

    return (
        <div className="space-y-6 animate-fade-in">
            {/* ── Basic Info (Read-Only) ─────────────────────── */}
            <div className="section-card border-l-4 border-l-primary">
                <div className="flex items-center gap-2 mb-3">
                    <Building2 size={18} className="text-primary" />
                    <h3 className="text-sm font-bold text-foreground uppercase tracking-wider">
                        Informacje Podstawowe
                    </h3>
                    <span className="badge-warning text-[9px] ml-auto">TYLKO ODCZYT</span>
                </div>
                <div className="grid gap-3">
                    <ReadOnlyField icon={<Building2 size={14} />} label="Firma" value={bi.companyName} placeholder="Nazwa firmy" onChange={(v) => handleBasicInfoChange('companyName', v)} />
                    <ReadOnlyField icon={<User size={14} />} label="Właściciel / Użytkownik" value={bi.userOwner} placeholder="Imię i nazwisko" onChange={(v) => handleBasicInfoChange('userOwner', v)} />
                    <ReadOnlyField icon={<MapPin size={14} />} label="Miejsce oględzin" value={bi.inspectionPlace} placeholder="Adres" onChange={(v) => handleBasicInfoChange('inspectionPlace', v)} />
                    <ReadOnlyField icon={<Calendar size={14} />} label="Data oględzin" value={bi.inspectionDate} placeholder="DD.MM.YYYY" onChange={(v) => handleBasicInfoChange('inspectionDate', v)} />
                    <ReadOnlyField icon={<UserCheck size={14} />} label="Inspektor" value={bi.inspectorName} placeholder="Imię i nazwisko" onChange={(v) => handleBasicInfoChange('inspectorName', v)} />
                </div>
            </div>

            {/* ── VIN Section ────────────────────────────────── */}
            <div className="section-card">
                <div className="flex items-center gap-2 mb-3">
                    <Car size={18} className="text-primary" />
                    <h3 className="text-sm font-bold text-foreground uppercase tracking-wider">
                        Dane Pojazdu
                    </h3>
                </div>

                {/* VIN with OCR trigger */}
                <div className="mb-4">
                    <label className="text-xs font-bold text-secondary uppercase tracking-wider mb-1 block">
                        Numer VIN
                    </label>
                    <div className="flex gap-2">
                        <input
                            type="text"
                            value={v.vin}
                            onChange={(e) => handleChange('vin', e.target.value.toUpperCase())}
                            maxLength={17}
                            placeholder="WVWZZZ3CZWE123456"
                            aria-label="VIN number"
                            className="flex-1 py-3 px-4 font-mono text-lg tracking-widest rounded-xl border-2 border-border bg-surface text-foreground uppercase"
                        />
                        <button
                            className="px-4 py-3 bg-primary text-white rounded-xl flex items-center gap-1 font-bold text-sm active:scale-95 transition-transform"
                            aria-label="Scan VIN with camera"
                        >
                            <ScanLine size={18} />
                            OCR
                        </button>
                    </div>
                    {v.vin && v.vin.length !== 17 && (
                        <p className="text-xs text-danger mt-1 font-medium">VIN musi mieć 17 znaków ({v.vin.length}/17)</p>
                    )}
                </div>

                <div className="grid grid-cols-2 gap-3">
                    <FormField label="Nr rejestracyjny" value={v.registrationPlates} onChange={(val) => handleChange('registrationPlates', val)} placeholder="XX 12345" />
                    <FormField label="Marka" value={v.make} onChange={(val) => handleChange('make', val)} placeholder="np. BMW" />
                    <FormField label="Model" value={v.model} onChange={(val) => handleChange('model', val)} placeholder="np. X5" />
                    <FormField label="Rok produkcji" value={v.year} onChange={(val) => handleChange('year', val)} placeholder="2020" type="number" />
                    <FormField label="Kolor" value={v.color} onChange={(val) => handleChange('color', val)} placeholder="np. Czarny" />
                    <FormField label="Przebieg (km)" value={v.mileage} onChange={(val) => handleChange('mileage', val)} placeholder="np. 85000" type="number" />
                    <FormField label="Poj. silnika (cm³)" value={v.engineCapacity} onChange={(val) => handleChange('engineCapacity', val)} placeholder="np. 2000" type="number" />
                    <FormField label="Moc (KM)" value={v.enginePower} onChange={(val) => handleChange('enginePower', val)} placeholder="np. 150" type="number" />
                    <FormField label="Rodzaj paliwa" value={v.fuelType} onChange={(val) => handleChange('fuelType', val)} placeholder="Benzyna / Diesel" />
                    <FormField label="Typ nadwozia" value={v.bodyType} onChange={(val) => handleChange('bodyType', val)} placeholder="SUV / Sedan" />
                    <FormField label="Masa własna (kg)" value={v.ownWeight} onChange={(val) => handleChange('ownWeight', val)} placeholder="np. 1500" type="number" />
                    <FormField label="Ładowność (kg)" value={v.loadCapacity} onChange={(val) => handleChange('loadCapacity', val)} placeholder="np. 500" type="number" />
                    <FormField label="Masa całkowita (kg)" value={v.totalWeight} onChange={(val) => handleChange('totalWeight', val)} placeholder="np. 2000" type="number" />
                    <FormField label="Liczba miejsc" value={v.seatsCount} onChange={(val) => handleChange('seatsCount', val)} placeholder="5" type="number" />
                    <FormField label="Liczba drzwi" value={v.doorsCount} onChange={(val) => handleChange('doorsCount', val)} placeholder="5" type="number" />
                    <FormField label="Pierwsza rejestracja" value={v.firstRegistration} onChange={(val) => handleChange('firstRegistration', val)} placeholder="DD.MM.YYYY" />
                    <FormField label="Skrzynia biegów" value={v.gearboxType} onChange={(val) => handleChange('gearboxType', val)} placeholder="Manualna / Auto" />
                    <FormField label="Napęd" value={v.driveType} onChange={(val) => handleChange('driveType', val)} placeholder="FWD / RWD / AWD" />
                </div>
            </div>
        </div>
    );
}

// ── Reusable Form Field ──
function FormField({ label, value, onChange, placeholder, type = 'text' }: {
    label: string; value: string; onChange: (v: string) => void; placeholder: string; type?: string;
}) {
    return (
        <div>
            <label className="text-xs font-bold text-secondary uppercase tracking-wider mb-1 block">
                {label}
            </label>
            <input
                type={type}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                placeholder={placeholder}
                aria-label={label}
                className="w-full py-2.5 px-3 rounded-xl border-2 border-border bg-surface text-foreground text-sm font-medium"
            />
        </div>
    );
}

// ── Read-Only Field ──
function ReadOnlyField({ icon, label, value, placeholder, onChange }: {
    icon: React.ReactNode; label: string; value: string; placeholder: string; onChange: (v: string) => void;
}) {
    return (
        <div className="flex items-center gap-3 bg-gray-50 dark:bg-gray-800/50 rounded-xl px-3 py-2.5">
            <div className="text-primary flex-shrink-0">{icon}</div>
            <div className="flex-1 min-w-0">
                <span className="text-[10px] font-bold text-secondary uppercase tracking-wider block mb-0.5">{label}</span>
                <input
                    type="text"
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    placeholder={placeholder}
                    disabled
                    aria-label={label}
                    className="w-full bg-transparent text-sm font-medium text-foreground disabled:text-muted disabled:cursor-not-allowed border-none p-0 focus:ring-0 outline-none"
                />
            </div>
        </div>
    );
}
