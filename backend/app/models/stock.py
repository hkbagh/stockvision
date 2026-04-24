from sqlalchemy import Column, Integer, String, Float, Boolean, Date, DateTime, BigInteger, UniqueConstraint, ForeignKey, func
from sqlalchemy.orm import relationship
from ..database import Base


class Company(Base):
    __tablename__ = "companies"

    id = Column(Integer, primary_key=True, index=True)
    symbol = Column(String(20), unique=True, nullable=False, index=True)
    name = Column(String(200), nullable=False)
    exchange = Column(String(10), default="NSE")
    sector = Column(String(100))
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, server_default=func.now())

    prices = relationship("StockPrice", back_populates="company", cascade="all, delete-orphan")
    metrics = relationship("DailyMetric", back_populates="company", cascade="all, delete-orphan")
    predictions = relationship("PricePrediction", back_populates="company", cascade="all, delete-orphan")


class StockPrice(Base):
    __tablename__ = "stock_prices"

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False, index=True)
    date = Column(Date, nullable=False, index=True)
    open = Column(Float)
    high = Column(Float)
    low = Column(Float)
    close = Column(Float)
    volume = Column(BigInteger)
    adj_close = Column(Float)

    __table_args__ = (UniqueConstraint("company_id", "date", name="uq_price_company_date"),)

    company = relationship("Company", back_populates="prices")


class DailyMetric(Base):
    __tablename__ = "daily_metrics"

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False, index=True)
    date = Column(Date, nullable=False, index=True)
    daily_return = Column(Float)
    ma_7 = Column(Float)
    ma_30 = Column(Float)
    week52_high = Column(Float)
    week52_low = Column(Float)
    volatility = Column(Float)

    __table_args__ = (UniqueConstraint("company_id", "date", name="uq_metric_company_date"),)

    company = relationship("Company", back_populates="metrics")
