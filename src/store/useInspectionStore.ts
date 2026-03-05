import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export type StepData = {
    vehicleData: {
        vin?: string;
        model?: string;
        [key: string]: any;
    };
    equipment: Record<string, any>;
    paint: Record<string, any>;
    tires: {
        wheel1: { treadDepth: string; brand?: string; size?: string; condition?: string;[key: string]: any };
        wheel2: { treadDepth: string; brand?: string; size?: string; condition?: string;[key: string]: any };
        wheel3: { treadDepth: string; brand?: string; size?: string; condition?: string;[key: string]: any };
        wheel4: { treadDepth: string; brand?: string; size?: string; condition?: string;[key: string]: any };
    };
    photos: string[]; // base64 strings
    exterior: Record<string, any>;
    interior: Record<string, any>;
    mech1: Record<string, any>;
    mech2: Record<string, any>;
    notes: string;
};

interface InspectionState {
    currentStep: number;
    data: StepData;
    setStep: (step: number) => void;
    updateData: (stepName: keyof StepData, data: any) => void;
    addPhoto: (base64: string) => void;
    copyTireData: () => void;
    reset: () => void;
}

const initialData: StepData = {
    vehicleData: {},
    equipment: {},
    paint: {},
    tires: {
        wheel1: { treadDepth: '', brand: '', size: '', condition: 'TAK' },
        wheel2: { treadDepth: '', brand: '', size: '', condition: 'TAK' },
        wheel3: { treadDepth: '', brand: '', size: '', condition: 'TAK' },
        wheel4: { treadDepth: '', brand: '', size: '', condition: 'TAK' },
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
            setStep: (step: number) => set({ currentStep: step }),
            updateData: (stepName: keyof StepData, data: any) =>
                set((state: InspectionState) => ({
                    data: { ...state.data, [stepName]: data }
                })),
            addPhoto: (base64: string) =>
                set((state: InspectionState) => ({
                    data: { ...state.data, photos: [...state.data.photos, base64] }
                })),
            copyTireData: () =>
                set((state: InspectionState) => {
                    const { wheel1 } = state.data.tires;
                    // eslint-disable-next-line @typescript-eslint/no-unused-vars
                    const { treadDepth, ...otherData } = wheel1;

                    return {
                        data: {
                            ...state.data,
                            tires: {
                                wheel1,
                                wheel2: { ...otherData, treadDepth: state.data.tires.wheel2.treadDepth },
                                wheel3: { ...otherData, treadDepth: state.data.tires.wheel3.treadDepth },
                                wheel4: { ...otherData, treadDepth: state.data.tires.wheel4.treadDepth },
                            }
                        }
                    };
                }),
            reset: () => set({ currentStep: 1, data: initialData }),
        }),
        {
            name: 'inspection-storage',
            storage: createJSONStorage(() => localStorage),
        }
    )
);
