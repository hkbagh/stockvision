from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from datetime import date, timedelta
from typing import Optional
import pandas as pd
from ..database import get_db
from ..models.stock import Company, StockPrice, DailyMetric
from ..schemas.stock import CompareOut
from ..services.cache import cache

router = APIRouter()


@router.get("", response_model=CompareOut)
async def compare_stocks(
    symbol1: str = Query(...),
    symbol2: str = Query(...),
    days: int = Query(default=90, ge=1, le=365),
    db: AsyncSession = Depends(get_db),
):
    s1, s2 = symbol1.upper(), symbol2.upper()
    cache_key = f"compare:{s1}:{s2}:{days}"
    cached = await cache.get(cache_key)
    if cached:
        return cached

    async def get_company(sym: str) -> Company:
        r = await db.execute(select(Company).where(Company.symbol == sym))
        c = r.scalar_one_or_none()
        if not c:
            raise HTTPException(status_code=404, detail=f"Symbol {sym} not found")
        return c

    c1, c2 = await get_company(s1), await get_company(s2)
    since = date.today() - timedelta(days=days)

    async def fetch_series(company: Company):
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
        series = []
        for d, p in sorted(prices.items()):
            m = metrics.get(d)
            series.append({
                "date": d.isoformat(),
                "open": p.open, "high": p.high, "low": p.low, "close": p.close,
                "volume": p.volume,
                "daily_return": m.daily_return if m else None,
                "ma_7": m.ma_7 if m else None,
                "ma_30": m.ma_30 if m else None,
            })
        return series

    series1, series2 = await fetch_series(c1), await fetch_series(c2)

    correlation: Optional[float] = None
    try:
        closes1 = {row["date"]: row["close"] for row in series1 if row["close"]}
        closes2 = {row["date"]: row["close"] for row in series2 if row["close"]}
        common = sorted(set(closes1) & set(closes2))
        if len(common) >= 10:
            s = pd.Series([closes1[d] for d in common])
            t = pd.Series([closes2[d] for d in common])
            correlation = round(float(s.corr(t)), 4)
    except Exception:
        pass

    data = {
        "symbol1": c1.symbol, "symbol2": c2.symbol,
        "name1": c1.name, "name2": c2.name,
        "series1": series1, "series2": series2,
        "correlation": correlation,
    }
    await cache.set(cache_key, data, ttl=300)
    return data
