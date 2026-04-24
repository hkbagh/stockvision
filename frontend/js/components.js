function initials(sym) { return sym.replace(".NS", "").slice(0, 2).toUpperCase(); }
function fINR(v) {
  if (v == null) return "—";
  return "₹" + Number(v).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fVol(v) {
  if (v == null) return "—";
  if (v >= 1e7) return (v / 1e7).toFixed(2) + " Cr";
  if (v >= 1e5) return (v / 1e5).toFixed(2) + " L";
  return v.toLocaleString();
}
function fPct(v) { return v != null ? `${(v * 100).toFixed(2)}%` : "—"; }

export function buildCompanyList(companies, onSelect) {
  const ul = document.getElementById("company-list");
  ul.innerHTML = "";
  companies.forEach((c, i) => {
    const li = document.createElement("li");
    li.dataset.symbol = c.symbol;
    li.innerHTML = `
      <div class="c-avatar">${initials(c.symbol)}</div>
      <div style="min-width:0">
        <div class="c-sym">${c.symbol.replace(".NS", "")}</div>
        <div class="c-name">${c.name}</div>
      </div>`;
    li.addEventListener("click", () => onSelect(c.symbol));
    ul.appendChild(li);
  });
}

export function setActiveCompany(symbol) {
  document.querySelectorAll("#company-list li").forEach(li => {
    li.classList.toggle("active", li.dataset.symbol === symbol);
  });
  const av = document.getElementById("stock-avatar");
  if (av) av.textContent = initials(symbol);
}

export function filterCompanyList(q) {
  q = q.toLowerCase();
  document.querySelectorAll("#company-list li").forEach(li => {
    const sym  = li.dataset.symbol?.toLowerCase() ?? "";
    const name = li.querySelector(".c-name")?.textContent.toLowerCase() ?? "";
    li.style.display = sym.includes(q) || name.includes(q) ? "" : "none";
  });
}

export function buildMoversList(gainers, losers) {
  const fmt = v => v != null ? `${v >= 0 ? "+" : ""}${(v * 100).toFixed(2)}%` : "—";
  const fill = (id, items) => {
    const ul = document.getElementById(id);
    ul.innerHTML = "";
    items.slice(0, 5).forEach(item => {
      const li = document.createElement("li");
      const cls = (item.daily_return ?? 0) >= 0 ? "up" : "down";
      li.innerHTML = `<span class="mover-sym">${item.symbol.replace(".NS", "")}</span><span class="mover-ret ${cls}">${fmt(item.daily_return)}</span>`;
      li.addEventListener("click", () => window.AppState?.selectSymbol(item.symbol));
      ul.appendChild(li);
    });
  };
  fill("gainers-list", gainers);
  fill("losers-list",  losers);
}

export function populateCompareSelect(companies, current) {
  const sel = document.getElementById("compare-select");
  sel.innerHTML = "";
  companies.filter(c => c.symbol !== current).forEach(c => {
    const o = document.createElement("option");
    o.value = c.symbol;
    o.textContent = `${c.symbol.replace(".NS", "")} — ${c.name}`;
    sel.appendChild(o);
  });
}

export function updateDashboard(summary) {
  // Stock banner
  const el = id => document.getElementById(id);
  el("stock-name").textContent       = summary.name;
  el("stock-symbol-tag").textContent = summary.symbol;
  el("stock-sector-tag").textContent = summary.sector ?? "";
  el("stock-price").textContent      = fINR(summary.latest_close);

  const ret = summary.latest_daily_return;
  const chEl = el("stock-change");
  if (ret != null) {
    const sign = ret >= 0 ? "▲" : "▼";
    const absChg = summary.latest_close != null && summary.latest_open != null
      ? fINR(Math.abs(summary.latest_close - summary.latest_open))
      : "";
    chEl.textContent = `${sign} ${Math.abs(ret * 100).toFixed(2)}%  ${absChg}`;
    chEl.className = `stock-change ${ret >= 0 ? "up" : "down"}`;
  } else {
    chEl.textContent = "—"; chEl.className = "stock-change flat";
  }

  // OHLCV
  el("stat-open").textContent   = fINR(summary.latest_open);
  el("stat-high").textContent   = fINR(summary.latest_high);
  el("stat-low").textContent    = fINR(summary.latest_low);
  el("stat-close").textContent  = fINR(summary.latest_close);
  el("stat-volume").textContent = fVol(summary.latest_volume);

  // 52W range
  const lo = summary.week52_low, hi = summary.week52_high, cur = summary.latest_close;
  el("range-lo").textContent = fINR(lo);
  el("range-hi").textContent = fINR(hi);
  if (lo != null && hi != null && cur != null && hi > lo) {
    const pct = Math.min(Math.max((cur - lo) / (hi - lo) * 100, 0), 100).toFixed(1);
    el("range-fill").style.width = pct + "%";
    el("range-thumb").style.left = pct + "%";
  }

  // KPIs
  el("kpi-52h").textContent = fINR(summary.week52_high);
  el("kpi-52l").textContent = fINR(summary.week52_low);
  el("kpi-avg").textContent = fINR(summary.avg_close);
  el("kpi-vol").textContent = summary.volatility != null ? fPct(summary.volatility) : "—";

  // AI Forecast KPI
  const pred = summary.predicted_close_tomorrow;
  const kpiPred  = el("kpi-pred");
  const kpiDelta = el("kpi-pred-delta");
  if (pred != null && summary.latest_close != null) {
    const diff = pred - summary.latest_close;
    const sign = diff >= 0 ? "▲" : "▼";
    const cls  = diff >= 0 ? "green" : "red";
    kpiPred.textContent = fINR(pred);
    kpiDelta.innerHTML  = `<span class="${cls}">${sign} ${Math.abs((diff / summary.latest_close) * 100).toFixed(2)}%</span> next day`;
  } else {
    kpiPred.textContent = "—";
    kpiDelta.textContent = "Next trading day";
  }
}

export function updateForecastMeta(pred) {
  const el = document.getElementById("forecast-meta");
  if (!el || !pred) return;
  const mae = pred.mae != null ? fINR(pred.mae) : "—";
  const confColor = pred.confidence === "high" ? "green" : pred.confidence === "medium" ? "amber" : "red";
  el.innerHTML = `
    <div class="fmeta-card"><div class="fmeta-label">Model</div><div class="fmeta-value">${pred.model_version ?? "—"}</div></div>
    <div class="fmeta-card"><div class="fmeta-label">MAE</div><div class="fmeta-value">${mae}</div></div>
    <div class="fmeta-card"><div class="fmeta-label">Confidence</div><div class="fmeta-value ${confColor}">${(pred.confidence ?? "—").toUpperCase()}</div></div>
    <div class="fmeta-card"><div class="fmeta-label">Forecast Days</div><div class="fmeta-value">${pred.predictions?.length ?? 0}</div></div>
    <div class="fmeta-card"><div class="fmeta-label">Training Data</div><div class="fmeta-value">1 Year</div></div>
  `;
  const foot = document.getElementById("forecast-footer");
  if (foot) foot.textContent = "Linear Regression · TimeSeriesSplit(5) · Features: MA7, MA30, Volatility, Volume Z, Return Lag1/2";
}

export function setMarketStatus() {
  const now = new Date();
  const ist = new Date(now.getTime() + now.getTimezoneOffset() * 60000 + 5.5 * 3600000);
  const h = ist.getHours(), m = ist.getMinutes(), day = ist.getDay();
  const open = day >= 1 && day <= 5 && (h > 9 || (h === 9 && m >= 15)) && (h < 15 || (h === 15 && m <= 30));
  const el = document.getElementById("market-status");
  el.className = `market-pill ${open ? "open" : "closed"}`;
  el.innerHTML = `<span class="pill-dot"></span><span class="pill-text">Market ${open ? "Open" : "Closed"}</span>`;
}

window.Components = {
  buildCompanyList, setActiveCompany, filterCompanyList, buildMoversList,
  populateCompareSelect, updateDashboard, updateForecastMeta, setMarketStatus,
};
