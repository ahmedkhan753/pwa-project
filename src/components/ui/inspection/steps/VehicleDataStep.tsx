"use client";

import { useInspectionStore } from "@/store/useInspectionStore";
import { ScanLine, Car, User, Building2, MapPin, Calendar, UserCheck, Loader2, QrCode } from "lucide-react";
import { useState, useEffect } from "react";
import { VinScanner } from "../VinScanner";
import { RegistrationQRScanner, type DecodedVehicleData } from "../RegistrationQRScanner";
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

const CAR_BRANDS = [
  "Alfa Romeo", "Audi", "BMW", "Chevrolet", "Chrysler", "Citroën",
  "Dacia", "Daewoo", "Dodge", "DS", "Fiat", "Ford", "Honda",
  "Hyundai", "Infiniti", "Jaguar", "Jeep", "Kia", "Lamborghini",
  "Land Rover", "Lexus", "Maserati", "Mazda", "Mercedes-Benz",
  "Mini", "Mitsubishi", "Nissan", "Opel", "Peugeot", "Porsche",
  "Renault", "Seat", "Skoda", "Škoda", "Smart", "Subaru", "Suzuki",
  "Tesla", "Toyota", "Volkswagen", "Volvo", "Other"
];

const CAR_MODELS: Record<string, string[]> = {
  "Škoda": ["Octavia", "Superb", "Fabia", "Kamiq", "Karoq", "Kodiaq", "Scala", "Enyaq", "Rapid", "Roomster", "Other"],
  "Skoda": ["Octavia", "Superb", "Fabia", "Kamiq", "Karoq", "Kodiaq", "Scala", "Enyaq", "Rapid", "Roomster", "Other"],
  "Volkswagen": ["Golf", "Passat", "Polo", "Tiguan", "Touareg", "T-Roc", "T-Cross", "Arteon", "Caddy", "Transporter", "Other"],
  "BMW": ["1 Series", "2 Series", "3 Series", "4 Series", "5 Series", "7 Series", "X1", "X2", "X3", "X4", "X5", "X6", "X7", "Other"],
  "Mercedes-Benz": ["A-Class", "B-Class", "C-Class", "E-Class", "S-Class", "GLA", "GLB", "GLC", "GLE", "GLS", "CLA", "CLS", "Other"],
  "Audi": ["A1", "A3", "A4", "A5", "A6", "A7", "A8", "Q2", "Q3", "Q5", "Q7", "Q8", "TT", "R8", "Other"],
  "Toyota": ["Corolla", "Camry", "Yaris", "RAV4", "C-HR", "Land Cruiser", "Avensis", "Auris", "Hilux", "Prius", "Other"],
  "Ford": ["Focus", "Fiesta", "Mondeo", "Kuga", "Puma", "EcoSport", "S-Max", "Galaxy", "Ranger", "Transit", "Other"],
  "Opel": ["Astra", "Corsa", "Insignia", "Mokka", "Crossland", "Grandland", "Zafira", "Meriva", "Other"],
  "Renault": ["Clio", "Megane", "Laguna", "Kadjar", "Captur", "Scenic", "Talisman", "Zoe", "Duster", "Other"],
  "Peugeot": ["208", "308", "508", "2008", "3008", "5008", "206", "207", "306", "307", "Other"],
  "Citroën": ["C1", "C2", "C3", "C4", "C5", "Berlingo", "Picasso", "SpaceTourer", "Other"],
  "Hyundai": ["i20", "i30", "i40", "Tucson", "Santa Fe", "Ioniq", "Kona", "Other"],
  "Kia": ["Ceed", "Sportage", "Sorento", "Stinger", "Rio", "Picanto", "Niro", "EV6", "Other"],
  "Nissan": ["Micra", "Juke", "Qashqai", "X-Trail", "Leaf", "Navara", "Other"],
  "Mazda": ["Mazda2", "Mazda3", "Mazda6", "CX-3", "CX-5", "CX-30", "MX-5", "Other"],
  "Honda": ["Civic", "Accord", "Jazz", "CR-V", "HR-V", "Other"],
  "Fiat": ["500", "Punto", "Bravo", "Tipo", "Panda", "Doblo", "Other"],
  "Seat": ["Ibiza", "Leon", "Ateca", "Arona", "Tarraco", "Toledo", "Other"],
  "Volvo": ["V40", "V60", "V70", "V90", "S60", "S90", "XC40", "XC60", "XC90", "Other"],
  "Dacia": ["Sandero", "Logan", "Duster", "Lodgy", "Spring", "Other"],
  "Mitsubishi": ["Colt", "Lancer", "Outlander", "Eclipse Cross", "ASX", "L200", "Other"],
  "Subaru": ["Impreza", "Legacy", "Outback", "Forester", "XV", "WRX", "BRZ", "Other"],
  "Suzuki": ["Swift", "Vitara", "SX4", "Jimny", "Ignis", "Baleno", "Other"],
  "Jeep": ["Renegade", "Compass", "Cherokee", "Grand Cherokee", "Wrangler", "Other"],
  "Land Rover": ["Defender", "Discovery", "Freelander", "Range Rover", "Evoque", "Velar", "Other"],
  "Porsche": ["911", "Cayenne", "Macan", "Panamera", "Taycan", "Other"],
  "Lexus": ["IS", "ES", "GS", "LS", "RX", "NX", "UX", "Other"],
  "Tesla": ["Model 3", "Model S", "Model X", "Model Y", "Other"],
  "Chevrolet": ["Spark", "Aveo", "Cruze", "Malibu", "Camaro", "Corvette", "Suburban", "Tahoe", "Other"],
  "Daewoo": ["Matiz", "Lanos", "Nubira", "Leganza", "Tacuma", "Other"],
};

