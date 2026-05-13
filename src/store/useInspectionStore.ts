import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { api } from '@/lib/api';
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
  status: 'new' | 'assigned' | 'scheduled' | 'completed' | 'in_valuation' | 'closed' | 'lost' | 'ready' | 'in_progress';
  stageId?: string;
  make?: string;
  model?: string;
  city?: string;
  location?: string;
  jobType?: 'WYCENA' | 'CFM' | 'UNKNOWN';
  scheduledDate?: string; // UF_CRM_1772108256983
  hasConflict?: boolean;
  inspectionAddress?: string;
  contactPhone?: string;
  contactPerson?: string;
  inspectorPhone?: string;
  notes?: string;
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
  // Original fields (kept for backward compat)
  registrationDocPresented: ToggleValue;
  vehicleCardPresented: ToggleValue;
  purchaseInvoicePresented: ToggleValue;
  serviceBookPresented: string | null;  // TAK | NIE | ELEKTRONICZNA
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
  // New fields per client checklist
  registrationPlates: ToggleValue;
  keys: ToggleValue;
  airConditioningWorking: ToggleValue;
  wheelWrench: ToggleValue;
  navigationCardWorking: ToggleValue;
  tractionBatteryChargingCable: ToggleValue;
  tractionBatteryChargingStation: ToggleValue;
  tractionBatteryChargeIndicator: ToggleValue;
  chargingCables: ToggleValue;
  vinMatchesDocs: ToggleValue;
  additionalEquipment: string;
}

