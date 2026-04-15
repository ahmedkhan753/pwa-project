"use client";

import { useInspectionStore } from "@/store/useInspectionStore";
import { InspectionToggle } from "../InspectionToggle";
import type { ToggleValue } from "@/store/useInspectionStore";

// Full 108-item Polish equipment catalogue sourced from the client's
// Excel "wyposażenie" sheet (Feb 2025). Items are grouped for readability;
// the underlying store still holds each key as a flat ToggleValue.
const EQUIPMENT_GROUPS = [
    {
        title: "🛡️ Bezpieczeństwo / Asystenci",
        items: [
            { key: "abs", label: "ABS" },
            { key: "esp", label: "ESP" },
            { key: "asr", label: "ASR" },
            { key: "alarm", label: "Alarm" },
            { key: "airbagPassenger", label: "Airbag pasażera" },
            { key: "airbagSideFront", label: "Airbag boczny przód" },
            { key: "airbagSideRear", label: "Airbag boczny tył" },
            { key: "airbagKnee", label: "Airbag nóg" },
            { key: "airbagCurtain", label: "Kurtyny powietrzne" },
            { key: "activeParkingSystem", label: "Aktywny system parkowania" },
            { key: "nightVisionAssist", label: "Asystent jazdy nocnej" },
            { key: "blindSpotAssist", label: "Asystent martwego punktu" },
            { key: "vehicleAssist", label: "Asystent pojazdu" },
            { key: "laneChangeAssist", label: "Asystent zmiany pasa ruchu" },
            { key: "tirePressureSensor", label: "Czujnik ciśnienia w oponach" },
            { key: "rainSensors", label: "Czujnik deszczu" },
            { key: "lightSensors", label: "Czujnik zmierzchu" },
            { key: "trafficSignRecognition", label: "System rozpoznawania znaków" },
        ],
    },
    {
        title: "💺 Komfort — Fotele / Kierownica",
        items: [
            { key: "manualAC", label: "Klimatyzacja manualna" },
            { key: "automaticAC", label: "Klimatyzacja automatyczna" },
            { key: "electricFrontSeats", label: "Fotele przednie ust. elektrycznie" },
            { key: "massageFrontSeats", label: "Fotele przednie z masażem" },
            { key: "adjustableRearSeats", label: "Fotele tylne regulowane" },
            { key: "massageRearSeats", label: "Siedzenia tylne z masażem" },
            { key: "sportSeats", label: "Siedzenia sportowe" },
            { key: "thirdRowSeats", label: "Trzeci rząd siedzeń" },
            { key: "heatedSeats", label: "Ogrzewanie przednich foteli" },
            { key: "heatedRearSeats", label: "Ogrzewanie tylnych siedzeń" },
            { key: "ventilatedFrontSeats", label: "Wentylacja foteli przód" },
            { key: "ventilatedRearSeats", label: "Wentylacja foteli tył" },
            { key: "driverSeatMemory", label: "Pamięć ust. fotela kierowcy" },
            { key: "passengerSeatMemory", label: "Pamięć ust. fotela pasażera" },
            { key: "armrestFront", label: "Podłokietnik przód" },
            { key: "armrestRear", label: "Podłokietnik tył" },
            { key: "leatherSteeringWheel", label: "Kierownica skórzana" },
            { key: "multifunctionSteeringWheel", label: "Kierownica wielofunkcyjna" },
            { key: "heatedSteeringWheel", label: "Podgrzewana kierownica" },
            { key: "paddleShifters", label: "Kierownica z funkcją zmiany biegów" },
            { key: "electricSteeringColumn", label: "Kolumna kierownicy regul. elek." },
            { key: "powerSteering", label: "Wspomaganie kierownicy" },
            { key: "cruiseControl", label: "Tempomat" },
            { key: "activeCruiseControl", label: "Tempomat aktywny" },
            { key: "comfortAccess", label: "Dostęp komfortowy" },
            { key: "keylessEntry", label: "Zestaw bezkluczykowy" },
            { key: "centralLocking", label: "Zamek centralny" },
            { key: "headUpDisplay", label: "Head Up Display" },
            { key: "virtualCockpit", label: "Wirtualny kokpit" },
            { key: "onboardComputer", label: "Komputer pokładowy" },
        ],
    },
    {
        title: "📡 Parkowanie i kamery",
        items: [
            { key: "parkingSensorsFrontRear", label: "Czujnik parkowania przód + tył" },
            { key: "parkingSensorsRear", label: "Czujnik parkowania tył" },
            { key: "parkingCamera", label: "Kamera parkowania" },
            { key: "camera360", label: "Kamera 360" },
        ],
    },
    {
        title: "🎵 Multimedia / Elektronika",
        items: [
            { key: "radio", label: "Radioodbiornik" },
            { key: "radioUsb", label: "Radioodbiornik USB" },
            { key: "radioSd", label: "Radioodbiornik SD" },
            { key: "navigation", label: "Nawigacja" },
            { key: "dvdPlayerWithMonitor", label: "Odtwarzacz DVD z monitorem" },
            { key: "headrestMonitors", label: "Zestaw monitorów w zagłówkach" },
            { key: "tvTuner", label: "TV Tuner" },
        ],
    },
    {
        title: "💡 Oświetlenie",
        items: [
            { key: "daytimeRunningLights", label: "Światła do jazdy dziennej" },
            { key: "daytimeRunningLightsLed", label: "Światła do jazdy dziennej LED" },
            { key: "ledLights", label: "Reflektory LED" },
            { key: "fullLedLights", label: "Reflektory Full LED" },
            { key: "xenonLights", label: "Reflektory ksenonowe" },
            { key: "laserLights", label: "Reflektory laserowe" },
            { key: "fogLights", label: "Światła przeciwmgielne" },
            { key: "corneringLights", label: "Reflektory skrętne" },
            { key: "bendLighting", label: "Reflektory z doświetlaniem zakrętów" },
            { key: "headlightWashers", label: "Spryskiwacze reflektorów" },
        ],
    },
    {
        title: "🚗 Nadwozie / Dach / Szyby / Lusterka",
        items: [
            { key: "electricOpeningRoof", label: "Dach otwierany el." },
            { key: "solarOpeningRoof", label: "Dach otwierany z baterią słoneczną" },
            { key: "panoramicRoof", label: "Dach panoramiczny" },
            { key: "roofRails", label: "Relingi dachowe" },
            { key: "metallicPaint", label: "Lakier metalik" },
            { key: "heatedFrontWindshield", label: "Szyba przednia ogrzewana" },
            { key: "electricWindowsFront", label: "Szyby pod. el. przód" },
            { key: "electricWindowsRear", label: "Szyby pod. el. tył" },
            { key: "sunBlindRear", label: "Roleta p. słoneczna tylna" },
            { key: "sunBlindSide", label: "Roleta p. słoneczna boczne" },
            { key: "heatedMirrors", label: "Lusterka ogrzewane" },
            { key: "autoDimmingExtMirrors", label: "Lusterka zew. przyciemniające się" },
            { key: "electricMirrors", label: "Lusterka reg. elektrycznie" },
            { key: "foldingElectricMirrors", label: "Lusterka składane elektr." },
            { key: "autoDimmingIntMirror", label: "Lusterko wst. przyciemniające się" },
            { key: "electricClosingDoors", label: "Drzwi domykane elektryczne" },
            { key: "electricTailgate", label: "Pokrywa tylna otw./zam. elekt." },
            { key: "towBar", label: "Hak" },
            { key: "alloyWheels", label: "Felgi aluminiowe" },
            { key: "structuralWheels", label: "Felgi strukturalne" },
            { key: "alloySpareWheel", label: "Koło zapasowe alu." },
            { key: "compactSpareWheel", label: "Koło dojazdowe" },
        ],
    },
    {
        title: "🪑 Tapicerka / Wnętrze",
        items: [
            { key: "leatherUpholstery", label: "Tapicerka skórzana" },
            { key: "alcantaraUpholstery", label: "Tapicerka alkantara" },
            { key: "fabricLeatherUpholstery", label: "Tapicerka materiał-skórzana" },
            { key: "velourUpholstery", label: "Tapicerka welurowa" },
            { key: "blackHeadliner", label: "Podsufitka czarna" },
            { key: "interiorTrimAluminum", label: "Wykończenie wnętrza aluminium" },
            { key: "interiorTrimWood", label: "Wykończenie wnętrza drewno" },
            { key: "interiorTrimCarbon", label: "Wykończenie wnętrza karbon" },
        ],
    },
    {
        title: "⚙️ Pozostałe / Dodatkowe",
        items: [
            { key: "fridge", label: "Lodówka" },
            { key: "foldingTables", label: "Składane stoliki" },
            { key: "powerSocket230vTrunk", label: "Gniazdo 230V w bagażniku" },
            { key: "airSuspension", label: "Zawieszenie pneumatyczne" },
            { key: "ceramicBrakes", label: "Hamulce ceramiczne" },
            { key: "lpgSystem", label: "Instalacja gazowa" },
            { key: "webasto", label: "Webasto" },
            { key: "tachograph", label: "Tachograf" },
            { key: "winch", label: "Wyciągarka" },
        ],
    },
];

export function FullEquipmentStep() {
    const { data, updateField } = useInspectionStore();
    const eq = data.fullEquipment;

    return (
        <div className="space-y-4 animate-fade-in">
            {EQUIPMENT_GROUPS.map((group) => {
                const groupFilled = group.items.filter((i) => eq[i.key]).length;
                return (
                    <div key={group.title} className="section-card">
                        <div className="flex items-center gap-2 mb-3">
                            <h3 className="text-sm font-bold text-foreground">
                                {group.title}
                            </h3>
                            <span className="text-[10px] text-muted ml-auto">
                                {groupFilled}/{group.items.length}
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
                );
            })}
        </div>
    );
}
