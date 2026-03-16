import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { inspectionApi } from '@/api/inspectionApi';
import { submissionQueue } from '@/lib/submissionQueue';

// ─── Auth & Jobs Types ──────────────────────────────────────
export interface AuthUser {
  id: string;
  email: string;
  name: string;
}

export interface InspectionJob {
  id: string;
  bitrixTaskId?: string;
  clientName: string;
  vin: string;
  plates: string;
  phone: string;
  appointmentTime: string;
  deadline: string; // ISO date "2026-03-13"
  status: 'ready' | 'in_progress' | 'completed';
  make?: string;
  model?: string;
  city?: string;
  jobType?: 'WYCENA' | 'CFM' | 'UNKNOWN';
  scheduledDate?: string; // UF_CRM_1772108256983
  hasConflict?: boolean;
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
  spareWheel: ToggleValue;
  jackAndTools: ToggleValue;
  triangular: ToggleValue;
  firstAidKit: ToggleValue;
  fireExtinguisher: ToggleValue;
  compressor: ToggleValue;
  repairKit: ToggleValue;
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
  model: string;
  size: string;
  dot: string;
  loadIndex: string;
  speedIndex: string;
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
  isAbsentRep: boolean;        // Dysponent nieobecny
  absentRepComment: string;    // Comment for absence
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

export interface InspectionPayload extends StepData {
  deal_id?: string;
  job_id?: string;
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
    currentUserId: number | null;
    currentUserName: string | null;
  };
  // Jobs
  jobs: {
    scheduled: InspectionJob[];
    unscheduled: InspectionJob[];
    totalInBitrix: number;
    currentJobId: string | null;
    loading: boolean;
    error: string | null;
  };
  // Calendar
  calendar: {
    selectedDate: string;
    expanded: boolean;
  };
  // Drafts (to prevent data loss when switching jobs)
  drafts: Record<string, StepData>;

  // Actions
  setStep: (step: number) => void;
  // Auth Actions
  setAuth: (auth: Partial<InspectionState['auth']>) => void;
  login: (email: string, token: string, user: AuthUser) => void;
  fetchMe: () => Promise<void>;
  logout: () => void;
  // Job Actions
  setJobsLoading: (loading: boolean) => void;
  setJobs: (scheduled: InspectionJob[], unscheduled: InspectionJob[], total?: number) => void;
  setJobsError: (error: string | null) => void;
  selectJob: (jobId: string | null) => void;
  // Calendar Actions
  setSelectedDate: (date: string) => void;
  toggleCalendarExpanded: () => void;
  scheduleJob: (jobId: string, date: string) => Promise<{ success: boolean; message: string; conflict?: boolean }>;

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
  // reset
  reset: () => void;

  // ── Bitrix Sync Actions (Phases 7 & 8) ──
  syncStepWithBitrix: (stepNumber: number) => Promise<void>;
  submitToBitrix: () => Promise<{ success: boolean; message: string }>;
  fetchDealsForCalendar: (date: string) => Promise<void>;
  fetchFullDeal: (dealId: string) => Promise<void>;
}

// ─── Default Paint Zone ───────────────────────────────────
const emptyZone: PaintZone = { value: '', status: '' };

// ─── Default Wheel ────────────────────────────────────────
const emptyWheel: WheelData = {
  brand: '', model: '', size: '', dot: '', loadIndex: '', speedIndex: '', treadDepth: '', type: '', condition: null,
};

