"use client";

import { useInspectionStore } from "@/store/useInspectionStore";
import { TireMaskInput } from "../TireMaskInput";

export function TiresStep() {
    const { data, updateData, copyTireData } = useInspectionStore();
    const tires = data.tires;

    const handleTireChange = (wheel: string, field: string, value: string) => {
        updateData('tires', {
            ...tires,
            [wheel]: { ...tires[wheel as keyof typeof tires], [field]: value }
        });
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h3 className="text-lg font-bold">Tire Inspection</h3>
                <button
                    onClick={copyTireData}
                    className="text-sm bg-blue-100 text-blue-600 px-3 py-1 rounded-lg font-semibold"
                >
                    Copy Wheel 1 to All
                </button>
            </div>

            <div className="grid grid-cols-1 gap-6">
                {Object.keys(tires).map((wheel, index) => (
                    <div key={wheel} className="p-4 bg-gray-50 rounded-2xl border border-gray-100">
                        <h4 className="font-bold mb-3">Wheel {index + 1}</h4>
                        <div className="grid grid-cols-2 gap-4">
                            <TireMaskInput
                                label="Tread Depth"
                                value={tires[wheel as keyof typeof tires].treadDepth}
                                onChange={(val) => handleTireChange(wheel, 'treadDepth', val)}
                            />
                            <div className="flex flex-col gap-1">
                                <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Brand</label>
                                <input
                                    type="text"
                                    value={tires[wheel as keyof typeof tires].brand || ''}
                                    onChange={(e) => handleTireChange(wheel, 'brand', e.target.value)}
                                    className="py-3 px-4 rounded-xl border-2 border-gray-200"
                                    placeholder="e.g. Michelin"
                                />
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