// ─── Step 3: Full Equipment List ───────────────────────────
// Canonical 108-item catalogue sourced from client Excel sheet
// "wyposażenie" (Feb 2025). Keys kept in camelCase; legacy keys
// from earlier releases are preserved so in-progress inspections
// do not lose previously toggled values on upgrade.
export interface FullEquipment {
  // ── Bezpieczeństwo ──────────────────────────────────────
  abs: ToggleValue;
  esp: ToggleValue;
  asr: ToggleValue;
  alarm: ToggleValue;
  airbagDriver: ToggleValue;        // legacy — not on client list, kept
  airbagPassenger: ToggleValue;
  airbagSide: ToggleValue;          // legacy generic — kept
  airbagSideFront: ToggleValue;
  airbagSideRear: ToggleValue;
  airbagCurtain: ToggleValue;
  airbagKnee: ToggleValue;
  tractionControl: ToggleValue;     // legacy — kept
  blindSpotAssist: ToggleValue;
  laneChangeAssist: ToggleValue;
  nightVisionAssist: ToggleValue;
  vehicleAssist: ToggleValue;
  activeParkingSystem: ToggleValue;
  tirePressureSensor: ToggleValue;
  rainSensors: ToggleValue;
  lightSensors: ToggleValue;
  trafficSignRecognition: ToggleValue;
  // ── Komfort / fotele / kierownica ──────────────────────
  manualAC: ToggleValue;
  automaticAC: ToggleValue;
  airConditioning: ToggleValue;     // legacy generic — kept
  heatedSeats: ToggleValue;         // legacy → treated as "przednie"
  heatedRearSeats: ToggleValue;
  ventilatedFrontSeats: ToggleValue;
  ventilatedRearSeats: ToggleValue;
  massageFrontSeats: ToggleValue;
  massageRearSeats: ToggleValue;
  electricFrontSeats: ToggleValue;
  adjustableRearSeats: ToggleValue;
  sportSeats: ToggleValue;
  driverSeatMemory: ToggleValue;
  passengerSeatMemory: ToggleValue;
  thirdRowSeats: ToggleValue;
  armrestFront: ToggleValue;
  armrestRear: ToggleValue;
  leatherSteeringWheel: ToggleValue;
  multifunctionSteeringWheel: ToggleValue;
  heatedSteeringWheel: ToggleValue;
  paddleShifters: ToggleValue;
  electricSteeringColumn: ToggleValue;
  cruiseControl: ToggleValue;
  activeCruiseControl: ToggleValue;
  powerSteering: ToggleValue;
  comfortAccess: ToggleValue;
  keylessEntry: ToggleValue;
  centralLocking: ToggleValue;
  startStop: ToggleValue;           // legacy — kept
  headUpDisplay: ToggleValue;
  virtualCockpit: ToggleValue;
  onboardComputer: ToggleValue;
  // ── Parkowanie i kamery ─────────────────────────────────
  parkingSensors: ToggleValue;      // legacy generic — kept
  parkingSensorsFrontRear: ToggleValue;
  parkingSensorsRear: ToggleValue;
  parkingCamera: ToggleValue;
  rearCamera: ToggleValue;
  camera360: ToggleValue;
  // ── Multimedia ──────────────────────────────────────────
  radio: ToggleValue;
  radioUsb: ToggleValue;
  radioSd: ToggleValue;
  navigation: ToggleValue;
  dvdPlayerWithMonitor: ToggleValue;
  headrestMonitors: ToggleValue;
  tvTuner: ToggleValue;
  bluetooth: ToggleValue;           // legacy — kept
  usb: ToggleValue;                 // legacy — kept
  multimediaScreen: ToggleValue;    // legacy — kept
  soundSystem: ToggleValue;         // legacy — kept
  // ── Oświetlenie ─────────────────────────────────────────
  daytimeRunningLights: ToggleValue;
  daytimeRunningLightsLed: ToggleValue;
  ledLights: ToggleValue;
  fullLedLights: ToggleValue;
  xenonLights: ToggleValue;
  laserLights: ToggleValue;
  fogLights: ToggleValue;
  corneringLights: ToggleValue;
  bendLighting: ToggleValue;
  headlightWashers: ToggleValue;
  // ── Nadwozie / dach / szyby / lusterka ─────────────────
  sunroof: ToggleValue;             // legacy — kept
  electricOpeningRoof: ToggleValue;
  solarOpeningRoof: ToggleValue;
  panoramicRoof: ToggleValue;
  roofRails: ToggleValue;
  metallicPaint: ToggleValue;
  heatedFrontWindshield: ToggleValue;
  electricWindows: ToggleValue;     // legacy generic — kept
  electricWindowsFront: ToggleValue;
  electricWindowsRear: ToggleValue;
  sunBlindRear: ToggleValue;
  sunBlindSide: ToggleValue;
  tintedWindows: ToggleValue;       // legacy — kept
  electricMirrors: ToggleValue;
  heatedMirrors: ToggleValue;
  foldingElectricMirrors: ToggleValue;
  autoDimmingExtMirrors: ToggleValue;
  autoDimmingIntMirror: ToggleValue;
  electricClosingDoors: ToggleValue;
  electricTailgate: ToggleValue;
  towBar: ToggleValue;
  alloyWheels: ToggleValue;
  structuralWheels: ToggleValue;
  alloySpareWheel: ToggleValue;
  compactSpareWheel: ToggleValue;
  // ── Tapicerka / wykończenie wnętrza ─────────────────────
  leatherUpholstery: ToggleValue;
  alcantaraUpholstery: ToggleValue;
  fabricLeatherUpholstery: ToggleValue;
  velourUpholstery: ToggleValue;
  blackHeadliner: ToggleValue;
  interiorTrimAluminum: ToggleValue;
  interiorTrimWood: ToggleValue;
  interiorTrimCarbon: ToggleValue;
  // ── Pozostałe / dodatkowe ───────────────────────────────
  fridge: ToggleValue;
  foldingTables: ToggleValue;
  powerSocket230vTrunk: ToggleValue;
  airSuspension: ToggleValue;
  ceramicBrakes: ToggleValue;
  lpgSystem: ToggleValue;
  webasto: ToggleValue;
  tachograph: ToggleValue;
  winch: ToggleValue;
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
  isVideo?: boolean;
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
  /**
   * Set to true the first time the inspector tries to advance past Step 9
   * (Mechanika) without filling the required fields. Drives the red-border /
   * "To pole jest wymagane" error styling in MechanicalStep. Cleared whenever
   * the inspector leaves Step 9 so it doesn't carry into other steps.
   */
  step9AttemptedNext: boolean;
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
    allDeals: InspectionJob[];   // full cache for calendar
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
  isSubmitting: boolean;
  submissionStatuses: Record<string, string>;

  // Actions
  setStep: (step: number) => void;
  setStep9AttemptedNext: (v: boolean) => void;
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
  releaseUploadedPhotos: (uploadedSlotIds: string[]) => void;
  // Tires
  copyTiresToAxle: (source: 'frontLeft' | 'frontRight' | 'rearLeft' | 'rearRight', target: 'front' | 'rear' | 'all') => void;
  // Signatures
  setSignature: (role: 'signatureAppraiser' | 'signatureClient' | 'signatureYard', base64: string) => void;
  // reset
  reset: () => void;

