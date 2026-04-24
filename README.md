# StockVision — NSE/BSE Financial Data Platform

> A production-ready financial data platform for Indian stock markets, built with FastAPI, SQLite, Chart.js, and Docker.

**Live site:** https://stock.bagh.co.in &nbsp;|&nbsp; **API docs:** https://stock.bagh.co.in/docs

---

## What it does

- Fetches 1 year of daily OHLCV data for 19 Nifty50 stocks from Yahoo Finance
- Calculates daily return, 7-day & 30-day moving averages, annualised volatility, 52-week high/low
- Exposes 8 REST endpoints with Redis-backed caching
- Trains a LinearRegression model per symbol and serves 7-day price forecasts
- Serves an interactive dark-theme dashboard — charts, compare mode, correlation heatmap, ML prediction overlay
- Auto-refreshes data daily at 07:00 IST and every 15 min during market hours

---

## Quick start — Docker (recommended)

```bash
git clone <repo> stock-platform && cd stock-platform
cp .env.example .env
docker compose up --build
```

| URL | What |
|-----|------|
| http://localhost | Dashboard |
| http://localhost/docs | Swagger UI |
| http://localhost/redoc | ReDoc |
| http://localhost:8000/health | Health check (backend direct) |

> First run fetches ~249 rows × 19 symbols from Yahoo Finance. Allow 3–5 minutes before data appears.

---

## Quick start — without Docker

```bash
# 1. Install dependencies
cd backend
pip install -r requirements.txt

# 2. Create env file
cp ../.env.example ../.env

# 3. Start backend (auto-seeds DB on first launch)
uvicorn app.main:app --reload --port 8000

# 4. Serve frontend (separate terminal)
cd ../frontend
python -m http.server 3000
```

Open http://localhost:3000 for the dashboard, http://localhost:8000/docs for the API.

---

## API reference

All endpoints return JSON. Base URL: `http://localhost:8000` (local) or `https://stock.bagh.co.in/api` (prod).

### `GET /health`
```json
{ "status": "ok", "version": "1.0.0" }
```

### `GET /companies`
Returns all tracked companies.
```json
[
  { "symbol": "RELIANCE.NS", "name": "Reliance Industries", "exchange": "NSE", "sector": "Energy" },
  ...
]
```

### `GET /data/{symbol}?days=30`
Returns OHLCV + computed metrics. `days` accepts `1–365`, default `30`.
```json
[
  {
    "date": "2026-04-23",
    "open": 1346.0, "high": 1355.5, "low": 1340.7, "close": 1343.4,
    "volume": 16385079,
    "daily_return": -0.00193,
    "ma_7": 1353.5,
    "ma_30": 1368.9
  }
]
```

### `GET /summary/{symbol}`
One-row summary with 52-week stats and tomorrow's ML forecast.
```json
{
  "symbol": "RELIANCE.NS",
  "name": "Reliance Industries",
  "week52_high": 1592.3,
  "week52_low": 1294.8,
  "avg_close": 1434.5,
  "latest_close": 1343.4,
  "latest_daily_return": -0.00193,
  "volatility": 0.237,
  "predicted_close_tomorrow": 1357.4
}
```

### `GET /compare?symbol1=INFY.NS&symbol2=TCS.NS&days=90`
Two price series + Pearson correlation over the shared date range.
```json
{
  "symbol1": "INFY.NS", "name1": "Infosys",
  "symbol2": "TCS.NS",  "name2": "Tata Consultancy Services",
  "series1": [ { "date": "...", "close": 1234.5, ... } ],
  "series2": [ ... ],
  "correlation": 0.9689
}
```

### `GET /top-gainers?limit=10`
Today's top movers sorted by daily return.
```json
{
  "gainers": [ { "symbol": "NESTLEIND.NS", "name": "Nestle India", "daily_return": 0.0156, "close": 2345.6, "volume": 123456 } ],
  "losers":  [ { "symbol": "INFY.NS", "daily_return": -0.0107, ... } ],
  "date": "2026-04-23"
}
```

### `GET /correlation`
Full N×N Pearson correlation matrix over 1 year of close prices.
```json
{
  "symbols": ["ASIANPAINT.NS", "AXISBANK.NS", ...],
  "matrix": [[1.0, 0.72, ...], [0.72, 1.0, ...], ...]
}
```

### `GET /predict/{symbol}`
Next 7 trading days predicted close prices.
```json
{
  "symbol": "RELIANCE.NS",
  "name": "Reliance Industries",
  "predictions": [
    { "date": "2026-04-27", "predicted_close": 1357.44 },
    { "date": "2026-04-28", "predicted_close": 1357.49 }
  ],
  "mae": 39.99,
  "model_version": "linreg_v1",
  "confidence": "low"
}
```
`confidence` is `"high"` when MAE < 2% of current price, otherwise `"low"`.

---

## Tracked symbols

