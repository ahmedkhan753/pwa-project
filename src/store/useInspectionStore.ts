import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export type StepData = {
    vehicleData: any;
    equipment: any;
    paint: any;
    tires: {
        wheel1: { treadDepth: string;[key: string]: any };
        wheel2: { treadDepth: string;[key: string]: any };
        wheel3: { treadDepth: string;[key: string]: any };
        wheel4: { treadDepth: string;[key: string]: any };
    };
    photos: string[]; // base64 strings
    exterior: any;
    interior: any;
    mech1: any;
    mech2: any;
    notes: string;
};

interface InspectionState {
    currentStep: number;
    data: StepData;
    setStep: (step: number) => void;
    updateData: (stepName: keyof StepData, data: any) => void;
    addPhoto: (base64: string) => void;
    reset: () => void;
}

const initialData: StepData = {
    vehicleData: {},
    equipment: {},
    paint: {},
    tires: {
        wheel1: { treadDepth: '' },
        wheel2: { treadDepth: '' },
        wheel3: { treadDepth: '' },
        wheel4: { treadDepth: '' },
    },
    photos: [],
    exterior: {},
    interior: {},
    mech1: {},
    mech2: {},
    notes: '',
};

export const useInspectionStore = create<InspectionState>()(
    persist(
        (set) => ({
            currentStep: 1,
            data: initialData,
            setStep: (step) => set({ currentStep: step }),
            updateData: (stepName, data) =>
                set((state) => ({
                    data: { ...state.data, [stepName]: data }
                })),
            addPhoto: (base64) =>
                set((state) => ({
                    data: { ...state.data, photos: [...state.data.photos, base64] }
                })),
            reset: () => set({ currentStep: 1, data: initialData }),
        }),
        {
            name: 'inspection-storage',
            storage: createJSONStorage(() => localStorage),
        }
    )
);
