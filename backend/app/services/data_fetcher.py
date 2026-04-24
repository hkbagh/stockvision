import asyncio
import time
from datetime import date
from typing import Dict, Optional
import requests
import pandas as pd
from ..config import settings
from ..utils.logger import get_logger

logger = get_logger(__name__)

_AV_BASE = "https://www.alphavantage.co/query"
_av_last_call: float = 0.0


def _av_symbol(symbol: str) -> str:
    return symbol.replace(".NS", ".BSE")


def _fetch_symbol(symbol: str, period: str = "1y") -> Optional[pd.DataFrame]:
    global _av_last_call
    if not settings.ALPHA_VANTAGE_KEY:
        logger.error(f"ALPHA_VANTAGE_KEY not set — cannot fetch {symbol}")
        return None

    # Enforce free-tier 5 req/min (12 s between calls)
    elapsed = time.time() - _av_last_call
    if elapsed < 12:
        time.sleep(12 - elapsed)

    av_sym = _av_symbol(symbol)
    try:
        resp = requests.get(_AV_BASE, params={
            "function": "TIME_SERIES_DAILY",
            "symbol": av_sym,
            "outputsize": "compact",
            "apikey": settings.ALPHA_VANTAGE_KEY,
        }, timeout=30)
        _av_last_call = time.time()
        data = resp.json()
        ts = data.get("Time Series (Daily)")
        if not ts:
            msg = (data.get("Note") or data.get("Information")
                   or data.get("Error Message") or str(data))
            logger.warning(f"Alpha Vantage: no data for {av_sym} — {msg}")
            return None

        rows = []
        for day, vals in ts.items():
            rows.append({
                "date": pd.Timestamp(date.fromisoformat(day)),
                "open":   float(vals["1. open"]),
                "high":   float(vals["2. high"]),
                "low":    float(vals["3. low"]),
                "close":  float(vals["4. close"]),
                "volume": int(vals["5. volume"]),
            })

        if not rows:
            logger.warning(f"Alpha Vantage: {av_sym} returned 0 rows in period")
            return None

        df = pd.DataFrame(rows).sort_values("date").set_index("date")
        df.index.name = "date"
        logger.info(f"Alpha Vantage: {symbol} ({av_sym}) fetched {len(df)} rows")
        return df
    except Exception as e:
        logger.warning(f"Alpha Vantage fetch failed for {symbol}: {e}")
        return None


async def fetch_symbol(symbol: str, period: str = "1y") -> Optional[pd.DataFrame]:
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, _fetch_symbol, symbol, period)


async def fetch_all_symbols(period: str = "1y") -> Dict[str, pd.DataFrame]:
    results: Dict[str, pd.DataFrame] = {}
    for symbol in settings.SYMBOLS:
        df = await fetch_symbol(symbol, period)
        if df is not None and not df.empty:
            results[symbol] = df
            logger.info(f"{symbol}: {len(df)} rows ready")
        else:
            logger.error(f"{symbol}: failed to fetch data")
    logger.info(f"Fetch complete: {len(results)}/{len(settings.SYMBOLS)} symbols")
    return results


async def fetch_latest(period: str = "5d") -> Dict[str, pd.DataFrame]:
    return await fetch_all_symbols(period=period)
