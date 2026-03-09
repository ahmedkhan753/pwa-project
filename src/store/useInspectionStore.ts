import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

// ─── Auth & Jobs Types ──────────────────────────────────────
export interface AuthUser {
  id: string;
  email: string;
  name: string;
}

export interface InspectionJob {
  id: string;
  clientName: string;
  vin: string;
  plates: string;
  phone: string;
  appointmentTime: string;
  status: 'pending' | 'completed';
}

// ─── Toggle Type ───────────────────────────────────────────
export type ToggleValue = 'TAK' | 'NIE' | 'ND' | null;

// ─── Step 1: Vehicle Data ──────────────────────────────────
export interface BasicInfo {
  companyName: string;
  userOwner: string;
  inspectionPlace: string;
  inspectionDate: string;
  inspectorName: string;
}

export interface VehicleData {
  basicInfo: BasicInfo;
  vin: string;
  registrationPlates: string;
  make: string;
  model: string;
  year: string;
  color: string;
  mileage: string;
  engineCapacity: string;
  enginePower: string;
  fuelType: string;
  bodyType: string;
  ownWeight: string;
  loadCapacity: string;
  totalWeight: string;
  seatsCount: string;
  doorsCount: string;
  firstRegistration: string;
  productionDate: string;
  registrationCertificate: string;
  gearboxType: string;
  driveType: string;
}

// ─── Step 2: Equipment Completeness ────────────────────────
export interface EquipmentCompleteness {
  registrationDocPresented: ToggleValue;
  vehicleCardPresented: ToggleValue;
  purchaseInvoicePresented: ToggleValue;
  serviceBookPresented: ToggleValue;
  antiTheftSystem: ToggleValue;
  immobilizerWorking: ToggleValue;
  keysCount: string;
  spareTire: ToggleValue;
  jackAndTools: ToggleValue;
  warningTriangle: ToggleValue;
  firstAidKit: ToggleValue;
  fireExtinguisher: ToggleValue;
  ownerManual: ToggleValue;
}

// ─── Step 3: Full Equipment List ───────────────────────────
export interface FullEquipment {
  // Safety
  abs: ToggleValue;
  esp: ToggleValue;
  airbagDriver: ToggleValue;
  airbagPassenger: ToggleValue;
  airbagSide: ToggleValue;
  airbagCurtain: ToggleValue;
  tractionControl: ToggleValue;
  // Comfort
  airConditioning: ToggleValue;
  automaticAC: ToggleValue;
  heatedSeats: ToggleValue;
  electricWindows: ToggleValue;
  electricMirrors: ToggleValue;
  heatedMirrors: ToggleValue;
  powerSteering: ToggleValue;
  cruiseControl: ToggleValue;
  parkingSensors: ToggleValue;
  rearCamera: ToggleValue;
  rainSensors: ToggleValue;
  lightSensors: ToggleValue;
  centralLocking: ToggleValue;
  keylessEntry: ToggleValue;
  startStop: ToggleValue;
  // Electronics
  navigation: ToggleValue;
  bluetooth: ToggleValue;
  usb: ToggleValue;
  multimediaScreen: ToggleValue;
  soundSystem: ToggleValue;
  onboardComputer: ToggleValue;
  // Exterior
  ledLights: ToggleValue;
  xenonLights: ToggleValue;
  fogLights: ToggleValue;
  roofRails: ToggleValue;
  sunroof: ToggleValue;
  panoramicRoof: ToggleValue;
  towBar: ToggleValue;
  alloyWheels: ToggleValue;
  tintedWindows: ToggleValue;
  [key: string]: ToggleValue;
}

// ─── Step 4: Paint Measurement ─────────────────────────────
export interface PaintZone {
  value: string;  // µm reading
  status: 'ok' | 'repainted' | 'putty' | '';
}

