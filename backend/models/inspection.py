"""
Pydantic v2 Models for the 11-Step Inspection Wizard
=====================================================
All fields are Optional to support partial/step saves.
Enum fields use Python Enum classes (not raw strings).
"""

from enum import Enum
from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field


# ─── Enumerations ─────────────────────────────────────────────

class FuelType(str, Enum):
    BENZYNA = "BENZYNA"
    DIESEL = "DIESEL"
    LPG = "LPG"
    HYBRYDA = "HYBRYDA"
    ELEKTRYCZNY = "ELEKTRYCZNY"
    BENZYNA_LPG = "BENZYNA+LPG"
    HYBRYDA_PLUG_IN = "HYBRYDA PLUG-IN"
    WODOR = "WODÓR"
    CNG = "CNG"
    INNY = "INNY"


class BodyType(str, Enum):
    SEDAN = "SEDAN"
    KOMBI = "KOMBI"
    HATCHBACK = "HATCHBACK"
    SUV = "SUV"
    COUPE = "COUPE"
    CABRIO = "CABRIO"
    VAN = "VAN"
    PICKUP = "PICKUP"
    MINIVAN = "MINIVAN"
    INNY = "INNY"


class GearboxType(str, Enum):
    MANUAL = "MANUALNA"
    AUTOMATIC = "AUTOMATYCZNA"
    POLAUTOMATYCZNA = "PÓŁAUTOMATYCZNA"
    CVT = "CVT"
    DSG = "DSG"


class DriveType(str, Enum):
    FWD = "PRZEDNI"
    RWD = "TYLNY"
    AWD = "4X4"
    AWD_FULL = "AWD"


class TireType(str, Enum):
    LETNIE = "LETNIE"
    ZIMOWE = "ZIMOWE"
    CALOSEZONOWE = "CAŁOSEZONOWE"


class TireCondition(str, Enum):
    NOWE = "NOWE"
    DOBRE = "DOBRE"
    ZUZYTE = "ZUŻYTE"
    DO_WYMIANY = "DO WYMIANY"


class DamageType(str, Enum):
    SCRATCHES = "RYSY"
    DENTS = "WGNIECENIA"
    CORROSION = "KOROZJA"
    CRACKS = "PĘKNIĘCIA"
    PAINT_DAMAGE = "USZKODZENIE LAKIERU"
    BROKEN = "ZŁAMANIE"
    MISSING = "BRAK"
    OTHER = "INNE"


class DamageSize(str, Enum):
    SMALL = "MAŁE"
    MEDIUM = "ŚREDNIE"
    LARGE = "DUŻE"


class RepairAction(str, Enum):
    REPAIR = "NAPRAWA"
    REPLACE = "WYMIANA"
    PAINT = "LAKIEROWANIE"
    PDR = "PDR"
    NONE = "BEZ NAPRAWY"


class FluidLevel(str, Enum):
    OK = "OK"
    LOW = "NISKI"
    CRITICAL = "KRYTYCZNY"
    NOT_CHECKED = "NIESPRAWDZONY"


class WarningLightStatus(str, Enum):
    OFF = "WYŁĄCZONA"
    ON = "WŁĄCZONA"
    BLINKING = "MRUGA"


class InteriorCondition(str, Enum):
    EXCELLENT = "BARDZO DOBRY"
    GOOD = "DOBRY"
    FAIR = "DOSTATECZNY"
    POOR = "ZŁY"


# ─── Step 1: Vehicle Identity ────────────────────────────────

class VehicleIdentity(BaseModel):
    """Step 1 — Vehicle identification data."""
    vin: Optional[str] = Field(None, description="Vehicle Identification Number")
    registration_number: Optional[str] = Field(None, description="Registration plates")
    vehicle_brand: Optional[str] = Field(None, description="Make / Marka")
    vehicle_model: Optional[str] = Field(None, description="Model")
    production_year: Optional[str] = Field(None, description="Year of production")
    production_date: Optional[str] = Field(None, description="Production date")
    first_registration_date: Optional[str] = Field(None, description="First registration date")
    vehicle_color: Optional[str] = Field(None, description="Color / Kolor")
    mileage: Optional[str] = Field(None, description="Mileage in km")
    engine_capacity: Optional[str] = Field(None, description="Engine capacity (cc)")
    engine_power: Optional[str] = Field(None, description="Engine power (KM/kW)")
    fuel_type: Optional[FuelType] = Field(None, description="Fuel type")
    body_type: Optional[BodyType] = Field(None, description="Body type")
    gearbox_type: Optional[GearboxType] = Field(None, description="Gearbox type")
    drive_type: Optional[DriveType] = Field(None, description="Drive type")


