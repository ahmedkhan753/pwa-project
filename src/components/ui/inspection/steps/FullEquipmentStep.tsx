"use client";

import { useInspectionStore } from "@/store/useInspectionStore";
import { InspectionToggle } from "../InspectionToggle";
import { Settings } from "lucide-react";
import type { ToggleValue } from "@/store/useInspectionStore";

const EQUIPMENT_GROUPS = [
    {
        title: "🛡️ Bezpieczeństwo",
        items: [
            { key: "abs", label: "ABS" },
            { key: "esp", label: "ESP / ASR" },
            { key: "airbagDriver", label: "Airbag kierowcy" },
            { key: "airbagPassenger", label: "Airbag pasażera" },
            { key: "airbagSide", label: "Airbag boczny" },
            { key: "airbagCurtain", label: "Airbag kurtynowy" },
            { key: "tractionControl", label: "Kontrola trakcji" },
        ],
    },
    {
        title: "🪑 Komfort",
        items: [
            { key: "airConditioning", label: "Klimatyzacja" },
            { key: "automaticAC", label: "Klimatyzacja automatyczna" },
            { key: "heatedSeats", label: "Podgrzewane fotele" },
            { key: "electricWindows", label: "Elektryczne szyby" },
            { key: "electricMirrors", label: "Elektryczne lusterka" },
            { key: "heatedMirrors", label: "Podgrzewane lusterka" },
            { key: "powerSteering", label: "Wspomaganie kierownicy" },
            { key: "cruiseControl", label: "Tempomat" },
            { key: "parkingSensors", label: "Czujniki parkowania" },
            { key: "rearCamera", label: "Kamera cofania" },
            { key: "rainSensors", label: "Czujnik deszczu" },
            { key: "lightSensors", label: "Czujnik zmierzchu" },
            { key: "centralLocking", label: "Centralny zamek" },
            { key: "keylessEntry", label: "Bezkluczykowy dostęp" },
            { key: "startStop", label: "System Start-Stop" },
        ],
    },
    {
        title: "📱 Elektronika",
        items: [
            { key: "navigation", label: "Nawigacja" },
            { key: "bluetooth", label: "Bluetooth" },
            { key: "usb", label: "USB" },
            { key: "multimediaScreen", label: "Ekran multimedialny" },
            { key: "soundSystem", label: "System audio premium" },
            { key: "onboardComputer", label: "Komputer pokładowy" },
        ],
    },
    {
        title: "🚗 Nadwozie",
        items: [
            { key: "ledLights", label: "Światła LED" },
            { key: "xenonLights", label: "Światła ksenonowe" },
            { key: "fogLights", label: "Światła przeciwmgielne" },
            { key: "roofRails", label: "Relingi dachowe" },
            { key: "sunroof", label: "Szyberdach" },
            { key: "panoramicRoof", label: "Dach panoramiczny" },
            { key: "towBar", label: "Hak holowniczy" },
            { key: "alloyWheels", label: "Felgi aluminiowe" },
            { key: "tintedWindows", label: "Szyby przyciemniane" },
        ],
    },
];

export function FullEquipmentStep() {
    const { data, updateField } = useInspectionStore();
    const eq = data.fullEquipment;

    return (
        <div className="space-y-4 animate-fade-in">
            {EQUIPMENT_GROUPS.map((group) => (
                <div key={group.title} className="section-card">
                    <div className="flex items-center gap-2 mb-3">
                        <h3 className="text-sm font-bold text-foreground">
                            {group.title}
                        </h3>
                        <span className="text-[10px] text-muted ml-auto">
                            {group.items.filter(i => eq[i.key]).length}/{group.items.length}
                        </span>
                    </div>

                    {group.items.map((item) => (
                        <InspectionToggle
                            key={item.key}
                            label={item.label}
                            value={eq[item.key] as ToggleValue}
                            onChange={(val) => updateField('fullEquipment', item.key, val)}
                            compact
                        />
                    ))}
                </div>
            ))}
        </div>
    );
}