export interface PaintMeasurement {
  hood: PaintZone;
  roof: PaintZone;
  trunk: PaintZone;
  leftFrontFender: PaintZone;
  leftRearFender: PaintZone;
  rightFrontFender: PaintZone;
  rightRearFender: PaintZone;
  leftFrontDoor: PaintZone;
  leftRearDoor: PaintZone;
  rightFrontDoor: PaintZone;
  rightRearDoor: PaintZone;
  leftSill: PaintZone;
  rightSill: PaintZone;
  leftAColumn: PaintZone;
  rightAColumn: PaintZone;
  leftBColumn: PaintZone;
  rightBColumn: PaintZone;
  leftCColumn: PaintZone;
  rightCColumn: PaintZone;
  rearBumper: PaintZone;
  frontBumper: PaintZone;
  [key: string]: PaintZone;
}

// ─── Step 5: Tires ─────────────────────────────────────────
export interface WheelData {
  brand: string;
  size: string;
  dot: string;
  treadDepth: string;
  type: string;    // summer | winter | all-season
  condition: ToggleValue;
}

export interface TiresData {
  frontLeft: WheelData;
  frontRight: WheelData;
  rearLeft: WheelData;
  rearRight: WheelData;
  spareTire: ToggleValue;
  spareTireCondition: string;
}

// ─── Step 6: Photos ────────────────────────────────────────
export interface PhotoSlot {
  id: string;
  label: string;
  base64: string;
  required: boolean;
}

// ─── Step 7 & 8: Damage ───────────────────────────────────
export interface DamageEntry {
  id: string;
  part: string;
  type: string;
  size: string;
  description: string;
  action: 'Naprawa' | 'Wymiana' | 'Polerowanie' | '';
  photos: string[];  // base64
}

// ─── Step 9: Mechanical ───────────────────────────────────
export interface MechanicalChecklist {
  engineCondition: ToggleValue;
  engineOilLevel: ToggleValue;
  coolantLevel: ToggleValue;
  engineNoises: ToggleValue;
  engineSmoke: ToggleValue;
  transmission: ToggleValue;
  clutch: ToggleValue;
  driveShaft: ToggleValue;
  frontSuspension: ToggleValue;
  rearSuspension: ToggleValue;
  shockAbsorbers: ToggleValue;
  frontBrakes: ToggleValue;
  rearBrakes: ToggleValue;
  handbrake: ToggleValue;
  steeringPlay: ToggleValue;
  steeringPump: ToggleValue;
  exhaustSystem: ToggleValue;
  airConditioning: ToggleValue;
  heatingSystem: ToggleValue;
  electricalSystem: ToggleValue;
  batteryCondition: ToggleValue;
  lightsAll: ToggleValue;
  wipers: ToggleValue;
  horn: ToggleValue;
  // Test drive
  testDriveConducted: ToggleValue;
  testDriveImpossible: ToggleValue;
  testDriveImpossibleText: string;
  testDriveComment: string;
}

// ─── Step 10: Notes & Valuation ───────────────────────────
export interface NotesValuation {
  // UWAGI WYCENA fields
  registrationDocPresented: ToggleValue;
  vehicleCardPresented: ToggleValue;
  purchaseInvoicePresented: ToggleValue;
  serviceBookPresented: ToggleValue;
  antiTheftSecurityPresented: ToggleValue;
  immobilizerWorking: ToggleValue;
  testDrivePossible: ToggleValue;
  testDriveImpossibleReason: ToggleValue;
  testDriveImpossibleText: string;
  vinVerification: 'NIE BADANO' | 'OK' | 'NIEZGODNE' | '';
  // Professional notes
  valuationNotes: string;
  generalComments: string;
  estimatedValue: string;
  marketComparison: string;
}

// ─── Step 11: Final Summary ───────────────────────────────
export interface FinalSummary {
  vinConfirmed: boolean;
  signatureAppraiser: string;  // base64
  signatureClient: string;     // base64
  signatureYard: string;       // base64
  submittedAt: string;
  submissionStatus: 'pending' | 'submitted' | 'error' | '';
}

