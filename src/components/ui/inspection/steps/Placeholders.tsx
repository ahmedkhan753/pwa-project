"use client";
import { useInspectionStore } from "@/store/useInspectionStore";

export function EquipmentStep() { return <div className="p-4">Equipment Step Content</div>; }
export function PaintStep() { return <div className="p-4">Paint Step Content</div>; }
export function PhotosStep() { return <div className="p-4">Photos Step Content</div>; }
export function ExteriorStep() { return <div className="p-4">Exterior Step Content</div>; }
export function InteriorStep() { return <div className="p-4">Interior Step Content</div>; }
export function Mech1Step() { return <div className="p-4">Mechanical 1 Step Content</div>; }
export function Mech2Step() { return <div className="p-4">Mechanical 2 Step Content</div>; }
export function NotesStep() { return <div className="p-4">Notes Step Content</div>; }
export function SummaryStep() {
    const { reset } = useInspectionStore();

    return (
        <div className="p-4 space-y-6">
            <h2 className="text-xl font-bold">Inspection Summary</h2>
            <p className="text-gray-600">Review all data before final submission.</p>

            <div className="pt-10 border-t">
                <button
                    onClick={() => { if (confirm("Clear all data?")) reset(); }}
                    className="w-full py-4 text-red-600 font-bold border-2 border-red-100 rounded-xl active:bg-red-50"
                >
                    Clear All Data
                </button>
            </div>
        </div>
    );
}
