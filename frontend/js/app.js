import { Api } from "./api.js";
import { renderPriceChart, renderCompareChart, renderPredictionChart, renderCorrelationHeatmap } from "./charts.js";
import {
  buildCompanyList, setActiveCompany, filterCompanyList,
  buildMoversList, populateCompareSelect, updateSummaryCards, setMarketStatus,
} from "./components.js";

const State = {
  companies: [],
  selectedSymbol: null,
  activeDays: 30,
  activeTab: "price",
  heatmapLoaded: false,
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

  document.getElementById("search-input").addEventListener("input", e => filterCompanyList(e.target.value));

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
}

async function selectSymbol(symbol) {
  State.selectedSymbol = symbol;
  State.heatmapLoaded = false;
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
      Api.getStockData(State.selectedSymbol, 60),
      Api.getPrediction(State.selectedSymbol),
    ]);
    renderPredictionChart(hist, pred.predictions);
    document.getElementById("pred-meta").textContent =
      `Model: ${pred.model_version} | MAE: ₹${pred.mae?.toFixed(2) ?? "—"} | Confidence: ${pred.confidence}`;
  } catch (err) {
    console.error("Prediction error:", err);
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
    const data = await Api.compare(State.selectedSymbol, compareSymbol, State.activeDays);
    renderCompareChart(data.symbol1, data.series1, data.symbol2, data.series2);

    const badge = document.getElementById("correlation-badge");
    if (data.correlation != null) {
      badge.textContent = `Correlation: ${data.correlation.toFixed(3)}`;
      badge.classList.remove("hidden");
    } else {
      badge.classList.add("hidden");
    }
  } catch (err) {
    console.error("Compare error:", err);
  }
}

document.addEventListener("DOMContentLoaded", init);
