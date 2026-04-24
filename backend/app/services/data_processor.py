import math
from typing import Dict, Optional
import pandas as pd
import numpy as np
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from ..models.stock import Company, StockPrice, DailyMetric
from ..config import settings
from ..utils.logger import get_logger

logger = get_logger(__name__)

BATCH_SIZE = 500


def clean_dataframe(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    required = {"open", "high", "low", "close"}
    for col in required:
        if col not in df.columns:
            df[col] = np.nan

    df = df[df["close"].notna()]
    df = df[df["close"] > 0]

    for col in ["open", "high", "low", "volume"]:
        if col in df.columns:
            df[col] = df[col].ffill(limit=2)

    df = df[~df.index.duplicated(keep="last")]
    df = df.sort_index()
    return df


def compute_metrics(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    df["daily_return"] = (df["close"] - df["open"]) / df["open"].replace(0, np.nan)
    df["ma_7"] = df["close"].rolling(window=7, min_periods=1).mean()
    df["ma_30"] = df["close"].rolling(window=30, min_periods=1).mean()
    df["week52_high"] = df["close"].rolling(window=252, min_periods=1).max()
    df["week52_low"] = df["close"].rolling(window=252, min_periods=1).min()
    rolling_std = df["daily_return"].rolling(window=30, min_periods=5).std()
    df["volatility"] = rolling_std * math.sqrt(252)
    return df


def _safe_float(val) -> Optional[float]:
    if val is None:
        return None
    try:
        f = float(val)
        return None if math.isnan(f) or math.isinf(f) else f
    except (TypeError, ValueError):
        return None


async def _get_or_create_company(session: AsyncSession, symbol: str) -> Company:
    result = await session.execute(select(Company).where(Company.symbol == symbol))
    company = result.scalar_one_or_none()
    if company is None:
        company = Company(
            symbol=symbol,
            name=settings.SYMBOL_NAMES.get(symbol, symbol),
            exchange="NSE",
            sector=settings.SYMBOL_SECTORS.get(symbol),
        )
        session.add(company)
        await session.flush()
    return company


async def upsert_symbol_data(session: AsyncSession, symbol: str, df: pd.DataFrame) -> None:
    df = clean_dataframe(df)
    if df.empty:
        logger.warning(f"{symbol}: no data after cleaning")
        return

    df = compute_metrics(df)
    company = await _get_or_create_company(session, symbol)

    price_rows = []
    metric_rows = []

    for ts, row in df.iterrows():
        row_date = ts.date() if hasattr(ts, "date") else ts

        price_rows.append({
            "company_id": company.id,
            "date": row_date,
            "open": _safe_float(row.get("open")),
            "high": _safe_float(row.get("high")),
            "low": _safe_float(row.get("low")),
            "close": _safe_float(row.get("close")),
            "volume": int(row["volume"]) if pd.notna(row.get("volume", None)) else None,
            "adj_close": _safe_float(row.get("close")),
        })
        metric_rows.append({
            "company_id": company.id,
            "date": row_date,
            "daily_return": _safe_float(row.get("daily_return")),
            "ma_7": _safe_float(row.get("ma_7")),
            "ma_30": _safe_float(row.get("ma_30")),
            "week52_high": _safe_float(row.get("week52_high")),
            "week52_low": _safe_float(row.get("week52_low")),
            "volatility": _safe_float(row.get("volatility")),
        })

    for i in range(0, len(price_rows), BATCH_SIZE):
        batch = price_rows[i:i + BATCH_SIZE]
        for item in batch:
            existing = await session.execute(
                select(StockPrice).where(
                    StockPrice.company_id == item["company_id"],
                    StockPrice.date == item["date"]
                )
            )
            record = existing.scalar_one_or_none()
            if record:
                for k, v in item.items():
                    setattr(record, k, v)
            else:
                session.add(StockPrice(**item))
        await session.flush()

    for i in range(0, len(metric_rows), BATCH_SIZE):
        batch = metric_rows[i:i + BATCH_SIZE]
        for item in batch:
            existing = await session.execute(
                select(DailyMetric).where(
                    DailyMetric.company_id == item["company_id"],
                    DailyMetric.date == item["date"]
                )
            )
            record = existing.scalar_one_or_none()
            if record:
                for k, v in item.items():
                    setattr(record, k, v)
            else:
                session.add(DailyMetric(**item))
        await session.flush()

    await session.commit()
    logger.info(f"{symbol}: upserted {len(price_rows)} price rows")


async def process_all(session: AsyncSession, raw_data: Dict[str, pd.DataFrame]) -> None:
    for symbol, df in raw_data.items():
        try:
            await upsert_symbol_data(session, symbol, df)
        except Exception as e:
            logger.error(f"{symbol}: processing failed: {e}")
            await session.rollback()
