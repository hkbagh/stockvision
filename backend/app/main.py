import asyncio
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from .database import create_tables, AsyncSessionLocal
from .routers import companies, stock_data, summary, compare, gainers, correlation, prediction, admin
from .tasks.scheduler import setup_scheduler
from .utils.logger import get_logger

logger = get_logger(__name__)


async def _seed_background():
    from sqlalchemy import select, func
    from .models.stock import Company
    from .services import data_fetcher, data_processor

    try:
        async with AsyncSessionLocal() as session:
            count_q = await session.execute(select(func.count()).select_from(Company))
            count = count_q.scalar()
            if count == 0:
                logger.info("No data — starting background initial data load")
                raw = await data_fetcher.fetch_all_symbols(period="1y")
                await data_processor.process_all(session, raw)
                logger.info("Initial data load complete")
            else:
                logger.info(f"Database already has {count} companies, skipping seed")
    except Exception as e:
        logger.error(f"Background seed failed: {e}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    await create_tables()
    # Seed runs in background so the API is immediately available
    asyncio.create_task(_seed_background())
    scheduler = setup_scheduler()
    scheduler.start()
    logger.info("Scheduler started")
    yield
    scheduler.shutdown(wait=False)
    logger.info("Scheduler stopped")


app = FastAPI(
    title="StockVision API",
    description=(
        "Real-time NSE/BSE Indian stock market data with analytics, "
        "comparison, correlation analysis, and ML-based price prediction."
    ),
    version="1.0.0",
    openapi_version="3.0.3",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

app.include_router(companies.router, prefix="/companies", tags=["Companies"])
app.include_router(stock_data.router, prefix="/data", tags=["Stock Data"])
app.include_router(summary.router, prefix="/summary", tags=["Summary"])
app.include_router(compare.router, prefix="/compare", tags=["Compare"])
app.include_router(gainers.router, prefix="/top-gainers", tags=["Gainers & Losers"])
app.include_router(correlation.router, prefix="/correlation", tags=["Correlation"])
app.include_router(prediction.router, prefix="/predict", tags=["ML Prediction"])
app.include_router(admin.router, prefix="/admin", tags=["Admin"])


@app.get("/health", tags=["Health"])
async def health():
    return {"status": "ok", "version": "1.0.0"}