# ─── Step 2: Client Info ─────────────────────────────────────

class ClientInfo(BaseModel):
    """Step 2 — Client / owner information."""
    company_name: Optional[str] = Field(None, description="Company name")
    client_name: Optional[str] = Field(None, description="Client / owner name")
    client_phone: Optional[str] = Field(None, description="Client phone")
    client_email: Optional[str] = Field(None, description="Client email")


# ─── Step 3: Inspection Schedule ─────────────────────────────

class InspectionSchedule(BaseModel):
    """Step 3 — Inspection schedule and location."""
    inspection_date: Optional[str] = Field(None, description="Inspection date (YYYY-MM-DD)")
    inspection_place: Optional[str] = Field(None, description="Inspection location")
    inspector_name: Optional[str] = Field(None, description="Inspector / appraiser name")
    appraiser_mobile: Optional[str] = Field(None, description="Mobile appraiser ID")


# ─── Step 4: Documents Check ─────────────────────────────────

class DocumentsCheck(BaseModel):
    """Step 4 — Vehicle documents verification."""
    documents_completeness: Optional[Dict[str, Any]] = Field(None, description="Document checklist")
    registration_cert: Optional[bool] = Field(None, description="Registration certificate present")
    insurance_policy: Optional[bool] = Field(None, description="Insurance policy present")
    service_book: Optional[bool] = Field(None, description="Service book present")
    second_key: Optional[bool] = Field(None, description="Second key present")
    vehicle_manual: Optional[bool] = Field(None, description="Vehicle manual present")


# ─── Step 5: Paint Measurements ──────────────────────────────

class PaintMeasurements(BaseModel):
    """Step 5 — Paint thickness measurements for 17 body panels."""
    paint_hood: Optional[float] = Field(None, description="Hood / bonnet (μm)")
    paint_roof: Optional[float] = Field(None, description="Roof (μm)")
    paint_trunk: Optional[float] = Field(None, description="Trunk lid (μm)")
    paint_fender_fl: Optional[float] = Field(None, description="Front left fender (μm)")
    paint_fender_fr: Optional[float] = Field(None, description="Front right fender (μm)")
    paint_fender_rl: Optional[float] = Field(None, description="Rear left fender (μm)")
    paint_fender_rr: Optional[float] = Field(None, description="Rear right fender (μm)")
    paint_door_fl: Optional[float] = Field(None, description="Front left door (μm)")
    paint_door_fr: Optional[float] = Field(None, description="Front right door (μm)")
    paint_door_rl: Optional[float] = Field(None, description="Rear left door (μm)")
    paint_door_rr: Optional[float] = Field(None, description="Rear right door (μm)")
    paint_bumper_front: Optional[float] = Field(None, description="Front bumper (μm)")
    paint_bumper_rear: Optional[float] = Field(None, description="Rear bumper (μm)")
    paint_sill_left: Optional[float] = Field(None, description="Left sill (μm)")
    paint_sill_right: Optional[float] = Field(None, description="Right sill (μm)")
    paint_pillar_a_left: Optional[float] = Field(None, description="Left A-pillar (μm)")
    paint_pillar_a_right: Optional[float] = Field(None, description="Right A-pillar (μm)")
    paint_data_json: Optional[Dict[str, Any]] = Field(None, description="Full paint data as JSON blob")


# ─── Step 6: Mechanical Check ────────────────────────────────

class MechanicalCheck(BaseModel):
    """Step 6 — Mechanical condition: fluids, warning lights, etc."""
    engine_oil_level: Optional[Any] = None
    coolant_level: Optional[Any] = None
    brake_fluid_level: Optional[Any] = None
    power_steering_level: Optional[Any] = None
    warning_lights: Optional[Any] = None
    mechanical_json: Optional[Any] = None
    extra_data: Optional[Dict[str, Any]] = None


# ─── Step 7: Tire Data ───────────────────────────────────────

class SingleTire(BaseModel):
    """Data for a single tire/wheel."""
    brand: Optional[str] = None
    size: Optional[str] = None
    width: Optional[str] = None
    depth: Optional[str] = Field(None, description="Tread depth (mm)")
    tire_type: Optional[TireType] = None
    condition: Optional[TireCondition] = None
    dot: Optional[str] = Field(None, description="DOT production date")
    rim_type: Optional[str] = None
    rim_size: Optional[str] = None
    pressure: Optional[str] = None


