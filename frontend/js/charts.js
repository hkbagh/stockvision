const CHART_DEFAULTS = {
  responsive: true,
  maintainAspectRatio: false,
  interaction: { mode: "index", intersect: false },
  plugins: {
    legend: { labels: { color: "#8b949e", boxWidth: 12, font: { size: 12 } } },
    tooltip: {
      backgroundColor: "#161b22",
      borderColor: "#30363d",
      borderWidth: 1,
      titleColor: "#e6edf3",
      bodyColor: "#8b949e",
    },
  },
  scales: {
    x: {
      type: "time",
      time: { unit: "day", tooltipFormat: "dd MMM yyyy" },
      ticks: { color: "#8b949e", maxTicksLimit: 8 },
      grid: { color: "#21262d" },
    },
    y: {
      ticks: { color: "#8b949e" },
      grid: { color: "#21262d" },
    },
  },
};

let _priceChart = null;
let _compareChart = null;
let _predChart = null;
let _heatmapChart = null;

function destroyChart(ref) { if (ref) { try { ref.destroy(); } catch (_) {} } }

export function renderPriceChart(data) {
  destroyChart(_priceChart);
  const ctx = document.getElementById("price-chart").getContext("2d");
  const labels = data.map(d => d.date);
  _priceChart = new Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: "Close",
          data: data.map(d => d.close),
          borderColor: "#58a6ff",
          backgroundColor: "rgba(88,166,255,.08)",
          borderWidth: 2,
          pointRadius: 0,
          fill: true,
          tension: 0.1,
        },
        {
          label: "MA7",
          data: data.map(d => d.ma_7),
          borderColor: "#d29922",
          borderWidth: 1.5,
          borderDash: [4, 4],
          pointRadius: 0,
          fill: false,
          tension: 0.1,
        },
        {
          label: "MA30",
          data: data.map(d => d.ma_30),
          borderColor: "#bc8cff",
          borderWidth: 1.5,
          borderDash: [6, 3],
          pointRadius: 0,
          fill: false,
          tension: 0.1,
        },
      ],
    },
    options: {
      ...CHART_DEFAULTS,
      plugins: {
        ...CHART_DEFAULTS.plugins,
        tooltip: {
          ...CHART_DEFAULTS.plugins.tooltip,
          callbacks: {
            label: ctx => `${ctx.dataset.label}: ₹${ctx.parsed.y?.toFixed(2) ?? "—"}`,
          },
        },
      },
    },
  });
  return _priceChart;
}

export function renderCompareChart(sym1, data1, sym2, data2) {
  destroyChart(_compareChart);
  const ctx = document.getElementById("compare-chart").getContext("2d");
  const labels1 = data1.map(d => d.date);
  const labels2 = data2.map(d => d.date);
  const allLabels = [...new Set([...labels1, ...labels2])].sort();

  const map1 = Object.fromEntries(data1.map(d => [d.date, d.close]));
  const map2 = Object.fromEntries(data2.map(d => [d.date, d.close]));

  _compareChart = new Chart(ctx, {
    type: "line",
    data: {
      labels: allLabels,
      datasets: [
        {
          label: sym1,
          data: allLabels.map(d => map1[d] ?? null),
          borderColor: "#58a6ff",
          backgroundColor: "rgba(88,166,255,.06)",
          borderWidth: 2,
          pointRadius: 0,
          fill: true,
          tension: 0.1,
          yAxisID: "y",
        },
        {
          label: sym2,
          data: allLabels.map(d => map2[d] ?? null),
          borderColor: "#3fb950",
          backgroundColor: "rgba(63,185,80,.06)",
          borderWidth: 2,
          pointRadius: 0,
          fill: true,
          tension: 0.1,
          yAxisID: "y1",
        },
      ],
    },
    options: {
      ...CHART_DEFAULTS,
      scales: {
        x: CHART_DEFAULTS.scales.x,
        y: {
          ...CHART_DEFAULTS.scales.y,
          position: "left",
          title: { display: true, text: sym1, color: "#58a6ff" },
        },
        y1: {
          ...CHART_DEFAULTS.scales.y,
          position: "right",
          grid: { drawOnChartArea: false },
          title: { display: true, text: sym2, color: "#3fb950" },
        },
      },
    },
  });
  return _compareChart;
}

