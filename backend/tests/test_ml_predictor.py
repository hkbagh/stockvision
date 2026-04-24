import pytest
import numpy as np
from app.services.ml_predictor import _build_features, _train_model
from tests.conftest import make_mock_df
from app.services.data_processor import clean_dataframe, compute_metrics


def get_ml_df(n=150):
    raw = make_mock_df(n)
    cleaned = clean_dataframe(raw)
    metrics = compute_metrics(cleaned)
    rows = []
    for ts, row in metrics.iterrows():
        rows.append({
            "date": ts.date() if hasattr(ts, "date") else ts,
            "open": row["open"],
            "close": row["close"],
            "volume": int(row.get("volume", 1_000_000)),
            "daily_return": row["daily_return"],
            "ma_7": row["ma_7"],
            "ma_30": row["ma_30"],
            "volatility": row["volatility"] if row["volatility"] == row["volatility"] else 0.0,
        })
    import pandas as pd
    return pd.DataFrame(rows)


def test_build_features_shape():
    df = get_ml_df(150)
    X, y = _build_features(df)
    assert X.ndim == 2
    assert X.shape[1] == 7
    assert len(X) == len(y)
    assert len(X) > 0


def test_train_model_returns_mae():
    df = get_ml_df(150)
    X, y = _build_features(df)
    model, mae = _train_model(X, y)
    assert mae >= 0
    assert hasattr(model, "predict")


def test_model_predict_shape():
    df = get_ml_df(150)
    X, y = _build_features(df)
    model, _ = _train_model(X, y)
    preds = model.predict(X[:5])
    assert len(preds) == 5


def test_features_no_nan():
    df = get_ml_df(150)
    X, y = _build_features(df)
    assert not np.isnan(X).any()
    assert not np.isnan(y).any()
