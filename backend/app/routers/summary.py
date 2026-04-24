from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from ..database import get_db
from ..models.stock import Company, StockPrice, DailyMetric
from ..models.prediction import PricePrediction
from ..schemas.stock import SummaryOut
from ..services.cache import cache
from datetime import date

router = APIRouter()


@router.get("/{symbol}", response_model=SummaryOut)
async def get_summary(symbol: str, db: AsyncSession = Depends(get_db)):
    cache_key = f"summary:{symbol}"
    cached = await cache.get(cache_key)
    if cached:
        return cached

    result = await db.execute(select(Company).where(Company.symbol == symbol.upper()))
    company = result.scalar_one_or_none()
    if not company:
        raise HTTPException(status_code=404, detail=f"Symbol {symbol} not found")

    latest_price_q = await db.execute(
        select(StockPrice)
        .where(StockPrice.company_id == company.id)
        .order_by(StockPrice.date.desc())
        .limit(1)
    )
    latest_price = latest_price_q.scalar_one_or_none()

    latest_metric_q = await db.execute(
        select(DailyMetric)
        .where(DailyMetric.company_id == company.id)
        .order_by(DailyMetric.date.desc())
        .limit(1)
    )
    latest_metric = latest_metric_q.scalar_one_or_none()

    avg_close_q = await db.execute(
        select(func.avg(StockPrice.close)).where(StockPrice.company_id == company.id)
    )
    avg_close = avg_close_q.scalar()

    pred_q = await db.execute(
        select(PricePrediction)
        .where(PricePrediction.company_id == company.id, PricePrediction.predicted_date > date.today())
        .order_by(PricePrediction.predicted_date)
        .limit(1)
    )
    pred = pred_q.scalar_one_or_none()

    data = {
        "symbol": company.symbol,
        "name": company.name,
        "week52_high": latest_metric.week52_high if latest_metric else None,
        "week52_low": latest_metric.week52_low if latest_metric else None,
        "avg_close": float(avg_close) if avg_close else None,
        "latest_close": latest_price.close if latest_price else None,
        "latest_daily_return": latest_metric.daily_return if latest_metric else None,
        "volatility": latest_metric.volatility if latest_metric else None,
        "predicted_close_tomorrow": pred.predicted_close if pred else None,
    }
    await cache.set(cache_key, data, ttl=300)
    return data
