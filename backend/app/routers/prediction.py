from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from ..database import get_db
from ..models.stock import Company
from ..models.prediction import PricePrediction
from ..schemas.prediction import PredictionOut
from ..services.cache import cache
from datetime import date

router = APIRouter()


@router.get("/{symbol}", response_model=PredictionOut)
async def get_prediction(symbol: str, db: AsyncSession = Depends(get_db)):
    cache_key = f"prediction:{symbol}"
    cached = await cache.get(cache_key)
    if cached:
        return cached

    result = await db.execute(select(Company).where(Company.symbol == symbol.upper()))
    company = result.scalar_one_or_none()
    if not company:
        raise HTTPException(status_code=404, detail=f"Symbol {symbol} not found")

    preds_q = await db.execute(
        select(PricePrediction)
        .where(PricePrediction.company_id == company.id, PricePrediction.predicted_date >= date.today())
        .order_by(PricePrediction.predicted_date)
    )
    preds = preds_q.scalars().all()

    if not preds:
        from ..services.ml_predictor import train_and_predict
        result_data = await train_and_predict(db, symbol.upper())
        if not result_data:
            raise HTTPException(status_code=503, detail="Prediction model not ready yet")
        preds_q = await db.execute(
            select(PricePrediction)
            .where(PricePrediction.company_id == company.id, PricePrediction.predicted_date >= date.today())
            .order_by(PricePrediction.predicted_date)
        )
        preds = preds_q.scalars().all()

    mae = preds[0].mae if preds else None
    confidence = preds[0].confidence if preds else "low"
    model_version = preds[0].model_version if preds else "linreg_v1"

    data = {
        "symbol": company.symbol,
        "name": company.name,
        "predictions": [{"date": p.predicted_date.isoformat(), "predicted_close": p.predicted_close} for p in preds],
        "mae": mae,
        "model_version": model_version,
        "confidence": confidence,
    }
    await cache.set(cache_key, data, ttl=3600)
    return data
