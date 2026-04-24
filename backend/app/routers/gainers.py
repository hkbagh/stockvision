from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from datetime import date
from ..database import get_db
from ..models.stock import Company, StockPrice, DailyMetric
from ..schemas.stock import TopGainersOut
from ..services.cache import cache

router = APIRouter()


@router.get("", response_model=TopGainersOut)
async def get_top_gainers(
    limit: int = Query(default=10, ge=1, le=50),
    db: AsyncSession = Depends(get_db),
):
    cache_key = f"gainers:{limit}"
    cached = await cache.get(cache_key)
    if cached:
        return cached

    latest_metric_q = await db.execute(
        select(DailyMetric.date)
        .order_by(DailyMetric.date.desc())
        .limit(1)
    )
    latest_date = latest_metric_q.scalar_one_or_none()
    if not latest_date:
        return {"gainers": [], "losers": [], "date": None}

    metrics_q = await db.execute(
        select(DailyMetric, Company, StockPrice)
        .join(Company, DailyMetric.company_id == Company.id)
        .join(StockPrice, (StockPrice.company_id == DailyMetric.company_id) & (StockPrice.date == DailyMetric.date))
        .where(DailyMetric.date == latest_date)
        .order_by(DailyMetric.daily_return.desc())
    )
    rows = metrics_q.all()

    entries = [
        {
            "symbol": company.symbol,
            "name": company.name,
            "daily_return": metric.daily_return,
            "close": price.close,
            "volume": price.volume,
        }
        for metric, company, price in rows
        if metric.daily_return is not None
    ]

    sorted_entries = sorted(entries, key=lambda x: x["daily_return"] or 0, reverse=True)
    gainers = sorted_entries[:limit]
    losers = list(reversed(sorted_entries))[:limit]

    data = {"gainers": gainers, "losers": losers, "date": latest_date.isoformat() if latest_date else None}
    await cache.set(cache_key, data, ttl=120)
    return data
