import pytest
from httpx import AsyncClient


@pytest.mark.anyio
async def test_health(client: AsyncClient):
    r = await client.get("/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


@pytest.mark.anyio
async def test_companies_empty_initially(client: AsyncClient):
    r = await client.get("/companies")
    assert r.status_code == 200
    assert isinstance(r.json(), list)


@pytest.mark.anyio
async def test_data_404_unknown_symbol(client: AsyncClient):
    r = await client.get("/data/UNKNOWN.NS")
    assert r.status_code == 404


@pytest.mark.anyio
async def test_summary_404_unknown_symbol(client: AsyncClient):
    r = await client.get("/summary/UNKNOWN.NS")
    assert r.status_code == 404


@pytest.mark.anyio
async def test_top_gainers_empty(client: AsyncClient):
    r = await client.get("/top-gainers")
    assert r.status_code == 200
    data = r.json()
    assert "gainers" in data
    assert "losers" in data


@pytest.mark.anyio
async def test_correlation_empty(client: AsyncClient):
    r = await client.get("/correlation")
    assert r.status_code == 200
    data = r.json()
    assert "symbols" in data
    assert "matrix" in data


@pytest.mark.anyio
async def test_compare_missing_params(client: AsyncClient):
    r = await client.get("/compare")
    assert r.status_code == 422


@pytest.mark.anyio
async def test_data_with_seeded_company(client: AsyncClient, db_session):
    from app.models.stock import Company, StockPrice, DailyMetric
    from datetime import date, timedelta

    company = Company(symbol="TEST.NS", name="Test Corp", exchange="NSE", sector="Tech")
    db_session.add(company)
    await db_session.flush()

    for i in range(35):
        d = date.today() - timedelta(days=i)
        db_session.add(StockPrice(
            company_id=company.id, date=d,
            open=100.0, high=105.0, low=98.0, close=102.0 + i, volume=1000000,
        ))
        db_session.add(DailyMetric(
            company_id=company.id, date=d,
            daily_return=0.02, ma_7=101.0, ma_30=100.0,
            week52_high=150.0, week52_low=80.0, volatility=0.25,
        ))
    await db_session.commit()

    r = await client.get("/data/TEST.NS?days=30")
    assert r.status_code == 200
    rows = r.json()
    assert len(rows) >= 1
    assert "close" in rows[0]
    assert "daily_return" in rows[0]