export function VehicleDataStep() {
    const { data, updateField } = useInspectionStore();
    const v = data.vehicleData;
    const bi = v.basicInfo;
    const [showScanner, setShowScanner] = useState(false);
    const [showQRScanner, setShowQRScanner] = useState(false);
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

    const handleQRData = (data: DecodedVehicleData) => {
        console.log("[QR→Form] handleQRData received:", JSON.stringify(data));
        // Structured fields from Aztec / plain-text QR
        if (data.vin) updateField('vehicleData', 'vin', data.vin);
        if (data.registrationPlates) updateField('vehicleData', 'registrationPlates', data.registrationPlates);
        if (data.make) updateField('vehicleData', 'make', data.make);
        if (data.model) updateField('vehicleData', 'model', data.model);
        if (data.year) updateField('vehicleData', 'year', data.year);
        if (data.engineCapacity) updateField('vehicleData', 'engineCapacity', data.engineCapacity);
        if (data.enginePower) updateField('vehicleData', 'enginePower', data.enginePower);
        if (data.fuelType) updateField('vehicleData', 'fuelType', data.fuelType);
        if (data.ownWeight) updateField('vehicleData', 'ownWeight', data.ownWeight);
        if (data.totalWeight) updateField('vehicleData', 'totalWeight', data.totalWeight);
        if (data.seatsCount) updateField('vehicleData', 'seatsCount', data.seatsCount);
        if (data.firstRegistration) updateField('vehicleData', 'firstRegistration', data.firstRegistration);

        // Fallback: extract VIN from raw text if no structured VIN found
        if (!data.vin && data.rawText) {
            const m = data.rawText.match(/[A-HJ-NPR-Z0-9]{17}/i);
            if (m) updateField('vehicleData', 'vin', m[0].toUpperCase());
        }
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
                    <button
                        onClick={() => setShowQRScanner(true)}
                        className="w-full px-6 py-4 bg-accent text-white rounded-2xl flex items-center justify-center gap-2 font-black text-sm uppercase shadow-lg shadow-accent/20 active:scale-95 transition-all"
                        aria-label="Scan registration document QR code"
                    >
                        <QrCode size={20} />
                        <span>Skanuj Dowód Rejestracyjny (QR)</span>
                    </button>
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

                {showQRScanner && (
                    <RegistrationQRScanner
                        onData={handleQRData}
                        onClose={() => setShowQRScanner(false)}
                    />
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    <FormField label="Nr rejestracyjny" value={v.registrationPlates} onChange={(val) => handleChange('registrationPlates', val.toUpperCase())} placeholder="XX 12345" />
                    
                    {/* Brand — datalist with free text */}
                    <div>
                        <label className="text-xs font-black text-muted uppercase tracking-widest mb-2 block px-1">
                            Marka
                        </label>
                        <input
                            type="text"
                            list="brands-list"
                            value={v.make}
                            onChange={(e) => {
                                handleChange('make', e.target.value);
                                handleChange('model', ''); // reset model when brand changes
                            }}
                            placeholder="Wybierz lub wpisz markę..."
                            aria-label="Marka"
                            className="w-full py-3.5 px-4 rounded-xl border-2 border-border bg-surface text-foreground text-sm font-bold placeholder:text-muted/40 focus:border-primary transition-all"
                        />
                        <datalist id="brands-list">
                            {CAR_BRANDS.map(b => <option key={b} value={b} />)}
                        </datalist>
                    </div>

                    {/* Model — datalist with brand-dependent suggestions + free text */}
                    <div>
                        <label className="text-xs font-black text-muted uppercase tracking-widest mb-2 block px-1">
                            Model
                        </label>
                        <input
                            type="text"
                            list="models-list"
                            value={v.model}
                            onChange={(e) => handleChange('model', e.target.value)}
                            placeholder={v.make ? "Wybierz lub wpisz model..." : "Najpierw wybierz markę"}
                            aria-label="Model"
                            className="w-full py-3.5 px-4 rounded-xl border-2 border-border bg-surface text-foreground text-sm font-bold placeholder:text-muted/40 focus:border-primary transition-all"
                        />
                        <datalist id="models-list">
                            {(CAR_MODELS[v.make] || []).map(m => <option key={m} value={m} />)}
                        </datalist>
                    </div>

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
