# StockVision — NSE/BSE Financial Data Platform

> Internship project built at **[Jarnox](https://jarnox.in)** · [GitHub](https://github.com/hkbagh/stockvision) · [Live](https://stock.bagh.co.in)

A full-stack financial data platform for Indian equity markets. It pulls daily OHLCV data from Alpha Vantage, computes technical metrics, trains an ML price-prediction model per symbol, and serves everything through a REST API and an interactive candlestick dashboard.

---

## Live URLs

| URL | Description |
|-----|-------------|
| https://stock.bagh.co.in | Interactive dashboard |
| https://stock.bagh.co.in/api/docs | Swagger UI (API explorer) |
| https://stock.bagh.co.in/api/redoc | ReDoc |
| https://stock.bagh.co.in/api/health | Health check |

---

## Features

- **20 Nifty 50 stocks** tracked: RELIANCE, TCS, INFY, HDFCBANK, ICICIBANK, SBIN, KOTAKBANK, AXISBANK, HINDUNILVR, ITC, NESTLEIND, BHARTIARTL, WIPRO, LT, ASIANPAINT, MARUTI, BAJFINANCE, SUNPHARMA, ULTRACEMCO, TATAMOTORS
- **Candlestick price chart** with high/low wicks, MA-7, MA-30 overlays, and volume bars
- **Range buttons** — 1W / 1M / 3M / 1Y views
- **OHLCV bar** + 52-week range widget + KPI cards (52W High/Low, Avg Close, Volatility, AI Forecast)
- **Compare mode** — dual-line chart with Pearson correlation badge
- **AI Forecast tab** — next 7 trading days via LinearRegression (per symbol)
- **Correlation heatmap** — 20×20 matrix across all symbols
- **Top Gainers / Losers** sidebar
- **Auto-refresh** — daily at 07:00 IST + market-close capture at 16:00 IST (Mon–Fri)
- **Redis cache** with in-memory TTL fallback (no Redis required for dev)

---

## Tech stack

| Layer | Technology |
|-------|------------|
| Backend | Python 3.11, FastAPI 0.111, Uvicorn |
| ORM | SQLAlchemy 2.0 (async) + aiosqlite |
| Database | SQLite (persistent volume) |
| Data source | Alpha Vantage TIME_SERIES_DAILY API |
| Data processing | pandas, numpy |
| ML | scikit-learn LinearRegression, joblib |
| Caching | Redis 7 + in-memory TTL fallback |
| Scheduler | APScheduler 3.10 (AsyncIO) |
| Frontend | Vanilla JS ES modules, Chart.js 4.4, chartjs-adapter-date-fns |
| Reverse proxy | Nginx (Alpine) — TLS termination + API proxy |
| Containerisation | Docker Compose (backend · frontend · redis · nginx) |
| CI/CD | GitHub Actions — lint + test on PR, auto-deploy on push to `main` |

---

## Architecture

```
                     HTTPS (443)
Browser ──────────► Nginx ──────► /          → Frontend (static HTML/JS/CSS)
                               ├── /api/     → FastAPI backend (port 8000)
                               ├── /docs     → Swagger UI
                               └── /redoc    → ReDoc

FastAPI backend:
  startup  → _seed_background() — fetch & store data if DB is sparse
  daily    → APScheduler 07:00 IST — full refresh + ML retrain
  16:00    → APScheduler Mon–Fri — market-close incremental refresh

Data pipeline:
  Alpha Vantage API → data_fetcher.py → data_processor.py → SQLite
                                                          → ml_predictor.py → PricePrediction table
```

---

## Local development

### Prerequisites
- Docker Desktop (recommended) **or** Python 3.11 + pip
- Alpha Vantage free API key → https://www.alphavantage.co/support/#api-key

### With Docker (recommended)

```bash
git clone https://github.com/hkbagh/stockvision.git
cd stockvision

cp .env.example .env
# Edit .env — set ALPHA_VANTAGE_KEY=your_key_here

docker compose up --build
```

| URL | What |
|-----|------|
| http://localhost | Dashboard |
| http://localhost/docs | Swagger UI |
| http://localhost/redoc | ReDoc |
| http://localhost:8000/health | Backend health check |

On first launch the backend automatically seeds the database (~4 min for 20 symbols at Alpha Vantage free-tier rate of 5 req/min).

### Without Docker

```bash
# Backend
cd backend
pip install -r requirements.txt
cp ../.env.example ../.env   # set ALPHA_VANTAGE_KEY
uvicorn app.main:app --reload --port 8000

# Frontend (separate terminal)
cd frontend
python -m http.server 3000
```

Dashboard: http://localhost:3000 · API: http://localhost:8000/docs

---

## Environment variables

| Variable | Default | Required | Description |
|----------|---------|----------|-------------|
| `ALPHA_VANTAGE_KEY` | — | **Yes** | Free tier key (25 req/day, 5 req/min) |
| `DATABASE_URL` | `sqlite+aiosqlite:///./data/stocks.db` | No | SQLAlchemy async DB URL |
| `REDIS_URL` | `redis://redis:6379` | No | Redis (falls back to in-memory cache if absent) |
| `ENVIRONMENT` | `development` | No | `development` or `production` |
| `LOG_LEVEL` | `INFO` | No | `DEBUG` / `INFO` / `WARNING` / `ERROR` |

---

## API reference

Base URL: `http://localhost:8000` (local) or `https://stock.bagh.co.in/api` (production).

| Method | Endpoint | Cache TTL | Description |
|--------|----------|-----------|-------------|
| GET | `/health` | — | Liveness probe |
| GET | `/companies` | 1 h | List of all 20 tracked companies |
| GET | `/data/{symbol}?days=30` | 5 min | OHLCV + metrics for last N days (1–365) |
| GET | `/summary/{symbol}` | 5 min | 52W hi/lo, volatility, latest close, ML forecast |
| GET | `/compare?symbol1=&symbol2=&days=90` | 5 min | Dual price series + Pearson correlation |
| GET | `/top-gainers?limit=10` | 2 min | Top gainers and losers by daily return |
| GET | `/correlation` | 1 h | Full N×N correlation matrix |
| GET | `/predict/{symbol}` | 1 h | Next 7 trading days predicted close + MAE |
| POST | `/admin/reseed` | — | Trigger full data fetch + ML retrain |
| GET | `/admin/status` | — | Row counts (companies, price rows) |

---

## Deployment — stock.bagh.co.in

The project uses **GitHub Actions** for zero-touch CI/CD.

### How it works

```
Developer pushes to main
  │
  ├── CI job (ci.yml)
  │     ruff lint → pytest → docker build check
  │
  └── CD job (cd.yml)  [runs after CI passes]
        SSH into server → git pull → docker compose up -d --build
        → backend restarts → auto-reseed if DB is sparse
```

### Server setup (one-time)

```bash
# On the server (Ubuntu / Debian)
git clone https://github.com/hkbagh/stockvision.git /opt/stockvision
cd /opt/stockvision

cp .env.example .env
# Edit .env — set ALPHA_VANTAGE_KEY and ENVIRONMENT=production

# TLS certificate (Let's Encrypt)
certbot certonly --standalone -d stock.bagh.co.in
cp /etc/letsencrypt/live/stock.bagh.co.in/fullchain.pem nginx/ssl/
cp /etc/letsencrypt/live/stock.bagh.co.in/privkey.pem  nginx/ssl/

# Launch
docker compose up -d --build

# Auto-renew TLS (add to crontab)
0 3 * * * certbot renew --quiet && docker compose exec nginx nginx -s reload
```

### GitHub Actions secrets required

| Secret | Value |
|--------|-------|
| `SERVER_HOST` | Server IP or hostname |
| `SERVER_USER` | SSH username (e.g. `ubuntu`) |
| `SSH_PRIVATE_KEY` | Private key matching the server's `~/.ssh/authorized_keys` |

### Manual reseed after deploy

The backend auto-reseeds on startup if it detects fewer than 1500 price rows. To force an immediate reseed:

```bash
curl -X POST https://stock.bagh.co.in/api/admin/reseed

# Verify after ~4 minutes (20 symbols × 12 s AV rate limit)
curl https://stock.bagh.co.in/api/admin/status
# → { "companies": 20, "price_rows": ~2000 }
```

---

## Running tests

```bash
cd backend
pip install pytest pytest-asyncio httpx anyio
pytest tests/ -v
```

Tests run against an in-memory SQLite database — no network calls, no API key needed.

---

## Project layout

```
stockvision/
├── backend/
│   ├── app/
│   │   ├── main.py           # FastAPI app, lifespan, CORS, auto-seed
│   │   ├── config.py         # pydantic-settings (.env)
│   │   ├── database.py       # Async SQLAlchemy engine + session factory
│   │   ├── models/           # ORM: Company, StockPrice, DailyMetric, PricePrediction
│   │   ├── schemas/          # Pydantic response models
│   │   ├── routers/          # One module per endpoint group
│   │   ├── services/
│   │   │   ├── data_fetcher.py   # Alpha Vantage client (12 s rate-limit, retry)
│   │   │   ├── data_processor.py # pandas cleaning + metric upserts
│   │   │   ├── cache.py          # Redis → in-memory TTL fallback
│   │   │   └── ml_predictor.py   # LinearRegression train + 7-day forecast
│   │   ├── tasks/scheduler.py    # APScheduler jobs (07:00 + 16:00 IST)
│   │   └── utils/logger.py       # Structured JSON logger
│   ├── tests/
│   └── requirements.txt
├── frontend/
│   ├── index.html
│   ├── css/style.css
│   └── js/
│       ├── api.js        # fetch() wrappers, auto-detects localhost vs /api
│       ├── charts.js     # Chart.js: candlestick, volume, compare, forecast, heatmap
│       ├── components.js # DOM builders for sidebar, cards, movers
│       └── app.js        # State machine, hash router, event wiring
├── nginx/nginx.conf       # TLS termination + proxy rules
├── docker-compose.yml
├── .env.example
└── .github/workflows/
    ├── ci.yml            # PR: ruff lint + pytest + docker build
    └── cd.yml            # push to main: SSH deploy
```

---

## Alpha Vantage free-tier limits

| Limit | Value |
|-------|-------|
| Requests / minute | 5 |
| Requests / day | 25 |
| History per request | Last 100 trading days (~5 months) |

The daily scheduler uses 20 of the 25 daily calls. A full reseed (20 symbols) takes ~4 minutes.

---

*Built by Harekrishna Bagh as part of an internship at Jarnox.*
