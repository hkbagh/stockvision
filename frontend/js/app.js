import { Api } from "./api.js";
import { renderPriceChart, renderCompareChart, renderForecastChart, renderCorrelationHeatmap } from "./charts.js";
import {
  buildCompanyList, setActiveCompany, filterCompanyList,
  buildMoversList, populateCompareSelect, updateDashboard,
  updateForecastMeta, setMarketStatus,
} from "./components.js";

const State = {
  companies:      [],
  symbol:         null,
  days:           30,
  tab:            "price",
  heatmapLoaded:  false,
  normalized:     false,
  compareCache:   null,
};

window.AppState = { selectSymbol };

const show = id => document.getElementById(id)?.classList.remove("hidden");
const hide = id => document.getElementById(id)?.classList.add("hidden");

async function init() {
  setMarketStatus();
  setInterval(setMarketStatus, 60000);

  try {
    const [companies, movers] = await Promise.all([Api.getCompanies(), Api.getTopGainers(5)]);
    State.companies = companies;
    buildCompanyList(companies, selectSymbol);
    buildMoversList(movers.gainers, movers.losers);
    document.getElementById("last-updated").textContent =
      `Updated ${new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}`;
  } catch (err) {
    console.error("Init error:", err);
    document.getElementById("last-updated").textContent = "API unavailable";
  }

  hide("loading-screen");
  show("welcome-screen");

  // Search
  document.getElementById("search-input")
    .addEventListener("input", e => filterCompanyList(e.target.value));

  // Tab buttons
  document.querySelectorAll(".ctab").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".ctab").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      State.tab = btn.dataset.tab;
      switchTab(btn.dataset.tab);
    });
  });

  // Range buttons
  document.querySelectorAll(".rtab").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".rtab").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      State.days = Number(btn.dataset.days);
      if (!State.symbol) return;
      if (State.tab === "price")   loadPriceChart();
      if (State.tab === "compare") triggerCompare();
    });
  });

  // Compare
  document.getElementById("compare-btn").addEventListener("click", triggerCompare);
  document.getElementById("norm-toggle").addEventListener("change", e => {
    State.normalized = e.target.checked;
    if (State.compareCache) {
      const d = State.compareCache;
      renderCompareChart(d.symbol1, d.series1, d.symbol2, d.series2, State.normalized);
    }
  });
}

async function selectSymbol(symbol) {
  State.symbol       = symbol;
  State.heatmapLoaded = false;
  State.compareCache  = null;
  setActiveCompany(symbol);

  hide("welcome-screen");
  show("dashboard");

  // Update sector tag from local companies list
  const sector = State.companies.find(c => c.symbol === symbol)?.sector ?? "";
  const sectorEl = document.getElementById("stock-sector-tag");
  if (sectorEl) sectorEl.textContent = sector;

  populateCompareSelect(State.companies, symbol);
  await Promise.all([loadSummary(), loadPriceChart()]);
}

async function loadSummary() {
  try {
    const s = await Api.getSummary(State.symbol);
    updateDashboard(s);
  } catch (err) {
    console.error("Summary error:", err);
  }
}

async function loadPriceChart() {
  try {
    const data = await Api.getStockData(State.symbol, State.days);
    if (!data || data.length === 0) {
      console.warn("No price data for", State.symbol, State.days, "days");
      return;
    }
    renderPriceChart(data);
  } catch (err) {
    console.error("Price chart error:", err);
  }
}

function switchTab(tab) {
  ["price", "compare", "forecast", "heatmap"].forEach(t => {
    const el = document.getElementById(`panel-${t}`);
    if (el) el.classList.toggle("hidden", t !== tab);
  });

  const rangeGroup = document.getElementById("range-tabs");
  rangeGroup.style.visibility = ["price", "compare"].includes(tab) ? "visible" : "hidden";

  if (tab === "forecast") loadForecastChart();
  if (tab === "heatmap" && !State.heatmapLoaded) loadHeatmap();
}

async function loadForecastChart() {
  if (!State.symbol) return;
  const meta  = document.getElementById("forecast-meta");
  const foot  = document.getElementById("forecast-footer");
  if (meta)  meta.innerHTML  = '<span style="color:#94a3b8;font-size:12px">Training model…</span>';
  if (foot)  foot.textContent = "";
  try {
    const [hist, pred] = await Promise.all([
      Api.getStockData(State.symbol, 365),
      Api.getPrediction(State.symbol),
    ]);
    renderForecastChart(hist, pred.predictions);
    updateForecastMeta(pred);
  } catch (err) {
    if (meta) meta.innerHTML = '<span style="color:#dc2626;font-size:12px">Prediction unavailable — need more historical data (minimum 20 days)</span>';
    console.error("Forecast error:", err);
  }
}

async function loadHeatmap() {
  try {
    const corr = await Api.getCorrelation();
    renderCorrelationHeatmap(corr.symbols, corr.matrix);
    State.heatmapLoaded = true;
  } catch (err) {
    console.error("Heatmap error:", err);
  }
}

async function triggerCompare() {
  const sym2 = document.getElementById("compare-select").value;
  if (!State.symbol || !sym2) return;
  try {
    const d = await Api.compare(State.symbol, sym2, State.days);
    State.compareCache = d;
    renderCompareChart(d.symbol1, d.series1, d.symbol2, d.series2, State.normalized);

    const badge = document.getElementById("corr-badge");
    if (badge && d.correlation != null) {
      const abs = Math.abs(d.correlation);
      const strength = abs > 0.75 ? "Strong" : abs > 0.4 ? "Moderate" : "Weak";
      const dir = d.correlation >= 0 ? "positive" : "negative";
      badge.textContent  = `r = ${d.correlation.toFixed(3)} · ${strength} ${dir}`;
      badge.classList.remove("hidden");
    }
  } catch (err) {
    console.error("Compare error:", err);
  }
}

document.addEventListener("DOMContentLoaded", init);
