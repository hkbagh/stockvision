export function buildCompanyList(companies, onSelect) {
  const ul = document.getElementById("company-list");
  ul.innerHTML = "";
  companies.forEach(c => {
    const li = document.createElement("li");
    li.dataset.symbol = c.symbol;
    li.innerHTML = `
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
}

export function filterCompanyList(query) {
  const q = query.toLowerCase();
  document.querySelectorAll("#company-list li").forEach(li => {
    const sym = li.dataset.symbol?.toLowerCase() ?? "";
    const name = li.querySelector(".name")?.textContent.toLowerCase() ?? "";
    li.style.display = sym.includes(q) || name.includes(q) ? "" : "none";
  });
}

export function buildMoversList(gainers, losers) {
  const fmt = (v) => v != null ? `${v >= 0 ? "+" : ""}${(v * 100).toFixed(2)}%` : "—";
  const color = (v) => v >= 0 ? "text-green" : "text-red";

  const fill = (listId, items) => {
    const ul = document.getElementById(listId);
    ul.innerHTML = "";
    items.forEach(item => {
      const li = document.createElement("li");
      const ret = item.daily_return;
      li.innerHTML = `
        <span class="sym">${item.symbol.replace(".NS", "")}</span>
        <span class="ret ${color(ret)}">${fmt(ret)}</span>
      `;
      li.addEventListener("click", () => {
        if (window.AppState) window.AppState.selectSymbol(item.symbol);
      });
      ul.appendChild(li);
    });
  };

  fill("gainers-list", gainers);
  fill("losers-list", losers);
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
  const fmt = v => v != null ? `₹${Number(v).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—";
  const fmtPct = v => v != null ? `${(v * 100).toFixed(2)}%` : "—";

  document.getElementById("card-52h").textContent = fmt(summary.week52_high);
  document.getElementById("card-52l").textContent = fmt(summary.week52_low);
  document.getElementById("card-avg").textContent = fmt(summary.avg_close);
  document.getElementById("card-vol").textContent = fmtPct(summary.volatility);
  document.getElementById("card-pred").textContent = fmt(summary.predicted_close_tomorrow);

  const retEl = document.getElementById("stock-return");
  const ret = summary.latest_daily_return;
  retEl.textContent = ret != null ? `${ret >= 0 ? "▲" : "▼"} ${Math.abs(ret * 100).toFixed(2)}%` : "";
  retEl.className = "stock-return " + (ret >= 0 ? "text-green" : "text-red");

  document.getElementById("stock-price").textContent = fmt(summary.latest_close);
  document.getElementById("stock-name").textContent = summary.name;
  document.getElementById("stock-symbol").textContent = summary.symbol;
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
    el.textContent = "Market Open";
    el.className = "badge badge-open";
  } else {
    el.textContent = "Market Closed";
    el.className = "badge badge-closed";
  }
}

window.Components = { buildCompanyList, setActiveCompany, filterCompanyList, buildMoversList, populateCompareSelect, updateSummaryCards, setMarketStatus };