  // ── Bitrix Sync Actions (Phases 7 & 8) ──
  syncStepWithBitrix: (stepNumber: number) => Promise<void>;
  submitToBitrix: () => Promise<{ success: boolean; message: string }>;
  clearInspection: () => void;
  fetchAllDeals: () => Promise<void>;
  fetchDealsForCalendar: (date: string) => Promise<void>;
  fetchFullDeal: (dealId: string) => Promise<void>;
  setIsSubmitting: (val: boolean) => void;
  setSubmissionStatus: (dealId: string, status: string) => void;
}

// ─── Default Paint Zone ───────────────────────────────────
const emptyZone: PaintZone = { value: '', status: '' };

// ─── Default Wheel ────────────────────────────────────────
const emptyWheel: WheelData = {
  brand: '', model: '', size: '', dot: '', loadIndex: '', speedIndex: '', treadDepth: '', type: '', condition: null,
};

const defaultPhotoSlots: PhotoSlot[] = [
  { id: 'photo_diag_front_left',     label: '1. Przekątna przednia lewa',                  base64: '', required: true },
  { id: 'photo_front',               label: '2. Przód pojazdu',                            base64: '', required: true },
  { id: 'photo_front_under',         label: '3. Podwozie przednie',                        base64: '', required: true },
  { id: 'photo_diag_front_right',    label: '4. Przekątna przednia prawa',                 base64: '', required: true },
  { id: 'photo_right_front',         label: '5. Prawa strona przód',                       base64: '', required: true },
  { id: 'photo_right_rear',          label: '6. Prawa strona tył',                         base64: '', required: true },
  { id: 'photo_diag_rear_right',     label: '7. Przekątna tylna prawa',                    base64: '', required: true },
  { id: 'photo_rear',                label: '8. Tył pojazdu',                              base64: '', required: true },
  { id: 'photo_rear_under',          label: '9. Podwozie tylne',                           base64: '', required: true },
  { id: 'photo_trunk_open',          label: '10. Otwarty bagażnik',                        base64: '', required: true },
  { id: 'photo_spare_tire',          label: '11. Koło zapasowe',                           base64: '', required: true },
  { id: 'photo_diag_rear_left',      label: '12. Przekątna tylna lewa',                    base64: '', required: true },
  { id: 'photo_left_rear',           label: '13. Lewa strona tył',                         base64: '', required: true },
  { id: 'photo_left_front',          label: '14. Lewa strona przód',                       base64: '', required: true },
  { id: 'photo_door_left_front_open',label: '15. Otwarte lewe przednie drzwi',             base64: '', required: true },
  { id: 'photo_left_side_door',      label: '16. Lewe drzwi boczne',                       base64: '', required: true },
  { id: 'photo_dashboard_rear',      label: '17. Deska rozdzielcza z tylnego siedzenia',   base64: '', required: true },
  { id: 'photo_cockpit_center',      label: '18. Centralny kokpit',                        base64: '', required: true },
  { id: 'photo_center_tunnel',       label: '19. Tunel centralny',                         base64: '', required: true },
  { id: 'photo_rear_vent',           label: '20. Tylny nawiew centralny',                  base64: '', required: true },
  { id: 'photo_steering_wheel',      label: '21. Kierownica na wprost',                    base64: '', required: true },
  { id: 'photo_multimedia',          label: '22. Multimedia / kamera parkowania',           base64: '', required: true },
  { id: 'photo_odometer',            label: '23. Licznik z przebiegiem',                   base64: '', required: true },
  { id: 'photo_navigation',          label: '24. Nawigacja',                               base64: '', required: false },
  { id: 'photo_service_display',     label: '25. Serwis (wyświetlacz)',                    base64: '', required: false },
  { id: 'photo_hood_open',           label: '26. Otwarty przód (maska)',                   base64: '', required: true },
  { id: 'photo_vin',                 label: '27. Numer VIN',                               base64: '', required: true },
  { id: 'photo_nameplate',           label: '28. Tabliczka znamionowa',                    base64: '', required: true },
  { id: 'video_engine',              label: '29. Film z pracującym silnikiem (max 6 sek)', base64: '', required: true, isVideo: true },
  { id: 'photo_registration_doc',    label: '30. Dowód rejestracyjny + kluczyki',          base64: '', required: true },
  { id: 'photo_id_card_back',        label: '31. Druga strona dowodu osobistego',          base64: '', required: true },
  { id: 'photo_owner_manual',        label: '32. Instrukcja obsługi',                      base64: '', required: true },
  { id: 'photo_service_book',        label: '33. Książka serwisowa',                       base64: '', required: true },
  { id: 'photo_other_docs',          label: '34. Inne dokumenty',                          base64: '', required: false },
  ...Array.from({ length: 15 }, (_, i) => ({
    id: `photo_optional_${i + 1}`,
    label: `Zdjęcie dodatkowe ${i + 1}`,
    base64: '',
    required: false,
  })),
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
    registrationPlates: null, keys: null, airConditioningWorking: null,
    wheelWrench: null, navigationCardWorking: null,
    tractionBatteryChargingCable: null, tractionBatteryChargingStation: null,
    tractionBatteryChargeIndicator: null, chargingCables: null,
    vinMatchesDocs: null, additionalEquipment: '',
  },
  fullEquipment: {
    // Bezpieczeństwo
    abs: null, esp: null, asr: null, alarm: null,
    airbagDriver: null, airbagPassenger: null,
    airbagSide: null, airbagSideFront: null, airbagSideRear: null,
    airbagCurtain: null, airbagKnee: null,
    tractionControl: null,
    blindSpotAssist: null, laneChangeAssist: null,
    nightVisionAssist: null, vehicleAssist: null,
    activeParkingSystem: null, tirePressureSensor: null,
    rainSensors: null, lightSensors: null, trafficSignRecognition: null,
    // Komfort / fotele / kierownica
    manualAC: null, automaticAC: null, airConditioning: null,
    heatedSeats: null, heatedRearSeats: null,
    ventilatedFrontSeats: null, ventilatedRearSeats: null,
    massageFrontSeats: null, massageRearSeats: null,
    electricFrontSeats: null, adjustableRearSeats: null, sportSeats: null,
    driverSeatMemory: null, passengerSeatMemory: null, thirdRowSeats: null,
    armrestFront: null, armrestRear: null,
    leatherSteeringWheel: null, multifunctionSteeringWheel: null,
    heatedSteeringWheel: null, paddleShifters: null, electricSteeringColumn: null,
    cruiseControl: null, activeCruiseControl: null, powerSteering: null,
    comfortAccess: null, keylessEntry: null, centralLocking: null,
    startStop: null, headUpDisplay: null, virtualCockpit: null,
    onboardComputer: null,
    // Parkowanie i kamery
    parkingSensors: null, parkingSensorsFrontRear: null, parkingSensorsRear: null,
    parkingCamera: null, rearCamera: null, camera360: null,
    // Multimedia
    radio: null, radioUsb: null, radioSd: null, navigation: null,
    dvdPlayerWithMonitor: null, headrestMonitors: null, tvTuner: null,
    bluetooth: null, usb: null, multimediaScreen: null, soundSystem: null,
    // Oświetlenie
    daytimeRunningLights: null, daytimeRunningLightsLed: null,
    ledLights: null, fullLedLights: null, xenonLights: null, laserLights: null,
    fogLights: null, corneringLights: null, bendLighting: null,
    headlightWashers: null,
    // Nadwozie / dach / szyby / lusterka
    sunroof: null, electricOpeningRoof: null, solarOpeningRoof: null,
    panoramicRoof: null, roofRails: null, metallicPaint: null,
    heatedFrontWindshield: null,
    electricWindows: null, electricWindowsFront: null, electricWindowsRear: null,
    sunBlindRear: null, sunBlindSide: null, tintedWindows: null,
    electricMirrors: null, heatedMirrors: null,
    foldingElectricMirrors: null, autoDimmingExtMirrors: null, autoDimmingIntMirror: null,
    electricClosingDoors: null, electricTailgate: null,
    towBar: null, alloyWheels: null, structuralWheels: null,
    alloySpareWheel: null, compactSpareWheel: null,
    // Tapicerka / wykończenie
    leatherUpholstery: null, alcantaraUpholstery: null,
    fabricLeatherUpholstery: null, velourUpholstery: null,
    blackHeadliner: null,
    interiorTrimAluminum: null, interiorTrimWood: null, interiorTrimCarbon: null,
    // Pozostałe / dodatkowe
    fridge: null, foldingTables: null, powerSocket230vTrunk: null,
    airSuspension: null, ceramicBrakes: null,
    lpgSystem: null, webasto: null, tachograph: null, winch: null,
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
      step9AttemptedNext: false,
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
        allDeals: [],
        totalInBitrix: 0,
        currentJobId: null,
        loading: false,
        error: null,
      },
      calendar: {
        selectedDate: (() => { const n = new Date(); return `${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,'0')}-${String(n.getDate()).padStart(2,'0')}`; })(),
        expanded: false,
      },
      drafts: {},
      isSubmitting: false,
      submissionStatuses: {},

      setStep: (step: number) =>
        set((state) => ({
          currentStep: step,
          maxVisitedStep: Math.max(state.maxVisitedStep, step),
          // Reset the "attempted to leave" flag whenever we leave Step 9 so
          // the next time the inspector visits the page they don't see
          // pre-warmed errors.
          step9AttemptedNext: step === 9 ? state.step9AttemptedNext : false,
        })),

      setStep9AttemptedNext: (v: boolean) => set({ step9AttemptedNext: v }),

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
            currentUserId: user.id ? Number(user.id) : null,
            currentUserName: user.name || 'Rzeczoznawca',
          },
        })),


      logout: () => {
        // Clear all possible token storage locations
        try {
          localStorage.removeItem('inspection-storage');
          localStorage.removeItem('token');
          localStorage.removeItem('access_token');
          localStorage.removeItem('auth_token');
          sessionStorage.clear();
        } catch (e) {
          console.warn('Storage clear error during logout:', e);
        }
        set(() => ({
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
            allDeals: [],
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
          isSubmitting: false,
        }));
      },

      fetchMe: async () => {
        const token = useInspectionStore.getState().auth.token;
        if (!token) return;

        try {
          const response = await api.getMe();
          if (response && response.id) {
            set((state) => ({
              auth: {
                ...state.auth,
                isAuthenticated: true,
                currentUserId: Number(response.bitrix_id),
                currentUserName: response.name || 'Mateusz Chłodek'
              }
            }));
          }
        } catch (error: any) {
          // Only clear auth on 401 (token invalid/expired) — NOT on network errors
          const isAuthError = error?.message?.includes('Sesja wygasła') || error?.message?.includes('wygasła');
          if (isAuthError) {
            console.warn("fetchMe: auth token invalid — clearing session");
            set((state) => ({
              auth: {
                ...state.auth,
                isAuthenticated: false,
                token: null,
                user: null,
                currentUserId: null,
                currentUserName: null
              }
            }));
          } else {
            // Network error or server error — keep auth intact, user stays logged in
            console.warn("fetchMe: network/server error (keeping auth):", error?.message);
          }
        }
      },

      fetchFullDeal: async (dealId: string) => {
        set((state) => ({ jobs: { ...state.jobs, loading: true, error: null } }));
        try {
          const deal = await api.getDeal(dealId);
          console.log('[fetchFullDeal] API response keys:', Object.keys(deal));
          console.log('[fetchFullDeal] Full deal data:', JSON.stringify(deal, null, 2));
          set((state) => {
            const initial = JSON.parse(JSON.stringify(initialData));
            // Backend returns snake_case keys from FieldTransformer.transform_from_bitrix()
            // Map them to the store's vehicleData.basicInfo structure
            const newVehicleData = {
              ...initial.vehicleData,
              basicInfo: {
                ...initial.vehicleData.basicInfo,
                companyName: deal.company_name || deal.clientName || deal.title || '',
                userOwner: deal.client_name || deal.clientName || deal.title || '',
                inspectionPlace: deal.inspection_place || deal.planned_address || deal.planned_location || deal.address || '',
                // Try all possible sources in order: store scheduledDate, then deal payload
                inspectionDate: useInspectionStore.getState().jobs.scheduled.find(j => j.id === dealId)?.scheduledDate || useInspectionStore.getState().jobs.unscheduled.find(j => j.id === dealId)?.scheduledDate || deal.inspection_date || deal.scheduled_date || deal.scheduledDate || deal.UF_CRM_1772108256983 || '',
                inspectorName: deal.inspector_name || state.auth.currentUserName || 'Mateusz Chłodek',
              },
              vin: deal.vin || '',
              registrationPlates: deal.registration_number || deal.plates || '',
              make: deal.vehicle_brand || deal.make || '',
              model: deal.vehicle_model || deal.model || '',
              year: (deal.production_year || deal.year || '').toString(),
              color: deal.vehicle_color || '',
              mileage: (deal.mileage || '').toString(),
              engineCapacity: (deal.engine_capacity || '').toString(),
              enginePower: (deal.engine_power || '').toString(),
              fuelType: deal.fuel_type || '',
              bodyType: deal.body_type || '',
              gearboxType: deal.gearbox_type || '',
              driveType: deal.drive_type || '',
              firstRegistration: deal.first_registration_date || deal.first_registration || '',
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
            finalData.vehicleData.basicInfo.inspectorName = state.auth.currentUserName || 'Mateusz Chłodek';
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
          const response = await api.scheduleDeal(dealId, isoDate.split('T')[0], isoDate.split('T')[1] || '09:00');
          if (response.success) {
            const applyUpdate = (j: InspectionJob) =>
              j.id === dealId ? { ...j, scheduledDate: isoDate, status: 'scheduled' as const, hasConflict: !!response.conflict } : j;
            set((state) => ({
              jobs: {
                ...state.jobs,
                allDeals: state.jobs.allDeals.map(applyUpdate),
                scheduled: state.jobs.scheduled.map(applyUpdate),
                unscheduled: state.jobs.unscheduled.map(applyUpdate),
              },
            }));
            // Re-filter so a rescheduled-to-different-day job disappears from today's view
            await useInspectionStore.getState().fetchDealsForCalendar(
              useInspectionStore.getState().calendar.selectedDate
            );
          }
          return response;
        } catch (error: any) {
          console.error("Failed to schedule job:", error);
          return {
            success: false,
            message: error.message || "Błąd połączenia z serwerem",
            conflict: false
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
      // Videos store a blob: URL in the `base64` field (not actual base64).
      // Revoking on overwrite/clear prevents the underlying Blob from being
      // pinned in memory after the slot has moved on.
      setPhotoSlot: (slotId, base64) =>
        set((state) => {
          const prev = state.data.photos.find((p) => p.id === slotId);
          if (prev && prev.base64 && prev.base64.startsWith('blob:') && prev.base64 !== base64) {
            try { URL.revokeObjectURL(prev.base64); } catch { /* ignore */ }
          }
          return {
            data: {
              ...state.data,
              photos: state.data.photos.map((p) =>
                p.id === slotId ? { ...p, base64 } : p
              ),
            },
          };
        }),

      clearPhotoSlot: (slotId) =>
        set((state) => {
          const prev = state.data.photos.find((p) => p.id === slotId);
          if (prev && prev.base64 && prev.base64.startsWith('blob:')) {
            try { URL.revokeObjectURL(prev.base64); } catch { /* ignore */ }
          }
          return {
            data: {
              ...state.data,
              photos: state.data.photos.map((p) =>
                p.id === slotId ? { ...p, base64: '' } : p
              ),
            },
          };
        }),

      // Free base64 preview from RAM for photos that the backend already has.
      // Called by PhotosStep when uploadedSlots set updates. This is critical
      // for iOS memory: 34 × 150KB = 5MB freed from React state.
      releaseUploadedPhotos: (uploadedSlotIds) =>
        set((state) => {
          const idSet = new Set(uploadedSlotIds);
          const changed = state.data.photos.some((p) => p.base64 && idSet.has(p.id));
          if (!changed) return {};  // avoid unnecessary re-render
          return {
            data: {
              ...state.data,
              photos: state.data.photos.map((p) =>
                p.base64 && idSet.has(p.id) ? { ...p, base64: '' } : p
              ),
            },
          };
        }),

      // ── Tire Copy ──
      copyTiresToAxle: (source, target) =>
        set((state) => {
          const src = state.data.tires[source];
          // Copy brand, model, size, type, loadIndex, speedIndex (exclude treadDepth — unique per wheel)
          const { brand, model, size, type, loadIndex, speedIndex } = src;
          const newTires = { ...state.data.tires };

          if (target === 'front' || target === 'all') {
            newTires.frontLeft = { ...newTires.frontLeft, brand, model, size, type, loadIndex, speedIndex };
            newTires.frontRight = { ...newTires.frontRight, brand, model, size, type, loadIndex, speedIndex };
          }
          if (target === 'rear' || target === 'all') {
            newTires.rearLeft = { ...newTires.rearLeft, brand, model, size, type, loadIndex, speedIndex };
            newTires.rearRight = { ...newTires.rearRight, brand, model, size, type, loadIndex, speedIndex };
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

      clearInspection: () => set((state) => ({
        data: initialData,
        currentStep: 1,
        maxVisitedStep: 1,
        jobs: { ...state.jobs, currentJobId: null },
        isSubmitting: false,
      })),

      reset: () => set({
        currentStep: 1,
        maxVisitedStep: 1,
        data: initialData,
        isSubmitting: false,
        jobs: {
          scheduled: [],
          unscheduled: [],
          allDeals: [],
          totalInBitrix: 0,
          currentJobId: null,
          loading: false,
          error: null
        }
      }),

      // ── Bitrix Sync Actions ──

      syncStepWithBitrix: async (stepNumber: number) => {
        const state = useInspectionStore.getState();
        if (state.isSubmitting) {
          console.log('[Bitrix Sync] Skipping — submission in progress');
          return;
        }
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

        // Step 6 (photos) is skipped at the backend level — avoid sending MBs of
        // base64 data over a mobile connection for no benefit.
        if (stepNumber === 6) {
          console.log('[Bitrix Sync] Skipping step 6 (photos) — handled via file upload endpoint');
          return;
        }

        const stepPayload = state.data[fieldName];

        try {
          console.log(`[Bitrix Sync] Syncing step ${stepNumber} for deal ${dealId}`);
          await api.saveStep(dealId, stepNumber, stepPayload);
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

          // Build payload with explicit keys — state.data spread was silently
          // dropping paintMeasurement (undefined → omitted by JSON.stringify).
          const payload: Record<string, any> = {
            vehicleData:            state.data.vehicleData,
            equipmentCompleteness:  state.data.equipmentCompleteness,
            fullEquipment:          state.data.fullEquipment,
            paintMeasurement:       state.data.paintMeasurement ?? initialData.paintMeasurement,
            tires:                  state.data.tires,
            photos:                 state.data.photos,
            exteriorDamage:         state.data.exteriorDamage,
            interiorDamage:         state.data.interiorDamage,
            mechanical:             state.data.mechanical,
            notesValuation:         state.data.notesValuation,
            finalSummary:           state.data.finalSummary,
            deal_id:                dealId,
            job_id:                 dealId,
          };
          console.log('[Bitrix Sync] Submit payload keys:', Object.keys(payload));
          console.log('[Bitrix Sync] paintMeasurement defined:', !!payload.paintMeasurement,
                      'type:', typeof payload.paintMeasurement);

          const result = await api.submitInspection(dealId, payload);

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

      fetchAllDeals: async () => {
        set((s) => ({ jobs: { ...s.jobs, loading: true, error: null } }));
        try {
          const res = await api.getAllDeals();
          const raw = Array.isArray(res) ? res : [...(res.scheduled || []), ...(res.unscheduled || [])];
          const total = Array.isArray(res) ? res.length : (res.total_in_bitrix || raw.length);

          const transformDeal = (d: any): InspectionJob => ({
            id: String(d.ID || d.id || ''),
            clientName: d.TITLE || d.title || 'Brak nazwy',
            vin: d.vin || d.UF_CRM_1766057539531 || '',
            plates: d.registration_number || d.UF_CRM_1766057515315 || '',
            phone: d.contactPhone || d.UF_CRM_1766058247125 || '',
            appointmentTime: d.scheduled_date
              ? (d.scheduled_date.split('T')[1]?.slice(0, 5) || '09:00')
              : '09:00',
            deadline: d.scheduled_date?.split('T')[0] || '',
            status: d.status || 'new',
            stageId: d.stageId || d.STAGE_ID || '',
            make: d.vehicle_brand || d.UF_CRM_1766057839684 || '',
            model: d.vehicle_model || d.UF_CRM_1766057849818 || '',
            city: d.inspectionAddress || d.UF_CRM_1766058185504 || '',
            jobType: 'WYCENA',
            scheduledDate: d.scheduled_date || d.UF_CRM_1772108256983 || '',
            inspectionAddress: d.inspectionAddress || d.UF_CRM_1766058185504 || d.UF_CRM_1766058194337 || '',
            contactPhone: d.contactPhone || d.UF_CRM_1766058247125 || '',
            contactPerson: d.contactPerson || d.UF_CRM_1766058259960 || '',
            notes: d.notes || d.COMMENTS || '',
          });

          const allDeals = raw.map(transformDeal);
          const date = useInspectionStore.getState().calendar.selectedDate;
          const FINISHED = ['completed', 'in_valuation', 'closed', 'lost'];
          const scheduled = allDeals.filter(j => !FINISHED.includes(j.status) && j.scheduledDate?.startsWith(date));
          const unscheduled = allDeals.filter(j => !FINISHED.includes(j.status) && !j.scheduledDate);

          set((s) => ({
            jobs: { ...s.jobs, allDeals, scheduled, unscheduled, totalInBitrix: total, loading: false }
          }));
        } catch (error: any) {
          set((s) => ({ jobs: { ...s.jobs, loading: false, error: error.message } }));
        }
      },

      fetchDealsForCalendar: async (date: string) => {
        const allDeals = useInspectionStore.getState().jobs.allDeals;
        if (allDeals.length === 0) {
          // First load — fetch everything from backend
          await useInspectionStore.getState().fetchAllDeals();
          return;
        }
        // Already have the full set — just re-filter client-side (instant, no network)
        const FINISHED = ['completed', 'in_valuation', 'closed', 'lost'];
        const scheduled = allDeals.filter(j => !FINISHED.includes(j.status) && j.scheduledDate?.startsWith(date));
        const unscheduled = allDeals.filter(j => !FINISHED.includes(j.status) && !j.scheduledDate);
        set((s) => ({ jobs: { ...s.jobs, scheduled, unscheduled } }));
      },

      setIsSubmitting: (val: boolean) => set({ isSubmitting: val }),

      setSubmissionStatus: (dealId: string, status: string) =>
        set((state) => ({
          submissionStatuses: { ...state.submissionStatuses, [dealId]: status },
        })),
    }),
    {
      name: 'inspection-storage',
      // Strip slot-photo base64 from localStorage — slot photos live in the
      // IndexedDB upload queue and are recovered from there, so localStorage
      // only needs the slot structure (id, label, required, isVideo).
      //
      // DO NOT strip damage photos. Earlier ec88736 stripped them by replacing
      // each base64 with '' while keeping array length; iOS Safari unloads
      // tabs aggressively during photo-heavy inspections, and on tab reload
      // Zustand rehydrated empty-string photos into in-memory state. The user
      // then added more photos on top, the array ballooned with mostly-empty
      // slots, and the submit shipped a polluted exteriorDamage/interiorDamage
      // payload — the gallery rendered N broken tiles per damage (deal 1678
      // saw 98). See QA report 2026-04-29 follow-up.
      //
      // Damage photos travel inline in the submit body and are needed in
      // memory at submit time, so they MUST round-trip through localStorage
      // intact. The setItem catch below silently swallows QuotaExceededError
      // for the rare big-inspection case (8+ damages × 4+ photos near the
      // 5 MB iOS cap) — in-memory state stays correct and submit still works.
      partialize: (state) => {
        const stripData = (d: StepData): StepData => ({
          ...d,
          photos: d.photos.map((p) => ({ ...p, base64: '' })),
        });
        return {
          ...state,
          data: stripData(state.data),
          drafts: Object.fromEntries(
            Object.entries(state.drafts).map(([k, v]) => [k, stripData(v as StepData)])
          ),
        };
      },
      storage: createJSONStorage(() => ({
        getItem: (name: string) => {
          try { return localStorage.getItem(name); } catch { return null; }
        },
        setItem: (name: string, value: string) => {
          try {
            localStorage.setItem(name, value);
          } catch (e: any) {
            if (e?.name === 'QuotaExceededError' || e?.name === 'NS_ERROR_DOM_QUOTA_REACHED') {
              console.error('[Storage] localStorage quota exceeded even after partialize — check state size');
            }
          }
        },
        removeItem: (name: string) => {
          try { localStorage.removeItem(name); } catch { /* ignore */ }
        },
      })),
      version: 4,
      migrate: (persistedState: any, version: number) => {
        if (version < 2) {
          const jobs = persistedState.jobs || {};
          const scheduled = jobs.scheduled || [];
          const unscheduled = jobs.unscheduled || jobs.list || [];

          return {
            ...persistedState,
            jobs: {
              ...jobs,
              scheduled,
              unscheduled,
              totalInBitrix: scheduled.length + unscheduled.length,
              loading: false,
              error: null
            }
          };
        }
        if (version < 3) {
          // Reset photos to new 19+15 structure (removes old 42-slot duplicates)
          return {
            ...persistedState,
            data: {
              ...(persistedState.data || {}),
              photos: [...defaultPhotoSlots],
            }
          };
        }
        if (version < 4) {
          // Cleanup: prior `partialize` stripped damage photos to '' while
          // keeping array length; rehydration → in-memory pollution →
          // ballooning empty arrays → broken gallery tiles (deal 1678).
          // Drop empty-string entries so the photos array reflects only
          // photos the user actually has in this session.
          const scrubDamages = (arr: any): any =>
            Array.isArray(arr)
              ? arr.map((d: any) => ({
                  ...d,
                  photos: Array.isArray(d?.photos)
                    ? d.photos.filter((p: any) => typeof p === 'string' && p.length > 0)
                    : [],
                }))
              : [];
          const scrubData = (d: any) => d ? ({
            ...d,
            exteriorDamage: scrubDamages(d.exteriorDamage),
            interiorDamage: scrubDamages(d.interiorDamage),
          }) : d;
          return {
            ...persistedState,
            data: scrubData(persistedState.data),
            drafts: persistedState.drafts
              ? Object.fromEntries(
                  Object.entries(persistedState.drafts).map(([k, v]) => [k, scrubData(v)])
                )
              : {},
          };
        }
        return persistedState;
      },
    }
  )
);