// ─── Master State ─────────────────────────────────────────
export interface StepData {
  vehicleData: VehicleData;
  equipmentCompleteness: EquipmentCompleteness;
  fullEquipment: FullEquipment;
  paintMeasurement: PaintMeasurement;
  tires: TiresData;
  photos: PhotoSlot[];
  exteriorDamage: DamageEntry[];
  interiorDamage: DamageEntry[];
  mechanical: MechanicalChecklist;
  notesValuation: NotesValuation;
  finalSummary: FinalSummary;
}

// ─── Store Interface ──────────────────────────────────────
interface InspectionState {
  currentStep: number;
  maxVisitedStep: number;
  data: StepData;
  // Auth
  auth: {
    isAuthenticated: boolean;
    token: string | null;
    user: AuthUser | null;
    loading: boolean;
    error: string | null;
  };
  // Jobs
  jobs: {
    list: InspectionJob[];
    currentJobId: string | null;
    loading: boolean;
    error: string | null;
  };

  // Actions
  setStep: (step: number) => void;
  // Auth Actions
  setAuth: (auth: Partial<InspectionState['auth']>) => void;
  login: (email: string, token: string, user: AuthUser) => void;
  logout: () => void;
  // Job Actions
  setJobsLoading: (loading: boolean) => void;
  setJobs: (jobs: InspectionJob[]) => void;
  setJobsError: (error: string | null) => void;
  selectJob: (jobId: string | null) => void;

  updateField: <K extends keyof StepData>(
    step: K,
    field: string,
    value: any
  ) => void;
  updateStepData: <K extends keyof StepData>(
    step: K,
    data: Partial<StepData[K]>
  ) => void;
  // Damage CRUD
  addDamage: (type: 'exteriorDamage' | 'interiorDamage', entry: DamageEntry) => void;
  removeDamage: (type: 'exteriorDamage' | 'interiorDamage', id: string) => void;
  updateDamage: (type: 'exteriorDamage' | 'interiorDamage', id: string, data: Partial<DamageEntry>) => void;
  // Photos
  setPhotoSlot: (slotId: string, base64: string) => void;
  clearPhotoSlot: (slotId: string) => void;
  // Tires
  copyTiresToAxle: (source: 'frontLeft' | 'frontRight' | 'rearLeft' | 'rearRight', target: 'front' | 'rear' | 'all') => void;
  // Signatures
  setSignature: (role: 'signatureAppraiser' | 'signatureClient' | 'signatureYard', base64: string) => void;
  // Reset
  reset: () => void;
}

// ─── Default Paint Zone ───────────────────────────────────
const emptyZone: PaintZone = { value: '', status: '' };

// ─── Default Wheel ────────────────────────────────────────
const emptyWheel: WheelData = {
  brand: '', size: '', dot: '', treadDepth: '', type: '', condition: null,
};

