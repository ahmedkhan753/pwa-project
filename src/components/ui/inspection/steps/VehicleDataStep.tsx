"use client";

import { useInspectionStore } from "@/store/useInspectionStore";

export function VehicleDataStep() {
    const { data, updateData } = useInspectionStore();
    const vehicle = data.vehicleData || {};

    const handleChange = (field: string, value: string) => {
        updateData('vehicleData', { ...vehicle, [field]: value });
    };

    return (
        <div className="space-y-4">
            <div>
                <label className="block text-sm font-medium text-gray-700">VIN Number</label>
                <input
                    type="text"
                    value={vehicle.vin || ''}
                    onChange={(e) => handleChange('vin', e.target.value)}
                    className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2"
                    placeholder="Enter VIN"
                />
            </div>
            <div>
                <label className="block text-sm font-medium text-gray-700">Make & Model</label>
                <input
                    type="text"
                    value={vehicle.model || ''}
                    onChange={(e) => handleChange('model', e.target.value)}
                    className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2"
                    placeholder="e.g. BMW X5"
                />
            </div>
        </div>
    );
}
