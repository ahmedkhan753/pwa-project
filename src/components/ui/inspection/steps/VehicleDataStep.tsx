"use client";

import { useInspectionStore } from "@/store/useInspectionStore";
import { ScanLine, Car, User, Building2, MapPin, Calendar, UserCheck, Loader2 } from "lucide-react";
import { useState, useEffect } from "react";
import { VinScanner } from "../VinScanner";
import { SmartDropdown } from "../SmartDropdown";
import { api as apiClient } from "@/lib/api";
import { cn, formatLocaleDate } from "@/lib/utils";

const FUEL_TYPES = ["BENZYNA", "DIESEL", "LPG", "HYBRYDA", "ELEKTRYCZNY", "HYBRYDA PLUG-IN", "HYBRYDA DIESEL", "WODÓR", "NIE DOTYCZY"];
const BODY_TYPES = ["HATCHBACK", "SEDAN", "KOMBI", "SUV", "COUPE", "CABRIO", "VAN/MINIVAN", "PICKUP", "CROSSOVER"];
const GEARBOX_TYPES = ["MANUALNA", "AUTOMATYCZNA", "CVT", "DSG/DCT (DWUSPRZĘGŁOWA)"];
const DRIVE_TYPES = ["4x2 (FWD)", "4x2 (RWD)", "4x4 (AWD)", "4x4 (4WD)"];
const SEATS_OPTIONS = ["2", "4", "5", "6", "7", "8", "9+"];
const DOORS_OPTIONS = ["2", "3", "4", "5"];
const COLORS = ["Biały", "Czarny", "Szary", "Srebrny", "Czerwony", "Niebieski", "Zielony", "Żółty", "Pomarańczowy", "Brązowy", "Bordowy", "Beżowy", "Złoty", "Inny"];
const VEHICLE_BRANDS = [
  "Abarth", "Acura", "Alfa Romeo", "Alpina", "Aston Martin", "Audi", "Bentley", "BMW", 
  "Bugatti", "Buick", "Cadillac", "Chevrolet", "Chrysler", "Citroen", "Cupra", "Dacia", 
  "Daewoo", "Daihatsu", "Dodge", "DS Bikes", "DS Automobiles", "Ferrari", "Fiat", "Ford", 
  "Genesis", "GMC", "Honda", "Hummer", "Hyundai", "Infiniti", "Isuzu", "Iveco", "Jaguar", 
  "Jeep", "Kia", "Koenigsegg", "Lamborghini", "Lancia", "Land Rover", "Lexus", "Lincoln", 
  "Lotus", "Maserati", "Maybach", "Mazda", "McLaren", "Mercedes-Benz", "Mercury", "MG", 
  "Mini", "Mitsubishi", "Nissan", "Oldsmobile", "Opel", "Pagani", "Peugeot", "Plymouth", 
  "Pontiac", "Porsche", "Ram", "Renault", "Rolls-Royce", "Rover", "Saab", "Saturn", 
  "Scania", "Scion", "Seat", "Skoda", "Smart", "SsangYong", "Subaru", "Suzuki", "Tata", 
  "Tesla", "Toyota", "Volkswagen", "Volvo"
];

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
                const meta = await apiClient.getMetadataOptions();
                console.log("METADATA RECEIVED:", meta);
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

    if (isLoading) {
        return (
            <div className="flex flex-col items-center justify-center py-20 animate-fade-in">
                <Loader2 size={40} className="text-primary animate-spin" />
                <p className="text-muted font-bold animate-pulse uppercase tracking-widest text-xs">Pobieranie danych Bitrix24...</p>
            </div>
        );
    }

    return (
        <div className="space-y-6 animate-fade-in">
            {/* ── Basic Info (Read-Only) ─────────────────────── */}
            <div className="bg-surface rounded-3xl border border-border p-6 shadow-sm border-l-[6px] border-l-primary">
                <div className="flex items-center gap-2 mb-6">
                    <Building2 size={18} className="text-primary" />
                    <h3 className="text-sm font-black text-foreground uppercase tracking-tight">
                        Dane z systemu
                    </h3>
                    <span className="text-[9px] bg-warning-light text-warning-hover font-black px-2 py-1 rounded-md ml-auto uppercase">TYLKO ODCZYT</span>
                </div>
                <div className="grid gap-3">
                    <ReadOnlyField icon={<Building2 size={14} />} label="Firma" value={bi.companyName} placeholder="Nazwa firmy" />
                    <ReadOnlyField icon={<User size={14} />} label="Właściciel / Użytkownik" value={bi.userOwner} placeholder="Imię i nazwisko" />
                    <ReadOnlyField icon={<MapPin size={14} />} label="Miejsce oględzin" value={bi.inspectionPlace} placeholder="Adres" />
                    <ReadOnlyField icon={<Calendar size={14} />} label="Data oględzin" value={formatLocaleDate(bi.inspectionDate)} placeholder="DD.MM.YYYY" />
                    <ReadOnlyField icon={<UserCheck size={14} />} label="Inspektor" value={bi.inspectorName} placeholder="Imię i nazwisko" />
                </div>
            </div>

            {/* ── VIN Section ────────────────────────────────── */}
            <div className="bg-surface rounded-3xl border border-border p-6 shadow-lg">
                <div className="flex items-center gap-2 mb-6">
                    <Car size={18} className="text-primary" />
                    <h3 className="text-sm font-black text-foreground uppercase tracking-tight">
                        Dane do uzupełnienia
                    </h3>
                </div>

                {/* VIN with OCR trigger */}
                <div className="space-y-4">
                    <label className="text-xs font-black text-muted uppercase tracking-widest mb-2 block px-1">
                        Numer VIN
                    </label>
                    <div className="flex flex-col sm:flex-row gap-3">
                        <input
                            type="text"
                            value={v.vin}
                            onChange={(e) => updateField('vehicleData', 'vin', e.target.value.toUpperCase())}
                            maxLength={17}
                            placeholder="Wpisz lub zeskanuj VIN"
                            aria-label="VIN number"
                            className="w-full sm:flex-1 py-4 px-5 font-mono text-xl tracking-[0.2em] rounded-2xl border-2 border-border bg-surface text-foreground uppercase shadow-inner"
                        />
                        <button
                            onClick={() => setShowScanner(true)}
                            className="w-full sm:w-auto px-8 py-4 bg-primary text-white rounded-2xl flex items-center justify-center gap-2 font-black text-sm uppercase shadow-lg shadow-primary/20 active:scale-95 transition-all whitespace-nowrap"
                            aria-label="Scan VIN with camera"
                        >
                            <ScanLine size={20} />
                            <span>Skanuj VIN (OCR)</span>
                        </button>
                    </div>
                    {v.vin && v.vin.length !== 17 && (
                        <p className="text-xs text-danger mt-2 font-black uppercase tracking-tight">VIN musi mieć 17 znaków ({v.vin.length}/17)</p>
                    )}
                </div>

                {showScanner && (
                    <VinScanner
                        onScan={(vin) => updateField('vehicleData', 'vin', vin)}
                        onClose={() => setShowScanner(false)}
                    />
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    <FormField label="Nr rejestracyjny" value={v.registrationPlates} onChange={(val) => handleChange('registrationPlates', val)} placeholder="XX 12345" />
                    
                    <SmartDropdown 
                        label="Marka" 
                        value={v.make} 
                        options={metadata?.vehicle_brands || metadata?.vehicle_brand || VEHICLE_BRANDS} 
                        onChange={(val) => handleChange('make', val)} 
                        placeholder="Szukaj marki..."
                    />
                    
                    <SmartDropdown 
                        label="Model" 
                        value={v.model} 
                        options={v.make && metadata?.vehicle_models?.[v.make] ? metadata.vehicle_models[v.make] : (metadata?.vehicle_models?.Inne || ["Inny"])} 
                        onChange={(val) => handleChange('model', val)} 
                        placeholder={v.make ? "Szukaj modelu..." : "Najpierw wybierz markę"}
                        disabled={!v.make}
                    />

                    <FormField 
                        label="Rok produkcji" 
                        value={v.year} 
                        onChange={(val) => handleChange('year', val)} 
                        placeholder="2024" 
                        type="number" 
                        min={1970}
                    />
                    <SmartDropdown 
                        label="Kolor" 
                        value={v.color} 
                        options={metadata?.colors || COLORS} 
                        onChange={(val) => handleChange('color', val)} 
                        placeholder="Wybierz kolor"
                    />
                    <FormField label="Przebieg (km)" value={v.mileage} onChange={(val) => handleChange('mileage', val)} placeholder="np. 85000" type="number" />
                    <FormField label="Poj. silnika (cm³)" value={v.engineCapacity} onChange={(val) => handleChange('engineCapacity', val)} placeholder="np. 1998" type="number" />
                    <FormField label="Moc (KM)" value={v.enginePower} onChange={(val) => handleChange('enginePower', val)} placeholder="np. 150" type="number" />
                    
                    <SmartDropdown 
                        label="Rodzaj paliwa" 
                        value={v.fuelType} 
                        options={metadata?.fuel_types || FUEL_TYPES} 
                        onChange={(val) => handleChange('fuelType', val)} 
                        placeholder="Wybierz paliwo"
                    />

                    <SmartDropdown 
                        label="Typ nadwozia" 
                        value={v.bodyType} 
                        options={metadata?.body_types || BODY_TYPES} 
                        onChange={(val) => handleChange('bodyType', val)} 
                        placeholder="Wybierz nadwozie"
                    />

                    <FormField label="Pierwsza rejestracja" value={v.firstRegistration} onChange={(val) => handleChange('firstRegistration', val)} placeholder="DD.MM.YYYY" />
                    
                    <SmartDropdown 
                        label="Skrzynia biegów" 
                        value={v.gearboxType} 
                        options={metadata?.gearbox_types || GEARBOX_TYPES} 
                        onChange={(val) => handleChange('gearboxType', val)} 
                        placeholder="Wybierz skrzynię"
                    />

                    <SmartDropdown 
                        label="Napęd" 
                        value={v.driveType} 
                        options={metadata?.drive_types || DRIVE_TYPES} 
                        onChange={(val) => handleChange('driveType', val)} 
                        placeholder="Wybierz napęd"
                    />
                    
                    <FormField label="Masa własna (kg)" value={v.ownWeight} onChange={(val) => handleChange('ownWeight', val)} placeholder="np. 1500" type="number" />
                    <FormField label="Masa całkowita (kg)" value={v.totalWeight} onChange={(val) => handleChange('totalWeight', val)} placeholder="np. 2000" type="number" />
                    
                    <SmartDropdown 
                        label="Liczba miejsc" 
                        value={v.seatsCount} 
                        options={metadata?.seats_options || SEATS_OPTIONS} 
                        onChange={(val) => handleChange('seatsCount', val)} 
                        placeholder="Wybierz..."
                    />

                    <SmartDropdown 
                        label="Liczba drzwi" 
                        value={v.doorsCount} 
                        options={metadata?.doors_options || DOORS_OPTIONS} 
                        onChange={(val) => handleChange('doorsCount', val)} 
                        placeholder="Wybierz..."
                    />
                </div>
            </div>
        </div>
    );
}

// ── Reusable Form Field ──
function FormField({ label, value, onChange, placeholder, type = 'text', min }: {
    label: string; value: string; onChange: (v: string) => void; placeholder: string; type?: string; min?: number;
}) {
    return (
        <div>
            <label className="text-xs font-black text-muted uppercase tracking-widest mb-2 block px-1">
                {label}
            </label>
            <input
                type={type}
                value={value}
                min={min}
                onChange={(e) => onChange(e.target.value)}
                placeholder={placeholder}
                aria-label={label}
                className="w-full py-3.5 px-4 rounded-xl border-2 border-border bg-surface text-foreground text-sm font-bold placeholder:text-muted/40 focus:border-primary transition-all"
            />
        </div>
    );
}

// ── Read-Only Field (Values not editable per client request) ──
function ReadOnlyField({ icon, label, value, placeholder }: {
    icon: React.ReactNode; label: string; value: string; placeholder: string;
}) {
    return (
        <div className="flex items-center gap-4 bg-surface-raised/50 rounded-2xl px-4 py-3 border border-transparent shadow-inner">
            <div className="text-primary flex-shrink-0 bg-surface p-2 rounded-xl shadow-sm">{icon}</div>
            <div className="min-w-0">
                <span className="text-[10px] font-black text-muted uppercase tracking-widest block mb-1">{label}</span>
                <p className={cn(
                    "text-sm font-bold truncate leading-none",
                    value ? "text-foreground" : "text-muted/40 italic"
                )}>
                    {value || placeholder}
                </p>
            </div>
        </div>
    );
}