// ─── Photo Slots ──────────────────────────────────────────
const defaultPhotoSlots: PhotoSlot[] = [
  { id: 'front', label: 'Front', base64: '', required: true },
  { id: 'rear', label: 'Rear', base64: '', required: true },
  { id: 'left_side', label: 'Left Side', base64: '', required: true },
  { id: 'right_side', label: 'Right Side', base64: '', required: true },
  { id: 'front_left_angle', label: 'Front Left Angle', base64: '', required: true },
  { id: 'front_right_angle', label: 'Front Right Angle', base64: '', required: true },
  { id: 'rear_left_angle', label: 'Rear Left Angle', base64: '', required: true },
  { id: 'rear_right_angle', label: 'Rear Right Angle', base64: '', required: true },
  { id: 'engine', label: 'Engine Bay', base64: '', required: true },
  { id: 'trunk', label: 'Trunk', base64: '', required: true },
  { id: 'trunk_floor', label: 'Trunk Floor', base64: '', required: true },
  { id: 'dashboard', label: 'Dashboard', base64: '', required: true },
  { id: 'instrument_cluster', label: 'Instrument Cluster', base64: '', required: true },
  { id: 'mileage', label: 'Mileage Close-up', base64: '', required: true },
  { id: 'front_seats', label: 'Front Seats', base64: '', required: true },
  { id: 'rear_seats', label: 'Rear Seats', base64: '', required: true },
  { id: 'steering_wheel', label: 'Steering Wheel', base64: '', required: true },
  { id: 'vin_plate', label: 'VIN Plate', base64: '', required: true },
  { id: 'vin_windshield', label: 'VIN Windshield', base64: '', required: true },
  { id: 'registration_doc_front', label: 'Reg. Doc Front', base64: '', required: true },
  { id: 'registration_doc_back', label: 'Reg. Doc Back', base64: '', required: true },
  { id: 'front_left_wheel', label: 'Front Left Wheel', base64: '', required: true },
  { id: 'front_right_wheel', label: 'Front Right Wheel', base64: '', required: true },
  { id: 'rear_left_wheel', label: 'Rear Left Wheel', base64: '', required: true },
  { id: 'rear_right_wheel', label: 'Rear Right Wheel', base64: '', required: true },
  { id: 'tire_dot_front_left', label: 'Tire DOT FL', base64: '', required: true },
  { id: 'tire_dot_front_right', label: 'Tire DOT FR', base64: '', required: true },
  { id: 'tire_dot_rear_left', label: 'Tire DOT RL', base64: '', required: true },
  { id: 'tire_dot_rear_right', label: 'Tire DOT RR', base64: '', required: true },
  { id: 'headliner', label: 'Headliner', base64: '', required: true },
  { id: 'roof_exterior', label: 'Roof (Exterior)', base64: '', required: true },
  { id: 'undercarriage', label: 'Undercarriage', base64: '', required: true },
  { id: 'exhaust', label: 'Exhaust System', base64: '', required: true },
  { id: 'suspension_front', label: 'Front Suspension', base64: '', required: true },
  { id: 'suspension_rear', label: 'Rear Suspension', base64: '', required: true },
  { id: 'brake_front', label: 'Front Brakes', base64: '', required: true },
  { id: 'brake_rear', label: 'Rear Brakes', base64: '', required: true },
  { id: 'multimedia', label: 'Multimedia System', base64: '', required: false },
  { id: 'ac_display', label: 'A/C Controls', base64: '', required: false },
  { id: 'key_fob', label: 'Key/Remote', base64: '', required: false },
  { id: 'extra_1', label: 'Extra Photo 1', base64: '', required: false },
  { id: 'extra_2', label: 'Extra Photo 2', base64: '', required: false },
  { id: 'extra_3', label: 'Extra Photo 3', base64: '', required: false },
];

