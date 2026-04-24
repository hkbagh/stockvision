import asyncio
import time
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
    return await loop.run_in_executor(None, _download_symbol, symbol, period)


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
