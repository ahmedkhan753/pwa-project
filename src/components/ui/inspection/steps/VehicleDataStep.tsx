"use client";

import { useInspectionStore } from "@/store/useInspectionStore";
import { ScanLine, Car, User, Building2, MapPin, Calendar, UserCheck, Loader2 } from "lucide-react";
import { useState, useEffect } from "react";
import { VinScanner } from "../VinScanner";
import { SmartDropdown } from "../SmartDropdown";
import { apiClient } from "@/api/client";
import { cn } from "@/lib/utils";

export function VehicleDataStep() {
    const { data, updateField } = useInspectionStore();
    const v = data.vehicleData;
    const bi = v.basicInfo;
    const [showScanner, setShowScanner] = useState(false);
    const [metadata, setMetadata] = useState<any>({});
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const loadMetadata = async () => {
            try {
                const meta = await apiClient.getMetadata();
                setMetadata(meta);
            } catch (e) {
                console.error("Failed to load vehicle metadata", e);
            } finally {
                setIsLoading(false);
            }
        };
        loadMetadata();
    }, []);

    const handleChange = (field: string, value: string) => {
        updateField('vehicleData', field, value);
    };

    const handleBasicInfoChange = (field: string, value: string) => {
        updateField('vehicleData', 'basicInfo', { ...bi, [field]: value });
    };

    if (isLoading) {
        return (
            <div className="flex flex-col items-center justify-center py-20 gap-4">
                <Loader2 size={40} className="text-blue-500 animate-spin" />
                <p className="text-slate-500 font-bold animate-pulse uppercase tracking-widest text-xs">Pobieranie danych Bitrix24...</p>
            </div>
        );
    }

    return (
        <div className="space-y-6 animate-fade-in">
            {/* ── Basic Info (Read-Only) ─────────────────────── */}
            <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm border-l-[6px] border-l-blue-500">
                <div className="flex items-center gap-2 mb-4">
                    <Building2 size={18} className="text-blue-500" />
                    <h3 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-tight">
                        Informacje Podstawowe
                    </h3>
                    <span className="text-[9px] bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 font-black px-2 py-1 rounded-md ml-auto uppercase">TYLKO ODCZYT</span>
                </div>
                <div className="grid gap-3">
                    <ReadOnlyField icon={<Building2 size={14} />} label="Firma" value={bi.companyName} placeholder="Nazwa firmy" />
                    <ReadOnlyField icon={<User size={14} />} label="Właściciel / Użytkownik" value={bi.userOwner} placeholder="Imię i nazwisko" />
                    <ReadOnlyField icon={<MapPin size={14} />} label="Miejsce oględzin" value={bi.inspectionPlace} placeholder="Adres" />
                    <ReadOnlyField icon={<Calendar size={14} />} label="Data oględzin" value={bi.inspectionDate} placeholder="DD.MM.YYYY" />
                    <ReadOnlyField icon={<UserCheck size={14} />} label="Inspektor" value={bi.inspectorName} placeholder="Imię i nazwisko" />
                </div>
            </div>

            {/* ── VIN Section ────────────────────────────────── */}
            <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-6 shadow-lg">
                <div className="flex items-center gap-2 mb-6">
                    <Car size={18} className="text-blue-500" />
                    <h3 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-tight">
                        Dane Pojazdu
                    </h3>
                </div>

                {/* VIN with OCR trigger */}
                <div className="mb-8">
                    <label className="text-xs font-black text-slate-500 uppercase tracking-widest mb-2 block px-1">
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
                            className="flex-1 py-4 px-5 font-mono text-xl tracking-[0.2em] rounded-2xl border-2 border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-white uppercase shadow-inner"
                        />
                        <button
                            type="button"
                            onClick={() => setShowScanner(true)}
                            className="px-6 py-4 bg-blue-600 text-white rounded-2xl flex items-center gap-2 font-black text-xs uppercase shadow-lg shadow-blue-500/20 active:scale-95 transition-all"
                            aria-label="Scan VIN with camera"
                        >
                            <ScanLine size={20} />
                            OCR
                        </button>
                    </div>
                    {v.vin && v.vin.length !== 17 && (
                        <p className="text-xs text-rose-500 mt-2 font-black uppercase tracking-tight">VIN musi mieć 17 znaków ({v.vin.length}/17)</p>
                    )}
                </div>

                {showScanner && (
                    <VinScanner
                        onScan={(vin) => handleChange('vin', vin)}
                        onClose={() => setShowScanner(false)}
                    />
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    <FormField label="Nr rejestracyjny" value={v.registrationPlates} onChange={(val) => handleChange('registrationPlates', val)} placeholder="XX 12345" />
                    
                    <SmartDropdown 
                        label="Marka" 
                        value={v.make} 
                        options={metadata.vehicle_brand || []} 
                        onChange={(v) => handleChange('make', v)} 
                        placeholder="Szukaj marki..."
                    />
                    
                    <SmartDropdown 
                        label="Model" 
                        value={v.model} 
                        options={metadata.vehicle_model || []} 
                        onChange={(v) => handleChange('model', v)} 
                        placeholder="Szukaj modelu..."
                    />

                    <FormField label="Rok produkcji" value={v.year} onChange={(val) => handleChange('year', val)} placeholder="2020" type="number" />
                    <FormField label="Kolor (tekst)" value={v.color} onChange={(val) => handleChange('color', val)} placeholder="np. Czarny Metallic" />
                    <FormField label="Przebieg (km)" value={v.mileage} onChange={(val) => handleChange('mileage', val)} placeholder="np. 85000" type="number" />
                    <FormField label="Poj. silnika (cm³)" value={v.engineCapacity} onChange={(val) => handleChange('engineCapacity', val)} placeholder="np. 1998" type="number" />
                    <FormField label="Moc (KM)" value={v.enginePower} onChange={(val) => handleChange('enginePower', val)} placeholder="np. 150" type="number" />
                    
                    <SmartDropdown 
                        label="Rodzaj paliwa" 
                        value={v.fuelType} 
                        options={metadata.fuel_type || []} 
                        onChange={(v) => handleChange('fuelType', v)} 
                        placeholder="Wybierz paliwo"
                    />

                    <SmartDropdown 
                        label="Typ nadwozia" 
                        value={v.bodyType} 
                        options={metadata.body_type || []} 
                        onChange={(v) => handleChange('bodyType', v)} 
                        placeholder="Wybierz nadwozie"
                    />

                    <FormField label="Pierwsza rejestracja" value={v.firstRegistration} onChange={(val) => handleChange('firstRegistration', val)} placeholder="DD.MM.YYYY" />
                    
                    <SmartDropdown 
                        label="Skrzynia biegów" 
                        value={v.gearboxType} 
                        options={metadata.gearbox_type || []} 
                        onChange={(v) => handleChange('gearboxType', v)} 
                        placeholder="Wybierz skrzynię"
                    />

                    <SmartDropdown 
                        label="Napęd" 
                        value={v.driveType} 
                        options={metadata.drive_type || []} 
                        onChange={(v) => handleChange('driveType', v)} 
                        placeholder="Wybierz napęd"
                    />
                    
                    <FormField label="Masa własna (kg)" value={v.ownWeight} onChange={(val) => handleChange('ownWeight', val)} placeholder="np. 1500" type="number" />
                    <FormField label="Masa całkowita (kg)" value={v.totalWeight} onChange={(val) => handleChange('totalWeight', val)} placeholder="np. 2000" type="number" />
                    <FormField label="Liczba miejsc" value={v.seatsCount} onChange={(val) => handleChange('seatsCount', val)} placeholder="5" type="number" />
                    <FormField label="Liczba drzwi" value={v.doorsCount} onChange={(val) => handleChange('doorsCount', val)} placeholder="5" type="number" />
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
            <label className="text-xs font-black text-slate-500 uppercase tracking-widest mb-2 block px-1">
                {label}
            </label>
            <input
                type={type}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                placeholder={placeholder}
                aria-label={label}
                className="w-full py-3.5 px-4 rounded-xl border-2 border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-sm font-bold placeholder:text-slate-300 dark:placeholder:text-slate-600 focus:border-blue-500 transition-all"
            />
        </div>
    );
}

// ── Read-Only Field (Values not editable per client request) ──
function ReadOnlyField({ icon, label, value, placeholder }: {
    icon: React.ReactNode; label: string; value: string; placeholder: string;
}) {
    return (
        <div className="flex items-center gap-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl px-4 py-3 border border-transparent shadow-inner">
            <div className="text-blue-500 flex-shrink-0 bg-white dark:bg-slate-800 p-2 rounded-xl shadow-sm">{icon}</div>
            <div className="flex-1 min-w-0">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">{label}</span>
                <span className={cn(
                    "block text-sm font-bold truncate",
                    value ? "text-slate-900 dark:text-white" : "text-slate-300 dark:text-slate-600 italic"
                )}>
                    {value || placeholder}
                </span>
            </div>
        </div>
    );
}
