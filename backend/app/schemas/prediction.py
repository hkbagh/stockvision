from pydantic import BaseModel, ConfigDict
from datetime import date
from typing import List, Optional


class PredictionPoint(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    date: date
    predicted_close: float


class PredictionOut(BaseModel):
    symbol: str
    name: str
    predictions: List[PredictionPoint]
    mae: Optional[float]
    model_version: str
    confidence: str