class TireData(BaseModel):
    """Step 7 — Tire data for all 4 wheels."""
    front_left: Optional[Any] = None
    front_right: Optional[Any] = None
    rear_left: Optional[Any] = None
    rear_right: Optional[Any] = None
    spare_tire: Optional[Any] = None
    tires_data_json: Optional[Any] = None

    # Individual Bitrix fields (flat mapping for discovery)
    tire_fl_brand: Optional[Any] = None
    tire_fl_size: Optional[Any] = None
    tire_fl_width: Optional[Any] = None
    tire_fl_depth: Optional[Any] = None
    tire_fl_type: Optional[Any] = None
    tire_fr_brand: Optional[Any] = None
    tire_fr_size: Optional[Any] = None
    tire_fr_width: Optional[Any] = None
    tire_fr_depth: Optional[Any] = None
    tire_fr_type: Optional[Any] = None
    tire_rl_brand: Optional[Any] = None
    tire_rl_size: Optional[Any] = None
    tire_rl_width: Optional[Any] = None
    tire_rl_depth: Optional[Any] = None
    tire_rl_type: Optional[Any] = None
    tire_rr_brand: Optional[Any] = None
    tire_rr_size: Optional[Any] = None
    tire_rr_width: Optional[Any] = None
    tire_rr_depth: Optional[Any] = None
    tire_rr_type: Optional[Any] = None
    extra_data: Optional[Dict[str, Any]] = None


# ─── Step 8: Exterior Photos ─────────────────────────────────

class PhotoRef(BaseModel):
    """Reference to an uploaded photo."""
    field_key: Optional[str] = None
    file_id: Optional[str] = None
    url: Optional[str] = None
    label: Optional[str] = None
    base64: Optional[str] = Field(None, exclude=True, description="Base64 content (not persisted)")


class ExteriorPhotos(BaseModel):
    """Step 8 — Exterior photo references."""
    photo_front: Optional[Any] = None
    photo_rear: Optional[Any] = None
    photo_left: Optional[Any] = None
    photo_right: Optional[Any] = None
    photo_interior: Optional[Any] = None
    photo_dashboard: Optional[Any] = None
    photo_odometer: Optional[Any] = None
    photo_vin_plate: Optional[Any] = None
    additional_photos: Optional[Any] = None
    extra_data: Optional[Dict[str, Any]] = None


# ─── Step 9: Interior Assessment ─────────────────────────────

class DamageEntry(BaseModel):
    """Single damage record."""
    part: Optional[str] = Field(None, description="Damaged part name")
    damage_type: Optional[DamageType] = None
    size: Optional[DamageSize] = None
    action: Optional[RepairAction] = None
    description: Optional[str] = None
    photos: Optional[List[str]] = Field(default_factory=list, description="Photo IDs or base64")
    cost_estimate: Optional[float] = None


class InteriorAssessment(BaseModel):
    """Step 9 — Interior condition and damage (groups 1–5)."""
    interior_condition: Optional[Any] = None
    seat_condition: Optional[Any] = None
    dashboard_condition: Optional[Any] = None
    damage_group_1: Optional[Any] = None
    damage_group_2: Optional[Any] = None
    damage_group_3: Optional[Any] = None
    damage_group_4: Optional[Any] = None
    damage_group_5: Optional[Any] = None
    interior_damage_json: Optional[Any] = None
    extra_data: Optional[Dict[str, Any]] = None


# ─── Step 10: Body Damage ────────────────────────────────────

class BodyDamage(BaseModel):
    """Step 10 — Body / exterior damage (groups 1–7)."""
    damage_group_1: Optional[Any] = None
    damage_group_2: Optional[Any] = None
    damage_group_3: Optional[Any] = None
    damage_group_4: Optional[Any] = None
    damage_group_5: Optional[Any] = None
    damage_group_6: Optional[Any] = None
    damage_group_7: Optional[Any] = None
    exterior_damage_json: Optional[Any] = None
    extra_data: Optional[Dict[str, Any]] = None


# ─── Step 11: Summary & Signature ────────────────────────────

class SummaryAndSignature(BaseModel):
    """Step 11 — Final summary, valuation, and signatures."""
    estimated_value: Optional[str] = Field(None, description="Estimated vehicle value")
    general_comments: Optional[str] = Field(None, description="General notes / comments")
    vin_confirmed: Optional[bool] = Field(None, description="VIN physically confirmed")
    signature_appraiser: Optional[str] = Field(None, description="Appraiser signature (base64 or file ID)")
    signature_client: Optional[str] = Field(None, description="Client signature")
    signature_yard: Optional[str] = Field(None, description="Yard / parking signature")
    is_absent_rep: Optional[bool] = Field(None, description="Dysponent nieobecny")
    absent_rep_comment: Optional[str] = Field(None, description="Comment for absence")
    notes_valuation_json: Optional[Dict[str, Any]] = Field(
        None, description="Full notes & valuation JSON blob"
    )
    equipment_completeness: Optional[Dict[str, Any]] = Field(
        None, description="Equipment completeness checklist"
    )
    full_equipment_json: Optional[Dict[str, Any]] = Field(
        None, description="Full equipment data JSON blob"
    )


