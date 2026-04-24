from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List
from ..database import get_db
from ..models.stock import Company
from ..schemas.stock import CompanyOut
from ..services.cache import cache

router = APIRouter()


@router.get("", response_model=List[CompanyOut])
async def get_companies(db: AsyncSession = Depends(get_db)):
    cached = await cache.get("companies:all")
    if cached:
        return cached

    result = await db.execute(
        select(Company).where(Company.is_active.is_(True)).order_by(Company.name)
    )
    companies = result.scalars().all()
    data = [{"symbol": c.symbol, "name": c.name, "exchange": c.exchange, "sector": c.sector} for c in companies]
    await cache.set("companies:all", data, ttl=3600)
    return data