| Symbol | Company | Sector |
|--------|---------|--------|
| RELIANCE.NS | Reliance Industries | Energy |
| TCS.NS | Tata Consultancy Services | Technology |
| INFY.NS | Infosys | Technology |
| HDFCBANK.NS | HDFC Bank | Banking |
| ICICIBANK.NS | ICICI Bank | Banking |
| SBIN.NS | State Bank of India | Banking |
| KOTAKBANK.NS | Kotak Mahindra Bank | Banking |
| AXISBANK.NS | Axis Bank | Banking |
| HINDUNILVR.NS | Hindustan Unilever | FMCG |
| ITC.NS | ITC Limited | FMCG |
| NESTLEIND.NS | Nestle India | FMCG |
| BHARTIARTL.NS | Bharti Airtel | Telecom |
| WIPRO.NS | Wipro | Technology |
| LT.NS | Larsen & Toubro | Infrastructure |
| ASIANPAINT.NS | Asian Paints | Paints |
| MARUTI.NS | Maruti Suzuki | Automobile |
| BAJFINANCE.NS | Bajaj Finance | Finance |
| SUNPHARMA.NS | Sun Pharmaceutical | Pharma |
| ULTRACEMCO.NS | UltraTech Cement | Cement |

---

## Running tests

```bash
cd backend
pip install pytest pytest-asyncio httpx anyio
pytest tests/ -v
```

All 19 tests pass against an in-memory SQLite test database — no network calls needed.

```
tests/test_data_processor.py   7 passed  (metric calculations)
tests/test_ml_predictor.py     4 passed  (feature engineering, training)
tests/test_routers.py          8 passed  (HTTP integration)
```

---

## Environment variables

Copy `.env.example` to `.env` and edit as needed:

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | `sqlite+aiosqlite:///./data/stocks.db` | SQLAlchemy async DB URL |
| `REDIS_URL` | `redis://redis:6379` | Redis connection (optional — falls back to in-memory cache) |
| `ENVIRONMENT` | `development` | `development` or `production` |
| `LOG_LEVEL` | `INFO` | `DEBUG`, `INFO`, `WARNING`, `ERROR` |

---

## Production deployment — stock.bagh.co.in

```bash
# 1. Clone on server
git clone <repo> /opt/stock-platform && cd /opt/stock-platform
cp .env.example .env          # set ENVIRONMENT=production

# 2. TLS via Let's Encrypt
certbot certonly --standalone -d stock.bagh.co.in
cp /etc/letsencrypt/live/stock.bagh.co.in/fullchain.pem nginx/ssl/
cp /etc/letsencrypt/live/stock.bagh.co.in/privkey.pem  nginx/ssl/

# 3. Enable HTTPS redirect in nginx/nginx.conf (uncomment return 301 line)

# 4. Launch
docker compose up -d --build

# 5. Auto-renew TLS (add to crontab)
0 3 * * * certbot renew --quiet && docker compose exec nginx nginx -s reload
```

**GitHub Actions CI/CD** — add these repository secrets for automatic deploy on push to `main`:

| Secret | Value |
|--------|-------|
| `SERVER_HOST` | Server IP or hostname |
| `SERVER_USER` | SSH username |
| `SSH_PRIVATE_KEY` | Private key matching server's `authorized_keys` |

---

## Tech stack

| Layer | Technology |
|-------|------------|
| Language | Python 3.11+ |
| Backend framework | FastAPI 0.111 |
| ORM | SQLAlchemy 2.0 (async) |
| Database | SQLite (aiosqlite) |
| Data source | yfinance |
| Data processing | pandas, numpy |
| ML | scikit-learn (LinearRegression) |
| Caching | Redis 7 with in-memory TTL fallback |
| Scheduler | APScheduler 3.10 |
| Frontend | Vanilla JS ES modules, Chart.js 4.4 |
| Reverse proxy | Nginx (alpine) |
| Containerisation | Docker Compose |
| CI/CD | GitHub Actions |

---

## Project layout

```
.
├── backend/
│   ├── app/
│   │   ├── main.py          # FastAPI app, lifespan, CORS
│   │   ├── config.py        # Settings (pydantic-settings)
│   │   ├── database.py      # Async SQLAlchemy engine
│   │   ├── models/          # ORM: Company, StockPrice, DailyMetric, PricePrediction
│   │   ├── schemas/         # Pydantic response models
│   │   ├── routers/         # One file per endpoint group
│   │   ├── services/        # data_fetcher, data_processor, cache, ml_predictor
│   │   ├── tasks/           # APScheduler jobs
│   │   └── utils/           # Structured logger
│   ├── tests/
│   └── requirements.txt
├── frontend/
│   ├── index.html
│   ├── css/style.css
│   └── js/                  # api.js, charts.js, components.js, app.js
├── nginx/nginx.conf
├── docker-compose.yml
├── .github/workflows/       # ci.yml, cd.yml
└── docs/TECHNICAL.md        # Architecture & internals deep-dive
```
