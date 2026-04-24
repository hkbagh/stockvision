import math
import numpy as np
import pandas as pd
import pytest
from app.services.data_processor import clean_dataframe, compute_metrics


def test_clean_drops_nan_close(make_df):
    df = make_df(50)
    df.loc[df.index[5], "close"] = float("nan")
    df.loc[df.index[10], "close"] = float("nan")
    cleaned = clean_dataframe(df)
    assert cleaned["close"].isna().sum() == 0
    assert len(cleaned) == 48


def test_clean_drops_zero_close(make_df):
    df = make_df(50)
    df.loc[df.index[3], "close"] = 0
    cleaned = clean_dataframe(df)
    assert (cleaned["close"] == 0).sum() == 0


def test_clean_removes_duplicates(make_df):
    df = make_df(50)
    df = pd.concat([df, df.iloc[:5]])
    cleaned = clean_dataframe(df)
    assert cleaned.index.is_unique


def test_compute_daily_return(make_df):
    df = make_df(50)
    df = clean_dataframe(df)
    result = compute_metrics(df)
    expected = (df["close"] - df["open"]) / df["open"]
    pd.testing.assert_series_equal(result["daily_return"], expected, check_names=False, rtol=1e-5)


def test_compute_ma7_length(make_df):
    df = make_df(50)
    df = clean_dataframe(df)
    result = compute_metrics(df)
    assert not result["ma_7"].isna().all()
    assert len(result) == len(df)


def test_compute_volatility_not_nan_after_window(make_df):
    df = make_df(100)
    df = clean_dataframe(df)
    result = compute_metrics(df)
    assert result["volatility"].iloc[-1] is not None
    assert not math.isnan(float(result["volatility"].iloc[-1]))


def test_week52_high_gte_close(make_df):
    df = make_df(300)
    df = clean_dataframe(df)
    result = compute_metrics(df)
    assert (result["week52_high"] >= result["close"] - 1e-6).all()


@pytest.fixture
def make_df():
    from tests.conftest import make_mock_df
    return make_mock_df
