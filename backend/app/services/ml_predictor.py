import os
import math
import asyncio
from datetime import date, timedelta
from typing import List, Tuple, Optional, Dict
import numpy as np
import pandas as pd
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from ..models.stock import Company, StockPrice, DailyMetric
from ..models.prediction import PricePrediction
from ..config import settings
from ..utils.logger import get_logger

logger = get_logger(__name__)

MODEL_DIR = "ml/models"
os.makedirs(MODEL_DIR, exist_ok=True)


def _build_features(df: pd.DataFrame) -> Tuple[np.ndarray, np.ndarray]:
    df = df.copy().sort_values("date")
    df["day_of_year"] = pd.to_datetime(df["date"]).dt.dayofyear
    df["volume_z"] = (df["volume"] - df["volume"].rolling(30, min_periods=1).mean()) / (
        df["volume"].rolling(30, min_periods=1).std() + 1e-9
    )
    df["ret_lag1"] = df["daily_return"].shift(1)
    df["ret_lag2"] = df["daily_return"].shift(2)
    df = df.dropna(subset=["ma_7", "ma_30", "volatility", "ret_lag1", "ret_lag2", "close"])

    feature_cols = ["day_of_year", "ma_7", "ma_30", "volatility", "volume_z", "ret_lag1", "ret_lag2"]
    X = df[feature_cols].values
    y = df["close"].shift(-1).dropna().values
    X = X[: len(y)]
    return X, y


def _train_model(X: np.ndarray, y: np.ndarray):
    from sklearn.linear_model import LinearRegression
    from sklearn.model_selection import TimeSeriesSplit
    from sklearn.metrics import mean_absolute_error

    model = LinearRegression()
    tscv = TimeSeriesSplit(n_splits=5)
    maes = []
    for train_idx, val_idx in tscv.split(X):
        model.fit(X[train_idx], y[train_idx])
        preds = model.predict(X[val_idx])
        maes.append(mean_absolute_error(y[val_idx], preds))

    model.fit(X, y)
    avg_mae = float(np.mean(maes))
    return model, avg_mae


async def train_and_predict(session: AsyncSession, symbol: str) -> Optional[Dict]:
    result = await session.execute(select(Company).where(Company.symbol == symbol))
    company = result.scalar_one_or_none()
    if not company:
        return None

    prices_q = await session.execute(
        select(StockPrice).where(StockPrice.company_id == company.id).order_by(StockPrice.date)
    )
    prices = prices_q.scalars().all()

    metrics_q = await session.execute(
        select(DailyMetric).where(DailyMetric.company_id == company.id).order_by(DailyMetric.date)
    )
    metrics = {m.date: m for m in metrics_q.scalars().all()}

    rows = []
    for p in prices:
        m = metrics.get(p.date)
        rows.append({
            "date": p.date,
            "open": p.open,
            "close": p.close,
            "volume": p.volume or 0,
            "daily_return": m.daily_return if m else 0.0,
            "ma_7": m.ma_7 if m else p.close,
            "ma_30": m.ma_30 if m else p.close,
            "volatility": m.volatility if m else 0.0,
        })

    if len(rows) < 60:
        logger.warning(f"{symbol}: insufficient data for ML ({len(rows)} rows)")
        return None

    df = pd.DataFrame(rows)

    loop = asyncio.get_event_loop()
    try:
        X, y = await loop.run_in_executor(None, _build_features, df)
        if len(X) < 30:
            return None
        model, mae = await loop.run_in_executor(None, _train_model, X, y)
    except Exception as e:
        logger.error(f"{symbol}: training failed: {e}")
        return None

    confidence = "high" if mae < 0.02 * float(df["close"].iloc[-1]) else "low"
    logger.info(f"{symbol}: MAE={mae:.2f}, confidence={confidence}")

    last_row = df.iloc[-1]
    last_close = last_row["close"]
    predictions = []
    current_date = date.today()

    for i in range(1, 8):
        pred_date = current_date + timedelta(days=i)
        if pred_date.weekday() >= 5:
            continue
        feat = np.array([[
            pred_date.timetuple().tm_yday,
            float(last_row["ma_7"]),
            float(last_row["ma_30"]),
            float(last_row["volatility"]),
            0.0,
            float(last_row["daily_return"]),
            0.0,
        ]])
        predicted = float(model.predict(feat)[0])
        predictions.append({"date": pred_date, "predicted_close": predicted})

    from sqlalchemy import delete
    await session.execute(
        delete(PricePrediction).where(PricePrediction.company_id == company.id)
    )
    for p in predictions:
        session.add(PricePrediction(
            company_id=company.id,
            predicted_date=p["date"],
            predicted_close=p["predicted_close"],
            model_version="linreg_v1",
            mae=mae,
            confidence=confidence,
        ))
    await session.commit()

    try:
        import joblib
        joblib.dump(model, os.path.join(MODEL_DIR, f"{symbol.replace('.', '_')}_linreg.pkl"))
    except Exception:
        pass

    return {"symbol": symbol, "mae": mae, "confidence": confidence, "predictions": predictions}


async def retrain_all(session: AsyncSession) -> None:
    for symbol in settings.SYMBOLS:
        try:
            await train_and_predict(session, symbol)
        except Exception as e:
            logger.error(f"{symbol}: retrain failed: {e}")
