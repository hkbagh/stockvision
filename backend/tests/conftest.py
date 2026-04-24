import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
import pandas as pd
import numpy as np
from datetime import date, timedelta

TEST_DB_URL = "sqlite+aiosqlite:///./data/test_stocks.db"


@pytest.fixture(scope="session")
def anyio_backend():
    return "asyncio"


@pytest_asyncio.fixture(scope="session")
async def db_engine():
    engine = create_async_engine(TEST_DB_URL, echo=False)
    from app.database import Base
    from app import models  # noqa
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield engine
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await engine.dispose()


@pytest_asyncio.fixture
async def db_session(db_engine):
    factory = async_sessionmaker(db_engine, expire_on_commit=False)
    async with factory() as session:
        yield session
        await session.rollback()


@pytest_asyncio.fixture
async def client(db_engine):
    from app.main import app
    from app.database import get_db
    from sqlalchemy.ext.asyncio import AsyncSession

    factory = async_sessionmaker(db_engine, expire_on_commit=False)

    async def override_get_db():
        async with factory() as session:
            yield session

    app.dependency_overrides[get_db] = override_get_db

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        yield ac

    app.dependency_overrides.clear()


def make_mock_df(n_days: int = 100, base_price: float = 1000.0) -> pd.DataFrame:
    dates = pd.date_range(end=date.today(), periods=n_days, freq="B")
    np.random.seed(42)
    closes = base_price + np.cumsum(np.random.randn(n_days) * 10)
    opens = closes * (1 + np.random.randn(n_days) * 0.005)
    highs = np.maximum(opens, closes) * (1 + np.abs(np.random.randn(n_days)) * 0.01)
    lows = np.minimum(opens, closes) * (1 - np.abs(np.random.randn(n_days)) * 0.01)
    volumes = np.random.randint(1_000_000, 5_000_000, n_days)
    df = pd.DataFrame({"open": opens, "high": highs, "low": lows, "close": closes, "volume": volumes}, index=dates)
    df.index.name = "date"
    return df