export function renderPredictionChart(histData, predictions) {
  destroyChart(_predChart);
  const ctx = document.getElementById("prediction-chart").getContext("2d");

  const histLabels = histData.map(d => d.date);
  const histClose = histData.map(d => d.close);
  const predLabels = predictions.map(p => p.date);
  const predClose = predictions.map(p => p.predicted_close);

  const lastHist = histClose[histClose.length - 1];
  const predWithBridge = [lastHist, ...predClose];
  const predLabelsBridge = [histLabels[histLabels.length - 1], ...predLabels];

  _predChart = new Chart(ctx, {
    type: "line",
    data: {
      datasets: [
        {
          label: "Historical Close",
          data: histLabels.map((d, i) => ({ x: d, y: histClose[i] })),
          borderColor: "#58a6ff",
          backgroundColor: "rgba(88,166,255,.08)",
          borderWidth: 2,
          pointRadius: 0,
          fill: true,
          tension: 0.1,
        },
        {
          label: "ML Prediction",
          data: predLabelsBridge.map((d, i) => ({ x: d, y: predWithBridge[i] })),
          borderColor: "#f85149",
          borderDash: [6, 3],
          borderWidth: 2,
          pointRadius: 4,
          pointBackgroundColor: "#f85149",
          fill: false,
          tension: 0.1,
        },
      ],
    },
    options: {
      ...CHART_DEFAULTS,
      plugins: {
        ...CHART_DEFAULTS.plugins,
        tooltip: {
          ...CHART_DEFAULTS.plugins.tooltip,
          callbacks: {
            label: ctx => `${ctx.dataset.label}: ₹${ctx.parsed.y?.toFixed(2) ?? "—"}`,
          },
        },
      },
    },
  });
  return _predChart;
}

export function renderCorrelationHeatmap(symbols, matrix) {
  destroyChart(_heatmapChart);
  const n = symbols.length;
  const cellSize = 32;
  const labelPad = 80;
  const size = n * cellSize + labelPad;

  const canvas = document.getElementById("heatmap-chart");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#161b22";
  ctx.fillRect(0, 0, size, size);

  ctx.font = "10px -apple-system, sans-serif";
  ctx.fillStyle = "#8b949e";
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";

  for (let i = 0; i < n; i++) {
    ctx.fillText(symbols[i].replace(".NS", ""), labelPad - 4, labelPad + i * cellSize + cellSize / 2);
  }
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  for (let j = 0; j < n; j++) {
    ctx.save();
    ctx.translate(labelPad + j * cellSize + cellSize / 2, labelPad - 4);
    ctx.rotate(-Math.PI / 4);
    ctx.fillText(symbols[j].replace(".NS", ""), 0, 0);
    ctx.restore();
  }

  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const val = matrix[i]?.[j];
      const x = labelPad + j * cellSize;
      const y = labelPad + i * cellSize;

      if (val === null || val === undefined) {
        ctx.fillStyle = "#21262d";
      } else {
        const abs = Math.abs(val);
        if (val >= 0) {
          ctx.fillStyle = `rgba(63,185,80,${0.1 + abs * 0.85})`;
        } else {
          ctx.fillStyle = `rgba(248,81,73,${0.1 + abs * 0.85})`;
        }
      }
      ctx.fillRect(x, y, cellSize - 1, cellSize - 1);

      if (val !== null && val !== undefined) {
        ctx.fillStyle = Math.abs(val) > 0.6 ? "#fff" : "#8b949e";
        ctx.font = "8px -apple-system, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(val.toFixed(2), x + cellSize / 2, y + cellSize / 2);
      }
    }
  }
}

window.Charts = { renderPriceChart, renderCompareChart, renderPredictionChart, renderCorrelationHeatmap };
