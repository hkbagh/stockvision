from pydantic import BaseModel, ConfigDict
from datetime import date
from typing import Optional, List


class CompanyOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    symbol: str
    name: str
    exchange: str
    sector: Optional[str]


class StockDataPoint(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    date: date
    open: Optional[float]
    high: Optional[float]
    low: Optional[float]
    close: Optional[float]
    volume: Optional[int]
    daily_return: Optional[float]
    ma_7: Optional[float]
    ma_30: Optional[float]


class SummaryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    symbol: str
    name: str
    week52_high: Optional[float]
    week52_low: Optional[float]
    avg_close: Optional[float]
    latest_close: Optional[float]
    latest_daily_return: Optional[float]
    volatility: Optional[float]
    predicted_close_tomorrow: Optional[float]


class CompareOut(BaseModel):
    symbol1: str
    symbol2: str
    name1: str
    name2: str
    series1: List[StockDataPoint]
    series2: List[StockDataPoint]
    correlation: Optional[float]


class GainerEntry(BaseModel):
    symbol: str
    name: str
    daily_return: Optional[float]
    close: Optional[float]
    volume: Optional[int]


class TopGainersOut(BaseModel):
    gainers: List[GainerEntry]
    losers: List[GainerEntry]
    date: Optional[date]


class CorrelationOut(BaseModel):
    symbols: List[str]
    matrix: List[List[Optional[float]]]
