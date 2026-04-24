function getInitials(symbol) {
  return symbol.replace(".NS", "").slice(0, 2).toUpperCase();
}

function fmtINR(v) {
  if (v == null) return "—";
  return "₹" + Number(v).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtVol(v) {
  if (v == null) return "—";
  if (v >= 1e7) return (v / 1e7).toFixed(2) + " Cr";
  if (v >= 1e5) return (v / 1e5).toFixed(2) + " L";
  return v.toLocaleString();
}

export function buildCompanyList(companies, onSelect) {
  const ul = document.getElementById("company-list");
  ul.innerHTML = "";
  companies.forEach((c, i) => {
    const li = document.createElement("li");
    li.dataset.symbol = c.symbol;
    li.style.animationDelay = `${i * 0.03}s`;
    li.innerHTML = `
      <div class="company-avatar">${getInitials(c.symbol)}</div>
      <div>
        <div class="sym">${c.symbol.replace(".NS", "")}</div>
        <div class="name">${c.name}</div>
      </div>
    `;
    li.addEventListener("click", () => onSelect(c.symbol));
    ul.appendChild(li);
  });
}

export function setActiveCompany(symbol) {
  document.querySelectorAll("#company-list li").forEach(li => {
    li.classList.toggle("active", li.dataset.symbol === symbol);
  });
  const logoEl = document.getElementById("stock-logo");
  if (logoEl) logoEl.textContent = getInitials(symbol);
}

export function filterCompanyList(query) {
  const q = query.toLowerCase();
  document.querySelectorAll("#company-list li").forEach(li => {
    const sym  = li.dataset.symbol?.toLowerCase() ?? "";
    const name = li.querySelector(".name")?.textContent.toLowerCase() ?? "";
    li.style.display = sym.includes(q) || name.includes(q) ? "" : "none";
  });
}

export function buildMoversList(gainers, losers) {
  const fmt = v => v != null ? `${v >= 0 ? "+" : ""}${(v * 100).toFixed(2)}%` : "—";

  const fill = (listId, items) => {
    const ul = document.getElementById(listId);
    ul.innerHTML = "";
    items.forEach(item => {
      const li = document.createElement("li");
      const ret = item.daily_return;
      const cls = ret >= 0 ? "up" : "down";
      li.innerHTML = `
        <span class="sym">${item.symbol.replace(".NS", "")}</span>
        <span class="ret ${cls}">${fmt(ret)}</span>
      `;
      li.addEventListener("click", () => {
        if (window.AppState) window.AppState.selectSymbol(item.symbol);
      });
      ul.appendChild(li);
    });
  };

  fill("gainers-list", gainers.slice(0, 5));
  fill("losers-list",  losers.slice(0, 5));
}

export function populateCompareSelect(companies, currentSymbol) {
  const sel = document.getElementById("compare-select");
  sel.innerHTML = "";
  companies.filter(c => c.symbol !== currentSymbol).forEach(c => {
    const opt = document.createElement("option");
    opt.value = c.symbol;
    opt.textContent = `${c.symbol.replace(".NS", "")} — ${c.name}`;
    sel.appendChild(opt);
  });
}

export function updateSummaryCards(summary) {
  // Main cards
  document.getElementById("card-52h").textContent = fmtINR(summary.week52_high);
  document.getElementById("card-52l").textContent = fmtINR(summary.week52_low);
  document.getElementById("card-avg").textContent  = fmtINR(summary.avg_close);

  const vol = summary.volatility;
  document.getElementById("card-vol").textContent  = vol != null ? `${(vol * 100).toFixed(2)}%` : "—";
  document.getElementById("card-pred").textContent = fmtINR(summary.predicted_close_tomorrow);

  // Price + return
  document.getElementById("stock-price").textContent = fmtINR(summary.latest_close);
  document.getElementById("stock-name").textContent  = summary.name;
  document.getElementById("stock-symbol").textContent = summary.symbol;

  const ret = summary.latest_daily_return;
  const retEl = document.getElementById("stock-return");
  if (ret != null) {
    const sign = ret >= 0 ? "▲" : "▼";
    const changeAbs = summary.latest_close != null && summary.latest_open != null
      ? fmtINR(summary.latest_close - summary.latest_open)
      : "";
    retEl.textContent = `${sign} ${Math.abs(ret * 100).toFixed(2)}%  ${changeAbs}`;
    retEl.className = `stock-return ${ret >= 0 ? "up" : "down"}`;
  } else {
    retEl.textContent = "—";
    retEl.className = "stock-return";
  }

  // OHLC row
  document.getElementById("ohlc-open").textContent   = fmtINR(summary.latest_open);
  document.getElementById("ohlc-high").textContent   = fmtINR(summary.latest_high);
  document.getElementById("ohlc-low").textContent    = fmtINR(summary.latest_low);
  document.getElementById("ohlc-volume").textContent = fmtVol(summary.latest_volume);

  // 52W range bar
  const lo = summary.week52_low;
  const hi = summary.week52_high;
  const cur = summary.latest_close;
  const fillEl = document.getElementById("range52-fill");
  const dotEl  = document.getElementById("range52-dot");
  document.getElementById("range52-low").textContent  = fmtINR(lo);
  document.getElementById("range52-high").textContent = fmtINR(hi);
  if (lo != null && hi != null && cur != null && hi > lo) {
    const pct = Math.min(Math.max((cur - lo) / (hi - lo) * 100, 0), 100).toFixed(1);
    fillEl.style.width = pct + "%";
    dotEl.style.left   = pct + "%";
  }

  // AI forecast change arrow
  const pred = summary.predicted_close_tomorrow;
  const close = summary.latest_close;
  const predEl = document.getElementById("card-pred");
  if (pred != null && close != null) {
    const diff = pred - close;
    const sign = diff >= 0 ? "▲" : "▼";
    const cls  = diff >= 0 ? "text-green" : "text-red";
    predEl.innerHTML = `${fmtINR(pred)} <small class="${cls}">${sign} ${Math.abs((diff / close) * 100).toFixed(2)}%</small>`;
  }
}

export function updatePredStats(pred) {
  const el = document.getElementById("pred-stats");
  if (!el || !pred) return;
  const mae = pred.mae != null ? fmtINR(pred.mae) : "—";
  const conf = pred.confidence ?? "—";
  const confClass = conf === "high" ? "text-green" : conf === "low" ? "text-red" : "";
  el.innerHTML = `
    <div class="pred-stat-item">
      <span class="pred-stat-label">Model</span>
      <span class="pred-stat-val">${pred.model_version ?? "—"}</span>
    </div>
    <div class="pred-stat-item">
      <span class="pred-stat-label">MAE</span>
      <span class="pred-stat-val">${mae}</span>
    </div>
    <div class="pred-stat-item">
      <span class="pred-stat-label">Confidence</span>
      <span class="pred-stat-val ${confClass}">${conf.toUpperCase()}</span>
    </div>
    <div class="pred-stat-item">
      <span class="pred-stat-label">Horizon</span>
      <span class="pred-stat-val">${pred.predictions?.length ?? 0} days</span>
    </div>
  `;
}

export function setMarketStatus() {
  const now = new Date();
  const utc = now.getTime() + now.getTimezoneOffset() * 60000;
  const ist = new Date(utc + 5.5 * 3600000);
  const h = ist.getHours(), m = ist.getMinutes(), day = ist.getDay();
  const open = (h > 9 || (h === 9 && m >= 15)) && (h < 15 || (h === 15 && m <= 30));
  const weekday = day >= 1 && day <= 5;
  const el = document.getElementById("market-status");
  if (weekday && open) {
    el.innerHTML = `<span class="badge-dot"></span> Market Open`;
    el.className = "badge badge-open";
  } else {
    el.innerHTML = `<span class="badge-dot"></span> Market Closed`;
    el.className = "badge badge-closed";
  }
}

window.Components = {
  buildCompanyList, setActiveCompany, filterCompanyList,
  buildMoversList, populateCompareSelect, updateSummaryCards,
  updatePredStats, setMarketStatus,
};
