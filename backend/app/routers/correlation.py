from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from datetime import date, timedelta
from typing import List, Optional
import pandas as pd
from ..database import get_db
from ..models.stock import Company, StockPrice
from ..schemas.stock import CorrelationOut
from ..services.cache import cache

router = APIRouter()


@router.get("", response_model=CorrelationOut)
async def get_correlation(db: AsyncSession = Depends(get_db)):
    cache_key = "correlation:matrix"
    cached = await cache.get(cache_key)
    if cached:
        return cached

    since = date.today() - timedelta(days=365)

    companies_q = await db.execute(
        select(Company).where(Company.is_active == True).order_by(Company.symbol)
    )
    companies = companies_q.scalars().all()

    symbols = [c.symbol for c in companies]
    company_ids = {c.id: c.symbol for c in companies}

    prices_q = await db.execute(
        select(StockPrice.company_id, StockPrice.date, StockPrice.close)
        .where(StockPrice.company_id.in_(list(company_ids.keys())), StockPrice.date >= since)
        .order_by(StockPrice.date)
    )
    rows = prices_q.all()

    if not rows:
        return {"symbols": symbols, "matrix": []}

    data = {}
    for company_id, d, close in rows:
        sym = company_ids[company_id]
        data.setdefault(sym, {})[d] = close

    df = pd.DataFrame(data).dropna(how="all")
    corr = df.corr()

    present_symbols = [s for s in symbols if s in corr.columns]
    corr = corr.reindex(index=present_symbols, columns=present_symbols)

    matrix: List[List[Optional[float]]] = []
    for sym in present_symbols:
        row = []
        for sym2 in present_symbols:
            val = corr.loc[sym, sym2]
            row.append(round(float(val), 4) if pd.notna(val) else None)
        matrix.append(row)

    result = {"symbols": present_symbols, "matrix": matrix}
    await cache.set(cache_key, result, ttl=3600)
    return result
