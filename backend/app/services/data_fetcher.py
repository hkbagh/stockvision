import asyncio
import time
from datetime import date, timedelta
from typing import Dict, Optional
import requests
import pandas as pd
import yfinance as yf
from ..config import settings
from ..utils.logger import get_logger

logger = get_logger(__name__)

_SESSION = requests.Session()
_SESSION.headers.update({
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.5",
})


# ── Alpha Vantage fallback ─────────────────────────────────────────────────
_AV_BASE = "https://www.alphavantage.co/query"
_PERIOD_DAYS = {"5d": 5, "1mo": 30, "3mo": 90, "1y": 365, "2y": 730}


def _av_symbol(symbol: str) -> str:
    """Convert NSE symbol (TCS.NS) → Alpha Vantage symbol (TCS.BSE)."""
    return symbol.replace(".NS", ".BSE")


def _fetch_alpha_vantage(symbol: str, period: str = "1y") -> Optional[pd.DataFrame]:
    if not settings.ALPHA_VANTAGE_KEY:
        return None
    av_sym = _av_symbol(symbol)
    try:
        outputsize = "full" if period in ("1y", "2y") else "compact"
        resp = requests.get(_AV_BASE, params={
            "function": "TIME_SERIES_DAILY_ADJUSTED",
            "symbol": av_sym,
            "outputsize": outputsize,
            "apikey": settings.ALPHA_VANTAGE_KEY,
        }, timeout=20)
        data = resp.json()
        ts = data.get("Time Series (Daily)")
        if not ts:
            logger.warning(f"Alpha Vantage: no data for {av_sym} — {data.get('Note') or data.get('Information') or 'unknown'}")
            return None

        rows = []
        cutoff = date.today() - timedelta(days=_PERIOD_DAYS.get(period, 365))
        for day, vals in ts.items():
            d = date.fromisoformat(day)
            if d < cutoff:
                continue
            rows.append({
                "date": pd.Timestamp(d),
                "open":   float(vals["1. open"]),
                "high":   float(vals["2. high"]),
                "low":    float(vals["3. low"]),
                "close":  float(vals["5. adjusted close"]),
                "volume": int(vals["6. volume"]),
            })

        if not rows:
            return None
        df = pd.DataFrame(rows).sort_values("date").set_index("date")
        df.index.name = "date"
        logger.info(f"Alpha Vantage: {symbol} fetched {len(df)} rows")
        return df
    except Exception as e:
        logger.warning(f"Alpha Vantage fetch failed for {symbol}: {e}")
        return None


# ── yfinance primary ───────────────────────────────────────────────────────
def _download_symbol(symbol: str, period: str = "1y") -> Optional[pd.DataFrame]:
    for attempt in range(3):
        try:
            ticker = yf.Ticker(symbol, session=_SESSION)
            df = ticker.history(period=period, auto_adjust=True)
            if df.empty:
                logger.warning(f"{symbol}: empty response on attempt {attempt + 1}")
                time.sleep(2 ** attempt)
                continue
            df.index = pd.to_datetime(df.index).tz_localize(None)
            df.index.name = "date"
            df.columns = [c.lower() for c in df.columns]
            return df
        except Exception as e:
            logger.warning(f"{symbol}: fetch error attempt {attempt + 1}: {e}")
            time.sleep(2 ** attempt)
    return None


async def fetch_symbol(symbol: str, period: str = "1y") -> Optional[pd.DataFrame]:
    loop = asyncio.get_event_loop()
    df = await loop.run_in_executor(None, _download_symbol, symbol, period)
    if df is None or df.empty:
        logger.info(f"{symbol}: yfinance failed, trying Alpha Vantage fallback")
        df = await loop.run_in_executor(None, _fetch_alpha_vantage, symbol, period)
    return df


async def fetch_all_symbols(period: str = "1y") -> Dict[str, pd.DataFrame]:
    results: Dict[str, pd.DataFrame] = {}
    for symbol in settings.SYMBOLS:
        df = await fetch_symbol(symbol, period)
        if df is not None and not df.empty:
            results[symbol] = df
            logger.info(f"{symbol}: fetched {len(df)} rows")
        else:
            logger.error(f"{symbol}: failed to fetch data")
        await asyncio.sleep(0.3)
    logger.info(f"Fetch complete: {len(results)}/{len(settings.SYMBOLS)} symbols")
    return results


async def fetch_latest(period: str = "5d") -> Dict[str, pd.DataFrame]:
    return await fetch_all_symbols(period=period)
