"""
Inspector Model
================
SQLAlchemy model for the inspectors table.
"""

from sqlalchemy import Column, Integer, String, Boolean, DateTime, UniqueConstraint, LargeBinary
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
