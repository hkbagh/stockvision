# StockVision — Technical Documentation

> Internals reference for contributors and operators. For end-user instructions see the [README](../README.md).

---

## Table of contents

1. [Architecture overview](#1-architecture-overview)
2. [Repository layout](#2-repository-layout)
3. [Database schema](#3-database-schema)
4. [Data pipeline](#4-data-pipeline)
5. [API layer](#5-api-layer)
6. [Caching strategy](#6-caching-strategy)
7. [Scheduler](#7-scheduler)
8. [ML prediction](#8-ml-prediction)
9. [Frontend](#9-frontend)
10. [Docker & Nginx](#10-docker--nginx)
11. [CI/CD pipeline](#11-cicd-pipeline)
12. [Configuration reference](#12-configuration-reference)
13. [Testing](#13-testing)
14. [Extending the platform](#14-extending-the-platform)
15. [Known limitations](#15-known-limitations)

---

## 1. Architecture overview

```
                    ┌─────────────────────────────────────┐
                    │          Nginx (port 80/443)        │
                    │  /         → frontend static files  │
                    │  /api/*    → backend:8000           │
                    │  /docs     → backend:8000/docs      │
                    └────────────┬────────────────────────┘
                                 │
              ┌──────────────────┼──────────────────────┐
              │                  │                       │
    ┌─────────▼──────────┐  ┌───▼────────┐  ┌──────────▼───────┐
    │   FastAPI backend  │  │   Redis 7  │  │  Static frontend │
    │   (uvicorn)        │◄─┤  (cache)   │  │  (HTML/JS/CSS)   │
    │   port 8000        │  └────────────┘  └──────────────────┘
    └─────────┬──────────┘
              │
    ┌─────────▼──────────┐     ┌──────────────────────┐
    │   SQLite (async)   │     │   APScheduler        │
    │   data/stocks.db   │     │   daily + intraday   │
    └────────────────────┘     └─────────┬────────────┘
                                         │
                               ┌─────────▼────────────┐
                               │   Yahoo Finance API  │
                               │   (via yfinance)     │
                               └──────────────────────┘
```

**Request path for a typical API call:**

1. Browser → Nginx (`/api/data/RELIANCE.NS?days=30`)
2. Nginx strips `/api` prefix, proxies to `backend:8000/data/RELIANCE.NS?days=30`
3. FastAPI router checks Redis / in-memory cache (key `data:RELIANCE.NS:30`)
4. On miss: async SQLite query, joins `stock_prices` + `daily_metrics`
5. Response serialised by Pydantic, written to cache, returned to client

---

## 2. Repository layout

```
backend/
├── app/
│   ├── __init__.py
│   ├── main.py               FastAPI app factory + lifespan
│   ├── config.py             All settings via pydantic-settings
│   ├── database.py           Async SQLAlchemy engine + session factory
│   │
│   ├── models/
│   │   ├── stock.py          Company, StockPrice, DailyMetric ORM classes
│   │   └── prediction.py     PricePrediction ORM class
│   │
│   ├── schemas/
│   │   ├── stock.py          CompanyOut, StockDataPoint, SummaryOut,
│   │   │                     CompareOut, GainerEntry, TopGainersOut, CorrelationOut
│   │   └── prediction.py     PredictionOut, PredictionPoint
│   │
│   ├── routers/
│   │   ├── companies.py      GET /companies
│   │   ├── stock_data.py     GET /data/{symbol}
│   │   ├── summary.py        GET /summary/{symbol}
│   │   ├── compare.py        GET /compare
│   │   ├── gainers.py        GET /top-gainers
│   │   ├── correlation.py    GET /correlation
│   │   └── prediction.py     GET /predict/{symbol}
│   │
│   ├── services/
│   │   ├── data_fetcher.py   yfinance download + async wrapper
│   │   ├── data_processor.py pandas cleaning + metric calculation + DB upsert
│   │   ├── cache.py          Redis → memory TTL fallback + @cached decorator
│   │   └── ml_predictor.py   feature engineering + LinearRegression + forecast
│   │
│   ├── tasks/
│   │   └── scheduler.py      APScheduler job definitions
│   │
│   └── utils/
│       └── logger.py         Structured stdout logger
│
├── tests/
│   ├── conftest.py           Session-scoped async test DB, mock DataFrame factory
│   ├── test_data_processor.py  7 unit tests for cleaning + metrics
│   ├── test_routers.py         8 integration tests via httpx.AsyncClient
│   └── test_ml_predictor.py    4 unit tests for feature engineering + training
│
├── Dockerfile
└── requirements.txt

frontend/
├── index.html                Single-page shell
├── css/style.css             CSS custom properties, dark theme, responsive
└── js/
    ├── api.js                All fetch() calls; exports Api object
    ├── charts.js             Chart.js wrappers (price, compare, prediction, heatmap)
    ├── components.js         DOM builders: company list, movers, cards
    └── app.js                State object + router + event wiring

nginx/
└── nginx.conf                HTTP (local) + HTTPS (prod) server blocks

.github/workflows/
├── ci.yml                    PR: ruff lint → pytest → docker build
└── cd.yml                    push to main: SSH deploy

docker-compose.yml
.env.example
```

---

## 3. Database schema

SQLite file lives at `data/stocks.db` (volume-mounted in Docker).

### `companies`

| Column | Type | Notes |
|--------|------|-------|
| `id` | INTEGER PK | |
| `symbol` | VARCHAR(20) UNIQUE | e.g. `RELIANCE.NS` |
| `name` | VARCHAR(200) | |
| `exchange` | VARCHAR(10) | `NSE` or `BSE` |
| `sector` | VARCHAR(100) | |
| `is_active` | BOOLEAN | Filter for `/companies` |
| `created_at` | DATETIME | server default |

### `stock_prices`

| Column | Type | Notes |
|--------|------|-------|
| `id` | INTEGER PK | |
| `company_id` | INTEGER FK → companies | indexed |
| `date` | DATE | indexed |
| `open / high / low / close` | FLOAT | |
| `volume` | BIGINT | |
| `adj_close` | FLOAT | same as close (yfinance auto-adjusts) |

Unique constraint: `(company_id, date)` — upsert-safe.

### `daily_metrics`

| Column | Type | Formula |
|--------|------|---------|
| `id` | INTEGER PK | |
| `company_id` | INTEGER FK | |
| `date` | DATE | |
| `daily_return` | FLOAT | `(close − open) / open` |
| `ma_7` | FLOAT | `close.rolling(7).mean()` |
| `ma_30` | FLOAT | `close.rolling(30).mean()` |
| `week52_high` | FLOAT | `close.rolling(252).max()` |
| `week52_low` | FLOAT | `close.rolling(252).min()` |
| `volatility` | FLOAT | `daily_return.rolling(30).std() × √252` (annualised) |

Unique constraint: `(company_id, date)`.

### `price_predictions`

| Column | Type | Notes |
|--------|------|-------|
| `id` | INTEGER PK | |
| `company_id` | INTEGER FK | |
| `predicted_date` | DATE | |
| `predicted_close` | FLOAT | |
| `model_version` | VARCHAR(50) | `linreg_v1` |
| `mae` | FLOAT | Cross-validated MAE in INR |
| `confidence` | VARCHAR(10) | `"high"` if MAE < 2% of price, else `"low"` |
| `created_at` | DATETIME | |

---

## 4. Data pipeline

### 4.1 Fetch — `services/data_fetcher.py`

```
fetch_all_symbols(period="1y")
  for each symbol in settings.SYMBOLS:
    _download_symbol(symbol, period)           ← runs in executor (non-blocking)
      yf.Ticker(symbol).history(period, auto_adjust=True)
      retry ×3 with exponential backoff (1s, 2s, 4s)
      normalise column names to lowercase
      strip timezone from DatetimeIndex
    sleep 0.3s between symbols (rate limit courtesy)
```

`fetch_latest(period="5d")` is the same path used for intraday refreshes — only fetches recent rows, then the upsert deduplicates.

### 4.2 Clean — `services/data_processor.clean_dataframe()`

1. Ensure required columns (`open`, `high`, `low`, `close`) exist
2. Drop rows where `close` is NaN or ≤ 0
3. Forward-fill remaining NaN gaps up to 2 consecutive days
4. Remove duplicate index entries (keep last)
5. Sort index ascending

### 4.3 Compute metrics — `services/data_processor.compute_metrics()`

All calculations use `min_periods=1` so early rows don't produce NaN.

```python
daily_return  = (close − open) / open
ma_7          = close.rolling(7,  min_periods=1).mean()
ma_30         = close.rolling(30, min_periods=1).mean()
week52_high   = close.rolling(252, min_periods=1).max()
week52_low    = close.rolling(252, min_periods=1).min()
volatility    = daily_return.rolling(30, min_periods=5).std() * sqrt(252)
```

### 4.4 Upsert — `services/data_processor.upsert_symbol_data()`

For each symbol:

1. `_get_or_create_company()` — SELECT then INSERT if missing, flush to get `id`
2. For each row: SELECT existing record → UPDATE in-place or INSERT new
3. Commit in batches of 500 rows to avoid SQLite lock contention
4. All DB I/O is async (aiosqlite driver)

### 4.5 Seeding on first start

`main.py` startup hook checks `COUNT(*) FROM companies`. If 0, calls `fetch_all_symbols(period="1y")` → `process_all()` before the server accepts requests. Subsequent starts skip this.

---

## 5. API layer

### Router organisation

Each router file is a self-contained `APIRouter` with a single endpoint. Routers are registered in `main.py`:

```python
app.include_router(companies.router,   prefix="/companies",   tags=["Companies"])
app.include_router(stock_data.router,  prefix="/data",        tags=["Stock Data"])
app.include_router(summary.router,     prefix="/summary",     tags=["Summary"])
app.include_router(compare.router,     prefix="/compare",     tags=["Compare"])
app.include_router(gainers.router,     prefix="/top-gainers", tags=["Gainers & Losers"])
app.include_router(correlation.router, prefix="/correlation",  tags=["Correlation"])
app.include_router(prediction.router,  prefix="/predict",     tags=["ML Prediction"])
```

### Cache TTLs

| Endpoint | TTL | Rationale |
|----------|-----|-----------|
| `/companies` | 3600s | Rarely changes |
| `/data/{symbol}` | 300s | Refreshed every 15 min during market hours |
| `/summary/{symbol}` | 300s | Same as above |
| `/compare` | 300s | Derived from price data |
| `/top-gainers` | 120s | Most volatile; stale movers are misleading |
| `/correlation` | 3600s | Expensive to compute; stable over hours |
| `/predict/{symbol}` | 3600s | Model retrained once daily |

### Error responses

| Status | When |
|--------|------|
| 404 | Symbol not in `companies` table |
| 422 | Missing required query param (e.g. `/compare` without `symbol1`) |
| 503 | ML model not yet trained (first-time `/predict` call triggers training) |

### CORS

`allow_origins=["*"]` — intentionally permissive for a public read-only API. Change to `["https://stock.bagh.co.in"]` for a private deployment.

---

## 6. Caching strategy

`services/cache.py` implements a two-level cache:

```
L1: in-memory dict  { key → { "value": ..., "expires": timestamp } }
L2: Redis           key → JSON string (TTL set via SETEX)
```

**Read path:** check L1 first (avoids Redis RTT on hot keys). On miss, check Redis. On double miss, return `None` (caller fetches from DB).

**Write path:** write to both L1 and Redis simultaneously.

**Invalidation:** `invalidate_pattern("data:*")` deletes by prefix from both levels. Called by the intraday scheduler after each refresh.

**Redis absence:** if Redis is unreachable at startup (or `redis.asyncio.from_url` raises), `self._redis` stays `None` and all operations fall through to the in-memory dict. Zero configuration change required.

**`@cached(ttl, key_prefix)` decorator**

```python
@cached(ttl=300, key_prefix="data")
async def get_stock_data(symbol: str, days: int): ...
# cache key → "data:RELIANCE.NS:30"
```

---

## 7. Scheduler

`tasks/scheduler.py` uses `AsyncIOScheduler` from APScheduler 3.x with `timezone="Asia/Kolkata"`.

### Jobs

| Job id | Schedule | Action |
|--------|----------|--------|
| `daily_refresh` | Every day at 07:00 IST | Full 1-year fetch → upsert → ML retrain → cache flush |
| `intraday_refresh` | Mon–Fri 09:00–15:00 IST, every 15 min | Last-5-day fetch → upsert → partial cache invalidation |

The scheduler is started in the FastAPI `lifespan` context manager and shut down (`wait=False`) on application exit.

---

## 8. ML prediction

### Model

`sklearn.linear_model.LinearRegression` — chosen for speed (retrains in <1s per symbol), interpretability, and predictable latency on the `/predict` endpoint.

### Feature engineering

For each trading day `t`, the feature vector is:

| Feature | Description |
|---------|-------------|
| `day_of_year` | Encodes seasonal market patterns |
| `ma_7` | Short-term trend proxy |
| `ma_30` | Medium-term trend proxy |
| `volatility_30d` | Current risk level |
| `volume_z_score` | Volume anomaly (z-score over rolling 30d window) |
| `daily_return(t-1)` | Yesterday's momentum |
| `daily_return(t-2)` | Day-before momentum |

Target: `close(t+1)` (next-day close, shifted by −1).

Rows with any NaN feature are dropped before training.

### Validation

`TimeSeriesSplit(n_splits=5)` ensures no future data leaks into past folds. Mean MAE across folds is stored as `PricePrediction.mae`.

```
fold 1: train [0..49]   val [50..59]
fold 2: train [0..59]   val [60..69]
...
fold 5: train [0..89]   val [90..99]
```

### Confidence flag

```python
confidence = "high" if mae < 0.02 * latest_close else "low"
```

Current Indian large-cap prices move ~1–3% per day, so a model with MAE < 2% of price is considered reliable.

### Persistence

Models are saved to `ml/models/{SYMBOL}_linreg.pkl` via `joblib`. The pickle is volume-mounted in Docker so it survives container restarts and doesn't need to be re-trained on every startup.

### On-demand training

If `/predict/{symbol}` is called and no predictions exist in the DB (e.g. first request for that symbol), `train_and_predict()` runs synchronously within the request. Subsequent calls are served from cache.

### Extension point

To swap in a better model, implement:

```python
class BasePredictor:
    def train(self, X: np.ndarray, y: np.ndarray) -> float: ...  # returns MAE
    def predict(self, X: np.ndarray) -> np.ndarray: ...
```

The `ml_predictor.py` service calls only `_train_model(X, y)` and `model.predict(feat)` — replacing these with an ARIMA, XGBoost, or LSTM wrapper requires no changes to any router or scheduler code.

---

## 9. Frontend

### Architecture

No build toolchain. Four ES module files loaded directly by the browser.

```
index.html  ←  app.js (main controller)
                ├── api.js      (all HTTP calls)
                ├── charts.js   (Chart.js wrappers)
                └── components.js (DOM builders)
```

### State management

Plain object in `app.js`:

```javascript
const State = {
  companies: [],        // fetched once on init
  selectedSymbol: null,
  activeDays: 30,       // 30 | 90 | 365
  activeTab: "price",   // price | compare | prediction | heatmap
  heatmapLoaded: false, // prevents redundant refetch
};
```

No framework, no build step, no `node_modules`.

### `api.js` — base URL detection

```javascript
const API_BASE = window.location.hostname === "localhost"
  ? "http://localhost:8000"
  : `${window.location.protocol}//${window.location.host}/api`;
```

This means the same unmodified JS file works locally (direct uvicorn) and in production (behind Nginx `/api/` proxy) without any environment variable injection.

### Chart types

| Chart | Library feature | File |
|-------|----------------|------|
| Price (close + MA7 + MA30) | `Chart.js` line, dual datasets | `charts.js:renderPriceChart` |
| Compare (dual Y axes) | `Chart.js` line, `yAxisID: "y1"` | `charts.js:renderCompareChart` |
| ML Prediction (history + forecast) | `Chart.js` line with dashed dataset | `charts.js:renderPredictionChart` |
| Correlation heatmap | Raw Canvas 2D API | `charts.js:renderCorrelationHeatmap` |

The heatmap is drawn with the Canvas 2D API directly (no Chart.js) because Chart.js has no built-in matrix/heatmap type. Colour encoding: green = positive correlation, red = negative.

### Responsiveness

CSS custom properties define `--sidebar-width: 240px`. At ≤768px the sidebar narrows to 180px. At ≤560px the layout switches to column (sidebar becomes a horizontal scrollable strip above the main area).

---

## 10. Docker & Nginx

### Services

| Service | Image | Ports | Volumes |
|---------|-------|-------|---------|
| `backend` | `./backend` Dockerfile | `8000` (internal) | `./data`, `./ml/models` |
| `redis` | `redis:7-alpine` | (internal) | `redis_data` named volume |
| `nginx` | `nginx:alpine` | `80`, `443` | `./nginx/nginx.conf` (ro), `./nginx/ssl` (ro), `./frontend` (ro) |

There is no separate `frontend` service — Nginx serves the static files from `./frontend` directly via a bind mount. This avoids a build stage and keeps the container count minimal.

### Backend Dockerfile

```dockerfile
FROM python:3.11-slim
WORKDIR /app
RUN apt-get update && apt-get install -y curl   # for healthcheck
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
RUN mkdir -p data ml/models
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
```

Single worker: SQLite does not support concurrent writes across multiple processes. If migrating to PostgreSQL, increase `--workers`.

### Healthcheck

```yaml
healthcheck:
  test: ["CMD", "curl", "-f", "http://localhost:8000/health"]
  interval: 30s
  timeout: 10s
  retries: 3
  start_period: 60s   # allow time for initial data load
```

### Nginx — local vs production

The HTTP server block in `nginx.conf` serves both roles:

- **Local:** the `return 301` redirect is commented out; traffic hits the frontend on port 80 directly.
- **Production:** uncomment `return 301 https://$host$request_uri;` to enforce HTTPS.

The HTTPS server block is always present but only active when `ssl_certificate` files exist at `nginx/ssl/`.

---

## 11. CI/CD pipeline

### `ci.yml` — triggers on every PR and push to `main`

```
Job: lint
  pip install ruff
  ruff check backend/app/

Job: test
  pip install -r requirements.txt pytest pytest-asyncio httpx
  pytest backend/tests/ -v
  (DATABASE_URL=sqlite+aiosqlite:///./data/test_stocks.db)

Job: docker-build
  cp .env.example .env
  docker compose build
```

All three jobs run in parallel. The `test` job uses a throw-away SQLite DB; no external services needed.

### `cd.yml` — triggers on push to `main` only

```
Job: deploy
  SSH into server (appleboy/ssh-action)
  cd /opt/stock-platform
  git pull origin main
  docker compose pull redis nginx   (update base images)
  docker compose up -d --build --remove-orphans
  docker system prune -f            (clean dangling images)
```

Required repository secrets: `SERVER_HOST`, `SERVER_USER`, `SSH_PRIVATE_KEY`.

The deploy job does not wait for CI to pass by default. Add `needs: [lint, test]` to the deploy job if you want a sequential gate.

---

## 12. Configuration reference

All settings live in `backend/app/config.py` as a `pydantic_settings.BaseSettings` subclass. Values can be overridden via `.env` or environment variables.

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `DATABASE_URL` | str | `sqlite+aiosqlite:///./data/stocks.db` | SQLAlchemy async connection string |
| `REDIS_URL` | str | `redis://redis:6379` | Redis URL; set to empty string to disable |
| `CACHE_TTL_DEFAULT` | int | `300` | Fallback TTL in seconds |
| `ENVIRONMENT` | str | `development` | `development` or `production` |
| `LOG_LEVEL` | str | `INFO` | Passed to Python's `logging` module |
| `SYMBOLS` | List[str] | 19 NSE tickers | Override to track different stocks |
| `SYMBOL_NAMES` | dict | Built-in mapping | Display names for each symbol |
| `SYMBOL_SECTORS` | dict | Built-in mapping | Sector tags for sidebar |

To add a new symbol, append it to `SYMBOLS` and add entries to `SYMBOL_NAMES` and `SYMBOL_SECTORS`. The data pipeline will pick it up on the next scheduled refresh (or immediately after restart if DB is empty).

---

## 13. Testing

### Test database

`conftest.py` creates a session-scoped async SQLite engine at `data/test_stocks.db`. All tables are created fresh at the start of the test session and dropped at teardown. No mocking of the ORM — tests hit a real (in-memory equivalent) SQLite database.

yfinance is **not** called in tests. `make_mock_df()` in `conftest.py` generates deterministic synthetic OHLCV data using `numpy.random.seed(42)`.

### Test categories

**`test_data_processor.py`** — pure unit tests, no DB

- `test_clean_drops_nan_close` — NaN close rows removed
- `test_clean_drops_zero_close` — zero close rows removed
- `test_clean_removes_duplicates` — duplicate index entries deduplicated
- `test_compute_daily_return` — formula `(close − open) / open` verified numerically
- `test_compute_ma7_length` — rolling window produces no unexpected NaN
- `test_compute_volatility_not_nan_after_window` — volatility defined after 30-day window
- `test_week52_high_gte_close` — 52wk high always ≥ current close

**`test_ml_predictor.py`** — unit tests for feature engineering and model training

- `test_build_features_shape` — feature matrix has 7 columns, X and y are aligned
- `test_train_model_returns_mae` — MAE ≥ 0, model has `predict()` method
- `test_model_predict_shape` — `model.predict(X[:5])` returns 5 values
- `test_features_no_nan` — no NaN in X or y after build

**`test_routers.py`** — HTTP integration tests via `httpx.AsyncClient`

- `test_health` — 200, `status == "ok"`
- `test_companies_empty_initially` — 200, empty list (clean test DB)
- `test_data_404_unknown_symbol` — 404 for unknown symbol
- `test_summary_404_unknown_symbol` — 404
- `test_top_gainers_empty` — 200, `gainers` and `losers` keys present
- `test_correlation_empty` — 200, `symbols` and `matrix` keys present
- `test_compare_missing_params` — 422 without required query params
- `test_data_with_seeded_company` — inserts real DB rows, asserts data shape

### Running locally

```bash
cd backend
pytest tests/ -v
# or just one file:
pytest tests/test_data_processor.py -v
```

---

## 14. Extending the platform

### Add a new stock symbol

1. Append the Yahoo Finance ticker (e.g. `HCLTECH.NS`) to `SYMBOLS` in `config.py`
2. Add a `SYMBOL_NAMES` and `SYMBOL_SECTORS` entry
3. Restart the backend — the data load runs on next scheduler tick (or immediately if DB is empty)

### Add a new API endpoint

1. Create `backend/app/routers/myendpoint.py` with an `APIRouter`
2. Add a Pydantic response schema to `schemas/`
3. Register in `main.py`: `app.include_router(myendpoint.router, prefix="/mypath", tags=["MyTag"])`

### Swap SQLite for PostgreSQL

1. Update `DATABASE_URL` to `postgresql+asyncpg://user:pass@host/db`
2. Add `asyncpg` to `requirements.txt`
3. Remove the `os.makedirs("data")` guard in `database.py`
4. Increase `--workers` in the backend `CMD` (PostgreSQL handles concurrent writes)
5. The ORM models and all queries are already database-agnostic (SQLAlchemy 2.0)

### Swap LinearRegression for a better model

Implement the two functions that `ml_predictor.py` calls:

```python
def _train_model(X: np.ndarray, y: np.ndarray) -> Tuple[Any, float]:
    # return (trained_model, mae)

# and ensure the returned model has:
model.predict(feat: np.ndarray) -> np.ndarray
```

No other file needs to change. A drop-in replacement for XGBoost:

```python
from xgboost import XGBRegressor
model = XGBRegressor(n_estimators=200, learning_rate=0.05)
model.fit(X_train, y_train)
mae = mean_absolute_error(y_val, model.predict(X_val))
```

### Add a new chart to the frontend

1. Write a render function in `frontend/js/charts.js` following the existing pattern
2. Add a canvas element and panel `<div>` to `index.html`
3. Add a tab button and wire the `switchPanel` handler in `app.js`

---

## 15. Known limitations

| Limitation | Detail |
|------------|--------|
| **SQLite concurrency** | SQLite allows only one writer at a time. Under load, concurrent API write operations (upsert during refresh + API reads) can cause brief lock waits. Mitigated by batching and a single uvicorn worker. Swap to PostgreSQL for multi-worker production. |
| **yfinance reliability** | Yahoo Finance is an unofficial API with no SLA. Symbols occasionally return 404 (e.g. `TATAMOTORS.NS` was replaced by `TATAMTRDVR.NS`). The fetcher retries 3× with backoff and logs failures; missing symbols produce no crash. |
| **ML accuracy** | LinearRegression is a baseline model. MAE is typically `"low"` confidence (>2% of price) for volatile Indian equities. The prediction is directional guidance only, not a trading signal. |
| **Intraday data** | yfinance `history(period="5d")` returns daily data only. True intraday (1m, 5m) candles would require a paid API (Alpha Vantage, Zerodha Kite). |
| **Market calendar** | The scheduler fires on all weekdays regardless of NSE/BSE holidays. On holidays yfinance returns the last known data; the upsert is a no-op for already-existing dates. |
| **No authentication** | The API is fully public and read-only by design. Add `fastapi-users` or an API key middleware if you need access control. |
