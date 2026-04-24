from sqlalchemy import Column, Integer, Float, Date, DateTime, String, ForeignKey, func
from sqlalchemy.orm import relationship
from ..database import Base


class PricePrediction(Base):
    __tablename__ = "price_predictions"

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False, index=True)
    predicted_date = Column(Date, nullable=False)
    predicted_close = Column(Float, nullable=False)
    model_version = Column(String(50), default="linreg_v1")
    mae = Column(Float)
    confidence = Column(String(10), default="high")
    created_at = Column(DateTime, server_default=func.now())

    company = relationship("Company", back_populates="predictions")