# ─── Master Payload ──────────────────────────────────────────

class InspectionPayload(BaseModel):
    """
    Master model wrapping all 12 inspection steps.
    All fields are Optional to support partial / step saves.
    """
    # Step 1
    vehicle: Optional[VehicleIdentity] = None
    # Step 2
    client: Optional[ClientInfo] = None
    # Step 3
    schedule: Optional[InspectionSchedule] = None
    # Step 4
    documents: Optional[DocumentsCheck] = None
    # Step 5
    paint: Optional[PaintMeasurements] = None
    # Step 6
    mechanical: Optional[MechanicalCheck] = None
    # Step 7
    tires: Optional[TireData] = None
    # Step 8
    photos: Optional[ExteriorPhotos] = None
    # Step 9
    interior: Optional[InteriorAssessment] = None
    # Step 10
    body_damage: Optional[BodyDamage] = None
    # Step 11
    summary: Optional[SummaryAndSignature] = None

    # Metadata
    deal_id: Optional[str] = Field(None, description="Existing Bitrix deal ID (for updates)")
    job_id: Optional[str] = Field(None, description="PWA job identifier")

    def flatten(self) -> Dict[str, Any]:
        """
        Flatten all step models into a single dict of PWA keys.
        Skips None values. Used by the field transformer.
        """
        flat: Dict[str, Any] = {}

        for step_model in [
            self.vehicle, self.client, self.schedule, self.documents,
            self.paint, self.mechanical, self.tires, self.photos,
            self.interior, self.body_damage, self.summary,
        ]:
            if step_model is None:
                continue
            data = step_model.model_dump(exclude_none=True)
            # Flatten nested models (like SingleTire) to their simple values
            for key, value in data.items():
                if isinstance(value, dict) and key in (
                    "front_left", "front_right", "rear_left", "rear_right"
                ):
                    # These are tire sub-models — skip them, use flat keys
                    continue
                if isinstance(value, dict) and key in (
                    "photo_front", "photo_rear", "photo_left", "photo_right",
                    "photo_interior", "photo_dashboard", "photo_odometer",
                    "photo_vin_plate",
                ):
                    # Photo refs — skip base64, just keep metadata
                    continue
                flat[key] = value

        return flat


# ─── Step-specific partial model ──────────────────────────────

class StepPartialData(BaseModel):
    """
    Partial data for a single wizard step.
    Used by PATCH /inspection/{deal_id}/step/{step_number}.
    """
    step_number: int = Field(..., ge=1, le=12, description="Step number (1-12)")
    data: Dict[str, Any] = Field(..., description="Step fields as key-value pairs")


# ─── Response Models ──────────────────────────────────────────

class SubmitResult(BaseModel):
    """Response from POST /inspection/submit."""
    deal_id: Optional[int] = None
    bitrix_url: Optional[str] = None
    status: str = "success"
    warnings: List[str] = Field(default_factory=list)
    message: Optional[str] = None


class StepSaveResult(BaseModel):
    """Response from PATCH /inspection/{deal_id}/step/{step}."""
    deal_id: int
    step_number: int
    status: str = "saved"
    warnings: List[str] = Field(default_factory=list)


class FileUploadResult(BaseModel):
    """Response from POST /files/upload."""
    field_key: str
    file_id: Optional[str] = None
    url: Optional[str] = None
    success: bool = True
    error: Optional[str] = None


class BatchUploadResult(BaseModel):
    """Response from POST /files/upload-batch."""
    total: int
    successful: int
    failed: int
    results: List[FileUploadResult] = Field(default_factory=list)


class HealthStatus(BaseModel):
    """Response from GET /health."""
    status: str = "ok"
    bitrix_ready: bool = False
    field_count: int = 0
    mapped_count: int = 0
    last_sync: Optional[float] = None
    cache_stale: bool = True


class FieldMappingResponse(BaseModel):
    """Response from GET /health/fields."""
    mapping: Dict[str, str] = Field(default_factory=dict)
    total_bitrix_fields: int = 0
    mapped_count: int = 0
    unmapped_keys: List[str] = Field(default_factory=list)
