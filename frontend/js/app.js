import { Api } from "./api.js";
import { renderPriceChart, renderCompareChart, renderPredictionChart, renderCorrelationHeatmap } from "./charts.js";
import {
  buildCompanyList, setActiveCompany, filterCompanyList,
  buildMoversList, populateCompareSelect, updateSummaryCards,
  updatePredStats, setMarketStatus,
} from "./components.js";

const State = {
  companies: [],
  selectedSymbol: null,
  activeDays: 30,
  activeTab: "price",
  heatmapLoaded: false,
  normalized: false,
  lastCompareData: null,
};

window.AppState = { selectSymbol };

function show(id) { document.getElementById(id)?.classList.remove("hidden"); }
function hide(id) { document.getElementById(id)?.classList.add("hidden"); }

async function init() {
  setMarketStatus();
  setInterval(setMarketStatus, 60000);

  try {
    const [companies, movers] = await Promise.all([Api.getCompanies(), Api.getTopGainers(5)]);
    State.companies = companies;
    buildCompanyList(companies, selectSymbol);
    buildMoversList(movers.gainers, movers.losers);
    document.getElementById("last-updated").textContent = `Updated ${new Date().toLocaleTimeString()}`;
  } catch (err) {
    console.error("Init error:", err);
    document.getElementById("last-updated").textContent = "API unavailable";
  }

  hide("loading-overlay");
  show("welcome-state");

  document.getElementById("search-input")
    .addEventListener("input", e => filterCompanyList(e.target.value));

  document.querySelectorAll(".range-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".range-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      State.activeDays = Number(btn.dataset.days);
      if (State.selectedSymbol && State.activeTab === "price") loadPriceChart();
      if (State.selectedSymbol && State.activeTab === "compare") triggerCompare();
    });
  });

  document.querySelectorAll(".tab-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      State.activeTab = btn.dataset.tab;
      switchPanel(btn.dataset.tab);
    });
  });

  document.getElementById("compare-btn").addEventListener("click", triggerCompare);

  document.getElementById("normalize-toggle").addEventListener("change", e => {
    State.normalized = e.target.checked;
    if (State.lastCompareData) {
      const { d } = State.lastCompareData;
      renderCompareChart(d.symbol1, d.series1, d.symbol2, d.series2, State.normalized);
    }
  });
}

async function selectSymbol(symbol) {
  State.selectedSymbol = symbol;
  State.heatmapLoaded = false;
  State.lastCompareData = null;
  setActiveCompany(symbol);

  hide("welcome-state");
  show("dashboard");

  document.getElementById("stock-sector").textContent =
    State.companies.find(c => c.symbol === symbol)?.sector ?? "";

  populateCompareSelect(State.companies, symbol);

  await Promise.all([loadSummary(), loadPriceChart()]);
}

async function loadSummary() {
  try {
    const summary = await Api.getSummary(State.selectedSymbol);
    updateSummaryCards(summary);
  } catch (err) {
    console.error("Summary error:", err);
  }
}

async function loadPriceChart() {
  try {
    const data = await Api.getStockData(State.selectedSymbol, State.activeDays);
    if (!data || data.length === 0) {
      console.warn("No price data returned");
      return;
    }
    renderPriceChart(data);
  } catch (err) {
    console.error("Price chart error:", err);
  }
}

function switchPanel(tab) {
  ["price", "compare", "prediction", "heatmap"].forEach(t => {
    const el = document.getElementById(`panel-${t}`);
    if (el) el.classList.toggle("hidden", t !== tab);
  });

  const rangeGroup = document.getElementById("range-group");
  rangeGroup.style.visibility = ["price", "compare"].includes(tab) ? "visible" : "hidden";

  if (tab === "prediction") loadPredictionChart();
  if (tab === "heatmap" && !State.heatmapLoaded) loadHeatmap();
}

async function loadPredictionChart() {
  if (!State.selectedSymbol) return;
  try {
    const [hist, pred] = await Promise.all([
      Api.getStockData(State.selectedSymbol, 90),
      Api.getPrediction(State.selectedSymbol),
    ]);
    renderPredictionChart(hist, pred.predictions);
    updatePredStats(pred);
    document.getElementById("pred-meta").textContent =
      `Training window: 1 year  |  Splits: 5-fold TimeSeriesSplit`;
  } catch (err) {
    console.error("Prediction error:", err);
    document.getElementById("pred-meta").textContent = "Prediction unavailable — needs more historical data";
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
  const compareSymbol = document.getElementById("compare-select").value;
  if (!State.selectedSymbol || !compareSymbol) return;

  try {
    const d = await Api.compare(State.selectedSymbol, compareSymbol, State.activeDays);
    State.lastCompareData = { d };
    renderCompareChart(d.symbol1, d.series1, d.symbol2, d.series2, State.normalized);

    const badge = document.getElementById("correlation-badge");
    const valEl = document.getElementById("correlation-value");
    if (d.correlation != null) {
      const abs = Math.abs(d.correlation);
      const strength = abs > 0.75 ? "Strong" : abs > 0.4 ? "Moderate" : "Weak";
      const dir = d.correlation >= 0 ? "positive" : "negative";
      valEl.textContent = `${d.correlation.toFixed(3)} — ${strength} ${dir} correlation`;
      badge.classList.remove("hidden");
    } else {
      badge.classList.add("hidden");
    }
  } catch (err) {
    console.error("Compare error:", err);
  }
}

document.addEventListener("DOMContentLoaded", init);