// ─── Photo Slots ──────────────────────────────────────────
const defaultPhotoSlots: PhotoSlot[] = [
  // Exterior Sequence
  { id: 'rear', label: '1. Tył', base64: '', required: true },
  { id: 'rear_left', label: '2. Tył Lewy', base64: '', required: true },
  { id: 'left_side', label: '3. Lewy Bok', base64: '', required: true },
  { id: 'front_left', label: '4. Przód Lewy', base64: '', required: true },
  { id: 'front', label: '5. Przód', base64: '', required: true },
  { id: 'front_right', label: '6. Przód Prawy', base64: '', required: true },
  { id: 'right_side', label: '7. Prawy Bok', base64: '', required: true },
  { id: 'rear_right', label: '8. Tył Prawy', base64: '', required: true },
  { id: 'roof', label: '9. Dach', base64: '', required: true },
  
  // Interior & Engine
  { id: 'dashboard', label: '10. Kokpit / Deska', base64: '', required: true },
  { id: 'odometer', label: '11. Licznik (Przebieg)', base64: '', required: true },
  { id: 'front_seats', label: '12. Fotele przód', base64: '', required: true },
  { id: 'rear_seats', label: '13. Kanapa tył', base64: '', required: true },
  { id: 'trunk', label: '14. Bagażnik', base64: '', required: true },
  { id: 'engine', label: '15. Komora silnika', base64: '', required: true },
  { id: 'vin_plate', label: '16. Tabliczka VIN', base64: '', required: true },
  { id: 'tire_sticker', label: '17. Naklejka ciśnienia', base64: '', required: false },

  // Tires & Rims
  { id: 'tire_fl', label: '18. Opona PL', base64: '', required: true },
  { id: 'rim_fl', label: '19. Felga PL', base64: '', required: true },
  { id: 'tire_fr', label: '20. Opona PP', base64: '', required: true },
  { id: 'rim_fr', label: '21. Felga PP', base64: '', required: true },
  { id: 'tire_rl', label: '22. Opona TL', base64: '', required: true },
  { id: 'rim_rl', label: '23. Felga TL', base64: '', required: false },
  { id: 'tire_rr', label: '24. Opona TP', base64: '', required: true },
  { id: 'rim_rr', label: '25. Felga TP', base64: '', required: true },

  // Documents
  { id: 'doc_1', label: '26. Dokumenty 1', base64: '', required: true },
  { id: 'doc_2', label: '27. Dokumenty 2', base64: '', required: true },

  // Expandable Extra Slots (Phased in UI)
  ...Array.from({ length: 15 }, (_, i) => ({
    id: `extra_${i + 1}`,
    label: `Dodatkowe ${i + 1}`,
    base64: '',
    required: false
  }))
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
    keysCount: '', spareWheel: null, jackAndTools: null,
    triangular: null, firstAidKit: null,
    fireExtinguisher: null, compressor: null, repairKit: null,
    ownerManual: null,
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
    signatureAppraiser: '',
    signatureClient: '',
    signatureYard: '',
    isAbsentRep: false,
    absentRepComment: '',
    submittedAt: '',
    submissionStatus: '',
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
        currentUserId: null,
        currentUserName: null,
      },
      jobs: {
        scheduled: [],
        unscheduled: [],
        totalInBitrix: 0,
        currentJobId: null,
        loading: false,
        error: null,
      },
      calendar: {
        selectedDate: new Date().toISOString().split('T')[0],
        expanded: false,
      },
      drafts: {},

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
            currentUserId: null,
            currentUserName: user.name || 'Rzeczoznawca',
          },
        })),

      logout: () =>
        set((state) => ({
          auth: {
            ...state.auth,
            isAuthenticated: false,
            token: null,
            user: null,
            currentUserId: null,
            currentUserName: null,
          },
          jobs: { 
            scheduled: [], 
            unscheduled: [], 
            totalInBitrix: 0,
            currentJobId: null, 
            loading: false, 
            error: null 
          },
          calendar: {
            selectedDate: new Date().toISOString().split('T')[0],
            expanded: false,
          },
          drafts: {},
          currentStep: 1,
          maxVisitedStep: 1,
          data: initialData,
        })),

      fetchMe: async () => {
        try {
          const response = await inspectionApi.getCurrentUser();
          if (response && response.id) {
            set((state) => ({
              auth: {
                ...state.auth,
                currentUserId: Number(response.bitrix_id),
                currentUserName: response.name || 'Rzeczoznawca'
              }
            }));
          }
        } catch (error) {
          console.error("Failed to fetch current user:", error);
          set((state) => ({
            auth: {
              ...state.auth,
              currentUserName: state.auth.currentUserName || 'Rzeczoznawca'
            }
          }));
        }
      },

      fetchFullDeal: async (dealId: string) => {
        set((state) => ({ jobs: { ...state.jobs, loading: true, error: null } }));
        try {
          const deal = await inspectionApi.getDeal(dealId);
          set((state) => {
            const initial = JSON.parse(JSON.stringify(initialData));
            // Merge deal data into vehicleData.basicInfo and core fields
            const newVehicleData = {
              ...initial.vehicleData,
              basicInfo: {
                ...initial.vehicleData.basicInfo,
                companyName: deal.clientName || deal.companyName || '',
                userOwner: deal.clientName || '',
                inspectionPlace: deal.address || deal.inspectionPlace || '',
                inspectionDate: deal.scheduledDate || '',
                inspectorName: state.auth.currentUserName || 'Rzeczoznawca',
              },
              vin: deal.vin || '',
              registrationPlates: deal.plates || '',
              make: deal.make || '',
              model: deal.model || '',
              year: deal.year?.toString() || '',
              mileage: deal.mileage?.toString() || '',
            };

            return {
              jobs: { ...state.jobs, currentJobId: dealId, loading: false },
              data: { ...initial, vehicleData: newVehicleData },
              currentStep: 1,
              maxVisitedStep: 1
            };
          });
        } catch (error: any) {
          console.error("Failed to fetch full deal:", error);
          set((state) => ({ 
            jobs: { ...state.jobs, loading: false, error: "Nie udało się pobrać danych z Bitrix24" } 
          }));
          throw error;
        }
      },

      // ── Job Actions ──
      setJobsLoading: (loading) =>
        set((state) => ({ jobs: { ...state.jobs, loading } })),

      setJobs: (scheduled, unscheduled, total) =>
        set((state) => ({ 
          jobs: { 
            ...state.jobs, 
            scheduled, 
            unscheduled, 
            totalInBitrix: total || (scheduled.length + unscheduled.length),
            loading: false, 
            error: null 
          } 
        })),

      setJobsError: (error) =>
        set((state) => ({ jobs: { ...state.jobs, error, loading: false } })),

      selectJob: (jobId) =>
        set((state) => {
          // If a job is currently active, save it to drafts
          const newDrafts = { ...state.drafts };
          if (state.jobs.currentJobId) {
            newDrafts[state.jobs.currentJobId] = state.data;
          }

          if (!jobId) {
            return {
              jobs: { ...state.jobs, currentJobId: null },
              drafts: newDrafts,
              currentStep: 1,
              data: initialData,
            };
          }

          const job = [...state.jobs.scheduled, ...state.jobs.unscheduled].find((j) => j.id === jobId);
          if (!job) return state;

          // Load from drafts or pre-fill Step 1
          let finalData: StepData;
          if (newDrafts[jobId]) {
            finalData = newDrafts[jobId];
          } else {
            finalData = JSON.parse(JSON.stringify(initialData));
            finalData.vehicleData.basicInfo.userOwner = job.clientName;
            finalData.vehicleData.vin = job.vin;
            finalData.vehicleData.registrationPlates = job.plates;
            finalData.vehicleData.make = job.make || "";
            finalData.vehicleData.model = job.model || "";
            // Optionally add more pre-filled fields here
          }

          return {
            jobs: { ...state.jobs, currentJobId: jobId },
            drafts: newDrafts,
            currentStep: 1,
            data: finalData,
          };
        }),

      setSelectedDate: (date) =>
        set((state) => ({
          calendar: { ...state.calendar, selectedDate: date },
        })),

      toggleCalendarExpanded: () =>
        set((state) => ({
          calendar: { ...state.calendar, expanded: !state.calendar.expanded },
        })),

      scheduleJob: async (jobId, date) => {
        try {
          const dealId = jobId;
          const isoDate = date;
          const response = await inspectionApi.scheduleInspection(dealId, isoDate);
      if (response.success) {
        set((state) => ({
          jobs: {
            ...state.jobs,
            scheduled: state.jobs.scheduled.map((j) =>
              j.id === dealId
                ? { ...j, scheduledDate: isoDate, hasConflict: response.conflict }
                : j
            ),
            unscheduled: state.jobs.unscheduled.map((j) =>
              j.id === dealId
                ? { ...j, scheduledDate: isoDate, hasConflict: response.conflict }
                : j
            ),
          },
        }));
      }
      return response;
        } catch (error: any) {
          console.error("Failed to schedule job:", error);
          return { 
            success: false, 
            message: error.response?.data?.detail || "Błąd połączenia z serwerem",
            conflict: error.response?.status === 409
          };
        }
      },

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
      reset: () => set({ 
        currentStep: 1, 
        maxVisitedStep: 1, 
        data: initialData,
        jobs: {
          scheduled: [],
          unscheduled: [],
          totalInBitrix: 0,
          currentJobId: null,
          loading: false,
          error: null
        }
      }),

      // ── Bitrix Sync Actions ──

      syncStepWithBitrix: async (stepNumber: number) => {
        const state = useInspectionStore.getState();
        const dealId = state.jobs.currentJobId;
        if (!dealId || dealId.startsWith('mock-')) return;

        const stepKeys: Record<number, keyof StepData> = {
          1: 'vehicleData',
          2: 'equipmentCompleteness',
          3: 'fullEquipment',
          4: 'paintMeasurement',
          5: 'tires',
          6: 'photos',
          7: 'exteriorDamage',
          8: 'interiorDamage',
          9: 'mechanical',
          10: 'notesValuation',
          11: 'vehicleData', // Validation (no specific data, sync vehicle as heartbeat)
          12: 'finalSummary'
        };

        const fieldName = stepKeys[stepNumber];
        if (!fieldName) return;

        const stepPayload = state.data[fieldName];

        try {
          console.log(`[Bitrix Sync] Syncing step ${stepNumber} for deal ${dealId}`);
          await inspectionApi.saveInspectionStep(dealId, stepNumber, stepPayload);
          console.log(`[Bitrix Sync] Step ${stepNumber} synced successfully.`);
        } catch (error) {
          console.warn(`[Bitrix Sync] Step ${stepNumber} sync failed (offline?). Saved to draft.`, error);
          // Phase 8: Data is already in persisted Zustand store, so it's "queued" for next sync
        }
      },

      submitToBitrix: async () => {
        const state = useInspectionStore.getState();
        const dealId = state.jobs.currentJobId;

        if (!dealId || dealId.startsWith('mock-')) {
          return { success: false, message: "Cannot submit a mock job. Please select a real Bitrix24 deal." };
        }

        set((s) => ({
          data: {
            ...s.data,
            finalSummary: { ...s.data.finalSummary, submissionStatus: 'pending' }
          }
        }));

        try {
          // 1. Upload all base64 images first (Photos + Damages)
          // To simplify, we use the submissionQueue or direct batch upload
          console.log("[Bitrix Sync] Starting full submission for deal", dealId);

          // Construct the payload for transform_to_bitrix in backend
          // The backend expects flat keys, but our InspectionPayload.flatten() handles that
          // Here we just send the store data structure, backend Pydantic models will parse it
          const result = await inspectionApi.submitFullInspection({
            ...state.data,
            deal_id: dealId,
            job_id: dealId // in this PWA, jobId is the dealId
          });

          if (result.status === 'success') {
            set((s) => ({
              data: {
                ...s.data,
                finalSummary: {
                  ...s.data.finalSummary,
                  submissionStatus: 'submitted',
                  submittedAt: new Date().toISOString()
                }
              }
            }));
            return { success: true, message: "Inspection submitted successfully!" };
          }

          throw new Error(result.message || "Submission failed");

        } catch (error: any) {
          console.error("[Bitrix Sync] Submission failed:", error);
          set((s) => ({
            data: {
              ...s.data,
              finalSummary: { ...s.data.finalSummary, submissionStatus: 'error' }
            }
          }));

          // Trigger background retry loop (Phase 8)
          submissionQueue.startBackgroundRetry();

          return {
            success: false,
            message: `Submission failed: ${error.message}. We will retry in the background.`
          };
        }
      },

      fetchDealsForCalendar: async (date: string) => {
        set((s) => ({ jobs: { ...s.jobs, loading: true, error: null } }));
        try {
          const auth = useInspectionStore.getState().auth;
          const res = await inspectionApi.fetchDeals(date, date, auth.currentUserId?.toString());
          
          // Handle both old flat array and new grouped object as requested in FIX 1
          const scheduledRaw = Array.isArray(res) ? res : (res.scheduled || []);
          const unscheduledRaw = Array.isArray(res) ? [] : (res.unscheduled || []);
          const totalInBitrix = Array.isArray(res) ? res.length : (res.total_in_bitrix || 0);

          const transform = (d: any) => ({
            id: String(d.id),
            clientName: d.client_name || d.TITLE || 'Brak nazwy',
            vin: d.vin || '',
            plates: d.registration_number || '',
            phone: d.client_phone || '',
            appointmentTime: d.appointment_time || '09:00',
            deadline: date,
            status: (d.STAGE_ID === 'WON' || d.STAGE_ID === 'FINAL') ? 'completed' : 'ready',
            make: d.vehicle_brand || '',
            model: d.vehicle_model || '',
            city: d.inspection_place || '',
            jobType: d.job_type || 'WYCENA',
            scheduledDate: d.scheduled_date
          });

          set((s) => ({
            jobs: {
              ...s.jobs,
              scheduled: scheduledRaw.map(transform),
              unscheduled: unscheduledRaw.map(transform),
              totalInBitrix: totalInBitrix,
              loading: false
            }
          }));
        } catch (error: any) {
          set((s) => ({
            jobs: { ...s.jobs, loading: false, error: error.message }
          }));
        }
      },
    }),
    {
      name: 'inspection-storage',
      storage: createJSONStorage(() => localStorage),
    }
  )
);
