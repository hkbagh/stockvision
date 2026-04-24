from pydantic_settings import BaseSettings
from typing import List


class Settings(BaseSettings):
    DATABASE_URL: str = "sqlite+aiosqlite:///./data/stocks.db"
    REDIS_URL: str = "redis://redis:6379"
    CACHE_TTL_DEFAULT: int = 300
    ENVIRONMENT: str = "development"
    ALPHA_VANTAGE_KEY: str = ""
    LOG_LEVEL: str = "INFO"
    SYMBOLS: List[str] = [
        "RELIANCE.NS", "TCS.NS", "INFY.NS", "HDFCBANK.NS",
        "ICICIBANK.NS", "HINDUNILVR.NS", "SBIN.NS", "BHARTIARTL.NS",
        "ITC.NS", "KOTAKBANK.NS", "LT.NS", "WIPRO.NS",
        "AXISBANK.NS", "ASIANPAINT.NS", "MARUTI.NS", "BAJFINANCE.NS",
        "TATAMTRDVR.NS", "SUNPHARMA.NS", "ULTRACEMCO.NS", "NESTLEIND.NS",
    ]
    SYMBOL_NAMES: dict = {
        "RELIANCE.NS": "Reliance Industries",
        "TCS.NS": "Tata Consultancy Services",
        "INFY.NS": "Infosys",
        "HDFCBANK.NS": "HDFC Bank",
        "ICICIBANK.NS": "ICICI Bank",
        "HINDUNILVR.NS": "Hindustan Unilever",
        "SBIN.NS": "State Bank of India",
        "BHARTIARTL.NS": "Bharti Airtel",
        "ITC.NS": "ITC Limited",
        "KOTAKBANK.NS": "Kotak Mahindra Bank",
        "LT.NS": "Larsen & Toubro",
        "WIPRO.NS": "Wipro",
        "AXISBANK.NS": "Axis Bank",
        "ASIANPAINT.NS": "Asian Paints",
        "MARUTI.NS": "Maruti Suzuki",
        "BAJFINANCE.NS": "Bajaj Finance",
        "TATAMTRDVR.NS": "Tata Motors DVR",
        "SUNPHARMA.NS": "Sun Pharmaceutical",
        "ULTRACEMCO.NS": "UltraTech Cement",
        "NESTLEIND.NS": "Nestle India",
    }
    SYMBOL_SECTORS: dict = {
        "RELIANCE.NS": "Energy",
        "TCS.NS": "Technology",
        "INFY.NS": "Technology",
        "HDFCBANK.NS": "Banking",
        "ICICIBANK.NS": "Banking",
        "HINDUNILVR.NS": "FMCG",
        "SBIN.NS": "Banking",
        "BHARTIARTL.NS": "Telecom",
        "ITC.NS": "FMCG",
        "KOTAKBANK.NS": "Banking",
        "LT.NS": "Infrastructure",
        "WIPRO.NS": "Technology",
        "AXISBANK.NS": "Banking",
        "ASIANPAINT.NS": "Paints",
        "MARUTI.NS": "Automobile",
        "BAJFINANCE.NS": "Finance",
        "TATAMTRDVR.NS": "Automobile",
        "SUNPHARMA.NS": "Pharma",
        "ULTRACEMCO.NS": "Cement",
        "NESTLEIND.NS": "FMCG",
    }

    model_config = {"env_file": ".env"}


settings = Settings()
