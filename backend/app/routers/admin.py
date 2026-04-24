import asyncio
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from ..database import get_db, AsyncSessionLocal
from ..models.stock import Company
from ..services.cache import cache
from ..utils.logger import get_logger

logger = get_logger(__name__)
router = APIRouter()


async def _do_reseed():
    from ..services import data_fetcher, data_processor, ml_predictor
    try:
        async with AsyncSessionLocal() as session:
            raw = await data_fetcher.fetch_all_symbols(period="1y")
            await data_processor.process_all(session, raw)
            await ml_predictor.retrain_all(session)
            logger.info("Admin reseed + ML retrain complete")
    except Exception as e:
        logger.error(f"Admin reseed failed: {e}")


@router.post("/reseed")
async def reseed(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(func.count()).select_from(Company))
    count = result.scalar()
    await cache.invalidate_pattern("companies:*")
    await cache.invalidate_pattern("gainers:*")
    asyncio.create_task(_do_reseed())
    return {"status": "started", "companies_before": count, "message": "Seeding in background — check /health logs"}


@router.post("/flush-cache")
async def flush_cache():
    await cache.flush_all()
    return {"status": "ok", "message": "All cache cleared"}


@router.get("/status")
async def status(db: AsyncSession = Depends(get_db)):
    from ..models.stock import StockPrice
    companies = (await db.execute(select(func.count()).select_from(Company))).scalar()
    prices = (await db.execute(select(func.count()).select_from(StockPrice))).scalar()
    return {"companies": companies, "price_rows": prices}


@router.get("/test-av")
async def test_av():
    """Fetch raw Alpha Vantage response for TCS.BSE to diagnose data issues."""
    import requests
    from ..config import settings
    if not settings.ALPHA_VANTAGE_KEY:
        return {"error": "ALPHA_VANTAGE_KEY not set"}
    try:
        resp = requests.get(
            "https://www.alphavantage.co/query",
            params={
                "function": "TIME_SERIES_DAILY",
                "symbol": "TCS.BSE",
                "outputsize": "compact",
                "apikey": settings.ALPHA_VANTAGE_KEY,
            },
            timeout=30,
        )
        data = resp.json()
        ts = data.get("Time Series (Daily)", {})
        dates = sorted(ts.keys()) if ts else []
        return {
            "key_set": bool(settings.ALPHA_VANTAGE_KEY),
            "av_keys": list(data.keys()),
            "note": data.get("Note") or data.get("Information") or data.get("Error Message"),
            "row_count": len(dates),
            "oldest_date": dates[0] if dates else None,
            "newest_date": dates[-1] if dates else None,
        }
    except Exception as e:
        return {"error": str(e)}
