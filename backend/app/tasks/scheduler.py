from apscheduler.schedulers.asyncio import AsyncIOScheduler
from ..utils.logger import get_logger

logger = get_logger(__name__)
scheduler = AsyncIOScheduler(timezone="Asia/Kolkata")


def setup_scheduler():
    @scheduler.scheduled_job("cron", hour=7, minute=0, id="daily_refresh")
    async def daily_refresh():
        from ..database import AsyncSessionLocal
        from ..services import data_fetcher, data_processor, ml_predictor
        from ..services.cache import cache
        logger.info("Daily refresh starting")
        async with AsyncSessionLocal() as session:
            raw = await data_fetcher.fetch_all_symbols(period="1y")
            await data_processor.process_all(session, raw)
            await ml_predictor.retrain_all(session)
        await cache.flush_all()
        logger.info("Daily refresh complete")

    @scheduler.scheduled_job(
        "cron", hour="9-15", minute="*/15", day_of_week="mon-fri", id="intraday_refresh"
    )
    async def intraday_refresh():
        from ..database import AsyncSessionLocal
        from ..services import data_fetcher, data_processor
        from ..services.cache import cache
        logger.info("Intraday refresh starting")
        async with AsyncSessionLocal() as session:
            raw = await data_fetcher.fetch_latest(period="5d")
            await data_processor.process_all(session, raw)
        await cache.invalidate_pattern("data:*")
        await cache.invalidate_pattern("gainers:*")
        await cache.invalidate_pattern("summary:*")
        logger.info("Intraday refresh complete")

    return scheduler
