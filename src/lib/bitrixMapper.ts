import { StepData } from "@/store/useInspectionStore";

/**
 * Utility to map the Zustand store state to Bitrix24 Lead/Deal fields.
 * Field IDs use descriptive placeholders (UF_CRM_*).
 * Ensure your Bitrix24 custom fields match these keys.
 */
export function mapToBitrix24(data: StepData) {
    const vehicle = data.vehicleData;
    const basicInfo = vehicle.basicInfo;

    // estimatedValue / marketComparison are no longer collected by the form and
    // must not reach Bitrix. The store still defines the keys, so strip them
    // from the serialised notesValuation blob. All other keys pass through.
    const {
        estimatedValue: _estimatedValue,
        marketComparison: _marketComparison,
        ...notesValuationForBitrix
    } = data.notesValuation;

    const payload: Record<string, any> = {
        // System Fields
        TITLE: `Inspekcja: ${vehicle.make} ${vehicle.model} - ${vehicle.registrationPlates}`,

        // Vehicle Data
        UF_CRM_VIN: vehicle.vin,
        UF_CRM_REG_PLATES: vehicle.registrationPlates,
        UF_CRM_MAKE: vehicle.make,
        UF_CRM_MODEL: vehicle.model,
        UF_CRM_YEAR: vehicle.year,
        UF_CRM_COLOR: vehicle.color,
        UF_CRM_MILEAGE: vehicle.mileage,
        UF_CRM_ENGINE_CAPACITY: vehicle.engineCapacity,
        UF_CRM_ENGINE_POWER: vehicle.enginePower,
        UF_CRM_FUEL_TYPE: vehicle.fuelType,
        UF_CRM_GEARBOX: vehicle.gearboxType,
        UF_CRM_DRIVE_TYPE: vehicle.driveType,
        UF_CRM_FIRST_REG: vehicle.firstRegistration,
        UF_CRM_PROD_DATE: vehicle.productionDate,

        // Basic Info
        UF_CRM_COMPANY: basicInfo.companyName,
        UF_CRM_OWNER: basicInfo.userOwner,
        UF_CRM_INSPECT_PLACE: basicInfo.inspectionPlace,
        UF_CRM_INSPECT_DATE: basicInfo.inspectionDate,
        UF_CRM_INSPECTOR: basicInfo.inspectorName,

        // Equipment Completeness (JSON blob)
        UF_CRM_EQUIP_COMPLETE: JSON.stringify(data.equipmentCompleteness),

        // Full Equipment (JSON blob)
        UF_CRM_FULL_EQUIP: JSON.stringify(data.fullEquipment),

        // Paint Measurement (JSON blob)
        UF_CRM_PAINT_DATA: JSON.stringify(data.paintMeasurement),

        // Tires (JSON blob)
        UF_CRM_TIRES_DATA: JSON.stringify(data.tires),

        // Exterior Damages (JSON blob)
        UF_CRM_EXT_DAMAGES: JSON.stringify(
            data.exteriorDamage.map(d => ({
                part: d.part,
                type: d.type,
                size: d.size,
                action: d.action,
                description: d.description,
                photo_count: d.photos.length,
            }))
        ),

        // Interior Damages (JSON blob)
        UF_CRM_INT_DAMAGES: JSON.stringify(
            data.interiorDamage.map(d => ({
                part: d.part,
                type: d.type,
                size: d.size,
                action: d.action,
                description: d.description,
                photo_count: d.photos.length,
            }))
        ),

        // Mechanical Checklist (JSON blob)
        UF_CRM_MECHANICAL: JSON.stringify(data.mechanical),

        // Notes & Valuation (JSON blob) — estimatedValue / marketComparison stripped
        UF_CRM_NOTES_VALUATION: JSON.stringify(notesValuationForBitrix),

        // Valuation highlights
        UF_CRM_GENERAL_COMMENTS: data.notesValuation.generalComments,

        // VIN Confirmation
        UF_CRM_VIN_CONFIRMED: data.finalSummary.vinConfirmed,
    };

    return payload;
}

/**
 * Extract all base64 images from the store data.
 * Collects photo slots, damage photos, and signatures into a flat array.
 */
export function extractBase64Images(data: StepData): string[] {
    const images: string[] = [];

    // Photo slots
    for (const photo of data.photos) {
        if (photo.base64) {
            images.push(photo.base64);
        }
    }

    // Exterior damage photos
    for (const damage of data.exteriorDamage) {
        for (const photo of damage.photos) {
            if (photo) images.push(photo);
        }
    }

    // Interior damage photos
    for (const damage of data.interiorDamage) {
        for (const photo of damage.photos) {
            if (photo) images.push(photo);
        }
    }

    // Signatures
    if (data.finalSummary.signatureAppraiser) images.push(data.finalSummary.signatureAppraiser);
    if (data.finalSummary.signatureClient) images.push(data.finalSummary.signatureClient);
    if (data.finalSummary.signatureYard) images.push(data.finalSummary.signatureYard);

    return images;
}

/**
 * Validates the mandatory fields for Bitrix24
 */
export function validateForBitrix24(data: StepData): string[] {
    const errors: string[] = [];
    if (!data.vehicleData.vin) errors.push("VIN jest wymagany");
    if (!data.vehicleData.make) errors.push("Marka jest wymagana");
    if (!data.vehicleData.model) errors.push("Model jest wymagany");
    if (!data.vehicleData.registrationPlates) errors.push("Tablice rejestracyjne są wymagane");
    if (!data.finalSummary.signatureClient) errors.push("Podpis klienta jest wymagany");
    return errors;
}
