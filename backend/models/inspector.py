"""
Inspector Model
================
SQLAlchemy model for the inspectors table.
"""

from sqlalchemy import Column, Integer, String, Boolean, DateTime, UniqueConstraint, LargeBinary, Text
from sqlalchemy.sql import func
from database import Base


class Inspector(Base):
    __tablename__ = "inspectors"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    phone = Column(String(20), unique=True, nullable=False, index=True)
    pin_hash = Column(String(255), nullable=False)
    email = Column(String(100), nullable=True)
    is_active = Column(Boolean, default=True)
    bitrix_list_id = Column(String(20), nullable=True)  # Bitrix list item ID for UF_CRM_1773970466449
    created_at = Column(DateTime, server_default=func.now())

    def __repr__(self):
        return f"<Inspector(id={self.id}, name='{self.name}', phone='{self.phone}')>"


class InspectorNotification(Base):
    """Tracks which deals have been notified to which inspector — prevents duplicate emails."""
    __tablename__ = "inspector_notifications"

    id = Column(Integer, primary_key=True)
    deal_id = Column(String(20), nullable=False)
    phone = Column(String(20), nullable=False)
    sent_at = Column(DateTime, server_default=func.now())

    __table_args__ = (
        UniqueConstraint('deal_id', 'phone', name='unique_deal_phone'),
    )

    def __repr__(self):
        return f"<InspectorNotification(deal_id='{self.deal_id}', phone='{self.phone}')>"


class InspectionPDF(Base):
    """Stores the generated PDF for each submitted inspection."""
    __tablename__ = "inspection_pdfs"

    id = Column(Integer, primary_key=True)
    deal_id = Column(Integer, unique=True, nullable=False, index=True)
    pdf_bytes = Column(LargeBinary, nullable=False)
    created_at = Column(DateTime, server_default=func.now())


class InspectionPhoto(Base):
    """Stores uploaded inspection photos by deal and slot ID."""
    __tablename__ = "inspection_photos"

    id = Column(Integer, primary_key=True, index=True)
    deal_id = Column(Integer, nullable=False, index=True)
    slot_id = Column(String(80), nullable=False)   # e.g. "photo_front", "video_engine"
    photo_bytes = Column(LargeBinary, nullable=False)
    created_at = Column(DateTime, server_default=func.now())


class SubmissionJob(Base):
    """Tracks async background submission status for each inspection deal."""
    __tablename__ = "submission_jobs"

    id = Column(Integer, primary_key=True, index=True)
    deal_id = Column(Integer, unique=True, nullable=False, index=True)
    # pending | processing | done | error
    status = Column(String(20), nullable=False, default='pending')
    error_message = Column(Text, nullable=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now())


class InspectionRecord(Base):
    """Stores the full inspection payload at submit time for the report endpoint.

    Most PWA step data (equipment, damages, notes) is NOT mapped to individual
    Bitrix24 fields, so it cannot be read back from Bitrix.  This table is the
    authoritative DB-side source for the web report page.
    """
    __tablename__ = "inspection_records"

    id = Column(Integer, primary_key=True, index=True)
    deal_id = Column(Integer, unique=True, nullable=False, index=True)
    # JSON columns — each stores the corresponding step payload
    equipment_json      = Column(Text, nullable=True)   # equipmentCompleteness
    full_equipment_json = Column(Text, nullable=True)   # fullEquipment
    exterior_damage_json= Column(Text, nullable=True)   # exteriorDamage array
    interior_damage_json= Column(Text, nullable=True)   # interiorDamage array
    notes_json          = Column(Text, nullable=True)   # notesValuation
    vehicle_json        = Column(Text, nullable=True)   # vehicleData
    tires_json          = Column(Text, nullable=True)   # tires
    mechanical_json     = Column(Text, nullable=True)   # mechanical
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now())