// ─── Initial Data ─────────────────────────────────────────
const initialData: StepData = {
  vehicleData: {
    basicInfo: {
      companyName: '', userOwner: '', inspectionPlace: '',
      inspectionDate: '', inspectorName: '',
    },
    vin: '', registrationPlates: '', make: '', model: '',
    year: '', color: '', mileage: '', engineCapacity: '',
    enginePower: '', fuelType: '', bodyType: '', ownWeight: '',
    loadCapacity: '', totalWeight: '', seatsCount: '', doorsCount: '',
    firstRegistration: '', productionDate: '', registrationCertificate: '',
    gearboxType: '', driveType: '',
  },
  equipmentCompleteness: {
    registrationDocPresented: null, vehicleCardPresented: null,
    purchaseInvoicePresented: null, serviceBookPresented: null,
    antiTheftSystem: null, immobilizerWorking: null,
    keysCount: '', spareTire: null, jackAndTools: null,
    warningTriangle: null, firstAidKit: null,
    fireExtinguisher: null, ownerManual: null,
  },
  fullEquipment: {
    abs: null, esp: null, airbagDriver: null, airbagPassenger: null,
    airbagSide: null, airbagCurtain: null, tractionControl: null,
    airConditioning: null, automaticAC: null, heatedSeats: null,
    electricWindows: null, electricMirrors: null, heatedMirrors: null,
    powerSteering: null, cruiseControl: null, parkingSensors: null,
    rearCamera: null, rainSensors: null, lightSensors: null,
    centralLocking: null, keylessEntry: null, startStop: null,
    navigation: null, bluetooth: null, usb: null,
    multimediaScreen: null, soundSystem: null, onboardComputer: null,
    ledLights: null, xenonLights: null, fogLights: null,
    roofRails: null, sunroof: null, panoramicRoof: null,
    towBar: null, alloyWheels: null, tintedWindows: null,
  },
  paintMeasurement: {
    hood: { ...emptyZone }, roof: { ...emptyZone }, trunk: { ...emptyZone },
    leftFrontFender: { ...emptyZone }, leftRearFender: { ...emptyZone },
    rightFrontFender: { ...emptyZone }, rightRearFender: { ...emptyZone },
    leftFrontDoor: { ...emptyZone }, leftRearDoor: { ...emptyZone },
    rightFrontDoor: { ...emptyZone }, rightRearDoor: { ...emptyZone },
    leftSill: { ...emptyZone }, rightSill: { ...emptyZone },
    leftAColumn: { ...emptyZone }, rightAColumn: { ...emptyZone },
    leftBColumn: { ...emptyZone }, rightBColumn: { ...emptyZone },
    leftCColumn: { ...emptyZone }, rightCColumn: { ...emptyZone },
    rearBumper: { ...emptyZone }, frontBumper: { ...emptyZone },
  },
  tires: {
    frontLeft: { ...emptyWheel }, frontRight: { ...emptyWheel },
    rearLeft: { ...emptyWheel }, rearRight: { ...emptyWheel },
    spareTire: null, spareTireCondition: '',
  },
  photos: [...defaultPhotoSlots],
  exteriorDamage: [],
  interiorDamage: [],
  mechanical: {
    engineCondition: null, engineOilLevel: null, coolantLevel: null,
    engineNoises: null, engineSmoke: null, transmission: null,
    clutch: null, driveShaft: null, frontSuspension: null,
    rearSuspension: null, shockAbsorbers: null, frontBrakes: null,
    rearBrakes: null, handbrake: null, steeringPlay: null,
    steeringPump: null, exhaustSystem: null, airConditioning: null,
    heatingSystem: null, electricalSystem: null, batteryCondition: null,
    lightsAll: null, wipers: null, horn: null,
    testDriveConducted: null, testDriveImpossible: null, testDriveImpossibleText: '', testDriveComment: '',
  },
  notesValuation: {
    registrationDocPresented: null, vehicleCardPresented: null,
    purchaseInvoicePresented: null, serviceBookPresented: null,
    antiTheftSecurityPresented: null, immobilizerWorking: null,
    testDrivePossible: null, testDriveImpossibleReason: null,
    testDriveImpossibleText: '', vinVerification: '',
    valuationNotes: '', generalComments: '', estimatedValue: '',
    marketComparison: '',
  },
  finalSummary: {
    vinConfirmed: false,
    signatureAppraiser: '', signatureClient: '', signatureYard: '',
    submittedAt: '', submissionStatus: '',
  },
};

