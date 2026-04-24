function getInitials(symbol) {
  return symbol.replace(".NS", "").slice(0, 2).toUpperCase();
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
    const active = li.dataset.symbol === symbol;
    li.classList.toggle("active", active);
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
  const fmtINR = v => v != null
    ? `₹${Number(v).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : "—";
  const fmtPct = v => v != null ? `${(v * 100).toFixed(2)}%` : "—";

  document.getElementById("card-52h").textContent = fmtINR(summary.week52_high);
  document.getElementById("card-52l").textContent = fmtINR(summary.week52_low);
  document.getElementById("card-avg").textContent = fmtINR(summary.avg_close);
  document.getElementById("card-vol").textContent = fmtPct(summary.volatility);
  document.getElementById("card-pred").textContent = fmtINR(summary.predicted_close_tomorrow);

  document.getElementById("stock-price").textContent = fmtINR(summary.latest_close);
  document.getElementById("stock-name").textContent  = summary.name;

  const sym = document.getElementById("stock-symbol");
  sym.textContent = summary.symbol;

  const ret = summary.latest_daily_return;
  const retEl = document.getElementById("stock-return");
  retEl.textContent = ret != null
    ? `${ret >= 0 ? "▲" : "▼"} ${Math.abs(ret * 100).toFixed(2)}%`
    : "—";
  retEl.className = `stock-return ${ret >= 0 ? "up" : "down"}`;
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

window.Components = { buildCompanyList, setActiveCompany, filterCompanyList, buildMoversList, populateCompareSelect, updateSummaryCards, setMarketStatus };
