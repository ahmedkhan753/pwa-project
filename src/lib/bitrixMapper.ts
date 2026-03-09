import { StepData } from "@/store/useInspectionStore";

/**
 * Utility to map the Zustand store state to Bitrix24 Lead/Deal fields.
 * Field IDs should be updated once the specific Bitrix24 mapping JSON is provided.
 */
export function mapToBitrix24(data: StepData) {
    const payload: Record<string, any> = {
        // Example System Fields
        TITLE: `Inspekcja: ${data.vehicleData.make} ${data.vehicleData.model} - ${data.vehicleData.registrationPlates}`,

        // Vehicle Data
        UF_CRM_VIN: data.vehicleData.vin,
        UF_CRM_REG_PLATES: data.vehicleData.registrationPlates,
        UF_CRM_MAKE: data.vehicleData.make,
        UF_CRM_MODEL: data.vehicleData.model,
        UF_CRM_YEAR: data.vehicleData.year,
        UF_CRM_COLOR: data.vehicleData.color,
        UF_CRM_MILEAGE: data.vehicleData.mileage,

        // Paint Measurement (Structured)
        UF_CRM_PAINT_DATA: JSON.stringify(data.paintMeasurement),

        // Tires
        UF_CRM_TIRES_FL: JSON.stringify(data.tires.frontLeft),
        UF_CRM_TIRES_FR: JSON.stringify(data.tires.frontRight),
        UF_CRM_TIRES_RL: JSON.stringify(data.tires.rearLeft),
        UF_CRM_TIRES_RR: JSON.stringify(data.tires.rearRight),

        // Damages
        UF_CRM_EXT_DAMAGES: data.exteriorDamage.map(d => ({
            element: d.part,
            type: d.type,
            size: d.size,
            action: d.action,
            photo_count: d.photos.length
        })),

        // Signatures are usually sent as separate file attachments
        SIGNATURE_APPRAISER: data.finalSummary.signatureAppraiser,
        SIGNATURE_CLIENT: data.finalSummary.signatureClient,
    };

    return payload;
}

/**
 * Validates the mandatory fields for Bitrix24
 */
export function validateForBitrix24(data: StepData): string[] {
    const errors: string[] = [];
    if (!data.vehicleData.vin) errors.push("VIN jest wymagany");
    if (!data.finalSummary.signatureClient) errors.push("Podpis klienta jest wymagany");
    return errors;
}