// ─── Store ────────────────────────────────────────────────
export const useInspectionStore = create<InspectionState>()(
  persist(
    (set) => ({
      currentStep: 1,
      maxVisitedStep: 1,
      data: initialData,
      auth: {
        isAuthenticated: false,
        token: null,
        user: null,
        loading: false,
        error: null,
      },
      jobs: {
        list: [],
        currentJobId: null,
        loading: false,
        error: null,
      },

      setStep: (step: number) =>
        set((state) => ({
          currentStep: step,
          maxVisitedStep: Math.max(state.maxVisitedStep, step),
        })),

      // ── Auth Actions ──
      setAuth: (authUpdate) =>
        set((state) => ({ auth: { ...state.auth, ...authUpdate } })),

      login: (email, token, user) =>
        set(() => ({
          auth: {
            isAuthenticated: true,
            token,
            user,
            loading: false,
            error: null,
          },
        })),

      logout: () =>
        set(() => ({
          auth: {
            isAuthenticated: false,
            token: null,
            user: null,
            loading: false,
            error: null,
          },
          jobs: { list: [], currentJobId: null, loading: false, error: null },
          currentStep: 1,
          maxVisitedStep: 1,
          data: initialData,
        })),

      // ── Job Actions ──
      setJobsLoading: (loading) =>
        set((state) => ({ jobs: { ...state.jobs, loading } })),

      setJobs: (list) =>
        set((state) => ({ jobs: { ...state.jobs, list, loading: false, error: null } })),

      setJobsError: (error) =>
        set((state) => ({ jobs: { ...state.jobs, error, loading: false } })),

      selectJob: (jobId) =>
        set((state) => {
          if (!jobId) {
            return {
              jobs: { ...state.jobs, currentJobId: null },
              currentStep: 1,
              data: initialData,
            };
          }

          const job = state.jobs.list.find((j) => j.id === jobId);
          if (!job) return state;

          // Pre-fill Step 1 with job data
          const newData = { ...initialData };
          newData.vehicleData.basicInfo.userOwner = job.clientName;
          newData.vehicleData.vin = job.vin;
          newData.vehicleData.registrationPlates = job.plates;
          // Optionally add more pre-filled fields here

          return {
            jobs: { ...state.jobs, currentJobId: jobId },
            currentStep: 1,
            data: newData,
          };
        }),

      updateField: (step, field, value) =>
        set((state) => ({
          data: {
            ...state.data,
            [step]: { ...(state.data[step] as any), [field]: value },
          },
        })),

      updateStepData: (step, newData) =>
        set((state) => ({
          data: {
            ...state.data,
            [step]: { ...(state.data[step] as any), ...newData },
          },
        })),

      // ── Damage CRUD ──
      addDamage: (type, entry) =>
        set((state) => ({
          data: {
            ...state.data,
            [type]: [...(state.data[type] as DamageEntry[]), entry],
          },
        })),

      removeDamage: (type, id) =>
        set((state) => ({
          data: {
            ...state.data,
            [type]: (state.data[type] as DamageEntry[]).filter((e) => e.id !== id),
          },
        })),

      updateDamage: (type, id, update) =>
        set((state) => ({
          data: {
            ...state.data,
            [type]: (state.data[type] as DamageEntry[]).map((e) =>
              e.id === id ? { ...e, ...update } : e
            ),
          },
        })),

      // ── Photo Slots ──
      setPhotoSlot: (slotId, base64) =>
        set((state) => ({
          data: {
            ...state.data,
            photos: state.data.photos.map((p) =>
              p.id === slotId ? { ...p, base64 } : p
            ),
          },
        })),

      clearPhotoSlot: (slotId) =>
        set((state) => ({
          data: {
            ...state.data,
            photos: state.data.photos.map((p) =>
              p.id === slotId ? { ...p, base64: '' } : p
            ),
          },
        })),

      // ── Tire Copy ──
      copyTiresToAxle: (source, target) =>
        set((state) => {
          const src = state.data.tires[source];
          // We only copy Brand, Size, and Type (exclude treadDepth and DOT)
          const { brand, size, type } = src;
          const newTires = { ...state.data.tires };

          if (target === 'front' || target === 'all') {
            newTires.frontLeft = { ...newTires.frontLeft, brand, size, type };
            newTires.frontRight = { ...newTires.frontRight, brand, size, type };
          }
          if (target === 'rear' || target === 'all') {
            newTires.rearLeft = { ...newTires.rearLeft, brand, size, type };
            newTires.rearRight = { ...newTires.rearRight, brand, size, type };
          }

          return { data: { ...state.data, tires: newTires } };
        }),

      // ── Signatures ──
      setSignature: (role, base64) =>
        set((state) => ({
          data: {
            ...state.data,
            finalSummary: { ...state.data.finalSummary, [role]: base64 },
          },
        })),

      // ── Reset ──
      reset: () => set({ currentStep: 1, maxVisitedStep: 1, data: initialData }),
    }),
    {
      name: 'inspection-storage',
      storage: createJSONStorage(() => localStorage),
    }
  )
);
