"""
Run this LOCALLY (not on the server) where yfinance can reach Yahoo Finance.
It builds a stocks.db SQLite file you then SCP to the server.

Usage:
  cd "d:/Projects/New folder"
  pip install yfinance pandas sqlalchemy aiosqlite pydantic-settings
  python tools/seed_local.py
  # Then copy data/stocks.db to the server (see instructions printed at the end)
"""
import asyncio, sys, os

# Make backend importable
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))
os.environ.setdefault("DATABASE_URL", "sqlite+aiosqlite:///./data/stocks.db")
os.environ.setdefault("REDIS_URL", "redis://localhost:6379")

os.makedirs(os.path.join(os.path.dirname(__file__), "..", "data"), exist_ok=True)


async def main():
    from app.database import create_tables, AsyncSessionLocal
    from app.services import data_fetcher, data_processor
    from sqlalchemy import select, func
    from app.models.stock import Company

    print("Creating tables...")
    await create_tables()

    async with AsyncSessionLocal() as session:
        count = (await session.execute(select(func.count()).select_from(Company))).scalar()
        if count > 0:
            print(f"DB already has {count} companies. Delete data/stocks.db to reseed.")
            return

    print("Fetching 1-year history for all 20 symbols (may take 2-3 min)...")
    raw = await data_fetcher.fetch_all_symbols(period="1y")

    if not raw:
        print("ERROR: No data fetched. Make sure yfinance can reach Yahoo Finance from this machine.")
        print("Test: python -c \"import yfinance as yf; print(yf.Ticker('TCS.NS').history(period='5d'))\"")
        return

    async with AsyncSessionLocal() as session:
        await data_processor.process_all(session, raw)

    print(f"\nDone! Seeded {len(raw)}/20 symbols.")
    print("\n--- Next steps ---")
    print("1. Stop backend on server:  docker compose stop backend")
    print("2. Upload DB:               scp -i <key.pem> data/stocks.db ec2-user@98.130.72.91:/opt/stock-platform/data/stocks.db")
    print("3. Start backend:           docker compose start backend")
    print("4. Clear Redis:             docker compose exec redis redis-cli FLUSHALL")
    print("------------------")


if __name__ == "__main__":
    asyncio.run(main())
