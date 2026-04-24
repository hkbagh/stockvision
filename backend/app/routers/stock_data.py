from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List
from datetime import date, timedelta
from ..database import get_db
from ..models.stock import Company, StockPrice, DailyMetric
from ..schemas.stock import StockDataPoint
from ..services.cache import cache

router = APIRouter()


@router.get("/{symbol}", response_model=List[StockDataPoint])
async def get_stock_data(
    symbol: str,
    days: int = Query(default=30, ge=1, le=365),
    db: AsyncSession = Depends(get_db),
):
    cache_key = f"data:{symbol}:{days}"
    cached = await cache.get(cache_key)
    if cached:
        return cached

    result = await db.execute(select(Company).where(Company.symbol == symbol.upper()))
    company = result.scalar_one_or_none()
    if not company:
        raise HTTPException(status_code=404, detail=f"Symbol {symbol} not found")

    since = date.today() - timedelta(days=days)

    prices_q = await db.execute(
        select(StockPrice)
        .where(StockPrice.company_id == company.id, StockPrice.date >= since)
        .order_by(StockPrice.date)
    )
    prices = {p.date: p for p in prices_q.scalars().all()}

    metrics_q = await db.execute(
        select(DailyMetric)
        .where(DailyMetric.company_id == company.id, DailyMetric.date >= since)
        .order_by(DailyMetric.date)
    )
    metrics = {m.date: m for m in metrics_q.scalars().all()}

    data = []
    for d, p in sorted(prices.items()):
        m = metrics.get(d)
        data.append({
            "date": d.isoformat(),
            "open": p.open,
            "high": p.high,
            "low": p.low,
            "close": p.close,
            "volume": p.volume,
            "daily_return": m.daily_return if m else None,
            "ma_7": m.ma_7 if m else None,
            "ma_30": m.ma_30 if m else None,
        })

    await cache.set(cache_key, data, ttl=300)
    return data
