const PURPLE = "#7c3aed";
const TEAL   = "#0ea5e9";
const PINK   = "#ec4899";
const GREEN  = "#10b981";
const AMBER  = "#f59e0b";

const BASE_OPTS = {
  responsive: true,
  maintainAspectRatio: false,
  interaction: { mode: "index", intersect: false },
  animation: { duration: 400 },
  plugins: {
    legend: { display: false },
    tooltip: {
      backgroundColor: "rgba(255,255,255,0.97)",
      borderColor: "rgba(124,58,237,0.18)",
      borderWidth: 1,
      titleColor: "#1e1b4b",
      bodyColor: "#4c4a7c",
      padding: 14,
      cornerRadius: 12,
      titleFont: { weight: "700", size: 13 },
      bodyFont: { size: 12 },
    },
  },
  scales: {
    x: {
      type: "time",
      time: { tooltipFormat: "dd MMM yyyy" },
      ticks: { color: "#9b98c4", maxTicksLimit: 8, font: { size: 11 } },
      grid: { color: "rgba(124,58,237,0.04)" },
      border: { color: "rgba(124,58,237,0.10)" },
    },
    y: {
      ticks: { color: "#9b98c4", font: { size: 11 } },
      grid: { color: "rgba(124,58,237,0.04)" },
      border: { color: "rgba(124,58,237,0.10)" },
    },
  },
};

let _priceChart  = null;
let _volChart    = null;
let _compareChart = null;
let _predChart   = null;
let _heatmapChart = null;

function destroy(c) { if (c) { try { c.destroy(); } catch (_) {} } }

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

export function renderPriceChart(data) {
  destroy(_priceChart);
  destroy(_volChart);

  const labels = data.map(d => d.date);
  const closes = data.map(d => d.close);
  const ma7    = data.map(d => d.ma_7);
  const ma30   = data.map(d => d.ma_30);
  const vols   = data.map(d => d.volume);
  const maxVol = Math.max(...vols.filter(Boolean));

  // ── Price chart ──────────────────────────────────────────
  const priceCtx = document.getElementById("price-chart").getContext("2d");

  const gradient = priceCtx.createLinearGradient(0, 0, 0, 340);
  gradient.addColorStop(0, "rgba(124,58,237,0.18)");
  gradient.addColorStop(1, "rgba(124,58,237,0.00)");

  _priceChart = new Chart(priceCtx, {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: "Close",
          data: closes,
          borderColor: PURPLE,
          backgroundColor: gradient,
          borderWidth: 2.5,
          pointRadius: 0,
          pointHoverRadius: 6,
          pointHoverBackgroundColor: PURPLE,
          pointHoverBorderColor: "#fff",
          pointHoverBorderWidth: 2,
          fill: true,
          tension: 0.3,
        },
        {
          label: "MA 7",
          data: ma7,
          borderColor: TEAL,
          borderWidth: 1.5,
          borderDash: [5, 4],
          pointRadius: 0,
          fill: false,
          tension: 0.3,
        },
        {
          label: "MA 30",
          data: ma30,
          borderColor: PINK,
          borderWidth: 1.5,
          borderDash: [8, 4],
          pointRadius: 0,
          fill: false,
          tension: 0.3,
        },
      ],
    },
    options: {
      ...BASE_OPTS,
      plugins: {
        ...BASE_OPTS.plugins,
        tooltip: {
          ...BASE_OPTS.plugins.tooltip,
          callbacks: {
            title: items => {
              const i = items[0].dataIndex;
              const d = data[i];
              return `${items[0].label}  O:${fmtINR(d.open)}  H:${fmtINR(d.high)}  L:${fmtINR(d.low)}`;
            },
            label: ctx => {
              const map = { "Close": PURPLE, "MA 7": TEAL, "MA 30": PINK };
              return `  ${ctx.dataset.label}: ${fmtINR(ctx.parsed.y)}`;
            },
            afterBody: items => {
              const i = items[0].dataIndex;
              const ret = data[i]?.daily_return;
              if (ret == null) return [];
              const sign = ret >= 0 ? "▲" : "▼";
              return [`  Return: ${sign} ${Math.abs(ret * 100).toFixed(2)}%`];
            },
          },
        },
      },
    },
  });

  // ── Volume chart ─────────────────────────────────────────
  const volCtx = document.getElementById("volume-chart").getContext("2d");
  const volColors = data.map((d, i) => {
    if (i === 0) return "rgba(124,58,237,0.35)";
    const prev = data[i - 1]?.close ?? d.close;
    return d.close >= prev ? "rgba(16,185,129,0.50)" : "rgba(244,63,94,0.50)";
  });

  _volChart = new Chart(volCtx, {
    type: "bar",
    data: {
      labels,
      datasets: [{
        label: "Volume",
        data: vols,
        backgroundColor: volColors,
        borderColor: "transparent",
        borderRadius: 2,
        borderSkipped: false,
      }],
    },
    options: {
      ...BASE_OPTS,
      plugins: {
        ...BASE_OPTS.plugins,
        tooltip: {
          ...BASE_OPTS.plugins.tooltip,
          callbacks: {
            label: ctx => `  Volume: ${fmtVol(ctx.parsed.y)}`,
          },
        },
      },
      scales: {
        x: { ...BASE_OPTS.scales.x, ticks: { display: false } },
        y: {
          ticks: { color: "#9b98c4", font: { size: 10 }, maxTicksLimit: 3,
            callback: v => fmtVol(v) },
          grid: { color: "rgba(124,58,237,0.04)" },
          border: { color: "rgba(124,58,237,0.10)" },
        },
      },
    },
  });

  // Build custom legend
  buildPriceLegend([
    { label: "Close", color: PURPLE, dash: false },
    { label: "MA 7",  color: TEAL,   dash: true },
    { label: "MA 30", color: PINK,   dash: true },
  ]);
}

function buildPriceLegend(items) {
  const el = document.getElementById("price-legend");
  if (!el) return;
  el.innerHTML = items.map(({ label, color, dash }) => `
    <span class="legend-item">
      <span class="legend-line" style="background:${color};${dash ? "opacity:.7" : ""}"></span>
      ${label}
    </span>`).join("");
}

export function renderCompareChart(sym1, data1, sym2, data2, normalized = false) {
  destroy(_compareChart);
  const ctx = document.getElementById("compare-chart").getContext("2d");

  const map1 = Object.fromEntries(data1.map(d => [d.date, d.close]));
  const map2 = Object.fromEntries(data2.map(d => [d.date, d.close]));
  const allLabels = [...new Set([...data1.map(d => d.date), ...data2.map(d => d.date)])].sort();

  let series1 = allLabels.map(d => map1[d] ?? null);
  let series2 = allLabels.map(d => map2[d] ?? null);

  if (normalized) {
    const base1 = series1.find(v => v != null) ?? 1;
    const base2 = series2.find(v => v != null) ?? 1;
    series1 = series1.map(v => v != null ? +((v / base1 - 1) * 100).toFixed(4) : null);
    series2 = series2.map(v => v != null ? +((v / base2 - 1) * 100).toFixed(4) : null);
  }

  const fmtLabel = (v, sym) => normalized
    ? `  ${sym}: ${v >= 0 ? "+" : ""}${v?.toFixed(2)}%`
    : `  ${sym}: ${fmtINR(v)}`;

  _compareChart = new Chart(ctx, {
    type: "line",
    data: {
      labels: allLabels,
      datasets: [
        {
          label: sym1,
          data: series1,
          borderColor: PURPLE,
          backgroundColor: "rgba(124,58,237,.07)",
          borderWidth: 2.5,
          pointRadius: 0,
          pointHoverRadius: 5,
          fill: true,
          tension: 0.3,
          yAxisID: normalized ? "y" : "y",
        },
        {
          label: sym2,
          data: series2,
          borderColor: TEAL,
          backgroundColor: "rgba(14,165,233,.07)",
          borderWidth: 2.5,
          pointRadius: 0,
          pointHoverRadius: 5,
          fill: true,
          tension: 0.3,
          yAxisID: normalized ? "y" : "y1",
        },
      ],
    },
    options: {
      ...BASE_OPTS,
      plugins: {
        ...BASE_OPTS.plugins,
        legend: {
          display: true,
          labels: { color: "#4c4a7c", boxWidth: 10, font: { size: 12 }, usePointStyle: true },
        },
        tooltip: {
          ...BASE_OPTS.plugins.tooltip,
          callbacks: {
            label: ctx => fmtLabel(ctx.parsed.y, ctx.dataset.label),
          },
        },
      },
      scales: normalized
        ? {
          x: BASE_OPTS.scales.x,
          y: {
            ...BASE_OPTS.scales.y,
            ticks: {
              ...BASE_OPTS.scales.y.ticks,
              callback: v => (v >= 0 ? "+" : "") + v.toFixed(1) + "%",
            },
          },
        }
        : {
          x: BASE_OPTS.scales.x,
          y: {
            ...BASE_OPTS.scales.y,
            position: "left",
            title: { display: true, text: sym1, color: PURPLE, font: { size: 11 } },
          },
          y1: {
            ...BASE_OPTS.scales.y,
            position: "right",
            grid: { drawOnChartArea: false },
            title: { display: true, text: sym2, color: TEAL, font: { size: 11 } },
          },
        },
    },
  });
}

export function renderPredictionChart(histData, predictions) {
  destroy(_predChart);
  const ctx = document.getElementById("prediction-chart").getContext("2d");

  const histLabels = histData.slice(-30).map(d => d.date);
  const histClose  = histData.slice(-30).map(d => d.close);
  const predLabels = predictions.map(p => p.date);
  const predClose  = predictions.map(p => p.predicted_close);

  const bridge = histClose[histClose.length - 1];
  const predWithBridge  = [bridge, ...predClose];
  const labelsWithBridge = [histLabels[histLabels.length - 1], ...predLabels];

  const allLabels = [...histLabels, ...predLabels.filter(d => !histLabels.includes(d))];

  _predChart = new Chart(ctx, {
    type: "line",
    data: {
      datasets: [
        {
          label: "Historical",
          data: histLabels.map((d, i) => ({ x: d, y: histClose[i] })),
          borderColor: PURPLE,
          backgroundColor: "rgba(124,58,237,.08)",
          borderWidth: 2.5,
          pointRadius: 0,
          pointHoverRadius: 5,
          fill: true,
          tension: 0.3,
        },
        {
          label: "AI Forecast",
          data: labelsWithBridge.map((d, i) => ({ x: d, y: predWithBridge[i] })),
          borderColor: TEAL,
          borderDash: [7, 4],
          borderWidth: 2.5,
          pointRadius: (ctx) => ctx.dataIndex === 0 ? 0 : 6,
          pointBackgroundColor: TEAL,
          pointBorderColor: "#fff",
          pointBorderWidth: 2,
          fill: false,
          tension: 0.2,
        },
        {
          label: "Forecast Band",
          data: labelsWithBridge.map((d, i) => ({
            x: d,
            y: i === 0 ? null : predWithBridge[i] * 1.015,
          })),
          borderColor: "transparent",
          backgroundColor: "rgba(14,165,233,0.08)",
          borderWidth: 0,
          pointRadius: 0,
          fill: "+1",
          tension: 0.2,
        },
        {
          label: "_band_low",
          data: labelsWithBridge.map((d, i) => ({
            x: d,
            y: i === 0 ? null : predWithBridge[i] * 0.985,
          })),
          borderColor: "transparent",
          backgroundColor: "rgba(14,165,233,0.08)",
          borderWidth: 0,
          pointRadius: 0,
          fill: false,
          tension: 0.2,
        },
      ],
    },
    options: {
      ...BASE_OPTS,
      plugins: {
        ...BASE_OPTS.plugins,
        legend: {
          display: true,
          labels: {
            color: "#4c4a7c",
            filter: item => !item.text.startsWith("_") && item.text !== "Forecast Band",
            usePointStyle: true,
          },
        },
        tooltip: {
          ...BASE_OPTS.plugins.tooltip,
          filter: item => !item.dataset.label.startsWith("_") && item.dataset.label !== "Forecast Band",
          callbacks: {
            label: ctx => `  ${ctx.dataset.label}: ${fmtINR(ctx.parsed.y)}`,
          },
        },
      },
    },
  });
}

export function renderCorrelationHeatmap(symbols, matrix) {
  const n = symbols.length;
  const cellSize = 34;
  const labelPad = 88;
  const w = n * cellSize + labelPad;
  const h = n * cellSize + labelPad;

  const canvas = document.getElementById("heatmap-chart");
  canvas.width  = w;
  canvas.height = h;
  canvas.style.maxWidth = "100%";
  const ctx = canvas.getContext("2d");

  ctx.clearRect(0, 0, w, h);

  const shortNames = symbols.map(s => s.replace(".NS", ""));

  // Row labels (left)
  ctx.font = "bold 10px Inter, sans-serif";
  ctx.fillStyle = "#4c4a7c";
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  for (let i = 0; i < n; i++) {
    ctx.fillText(shortNames[i], labelPad - 8, labelPad + i * cellSize + cellSize / 2);
  }

  // Column labels (top, rotated)
  ctx.textAlign = "left";
  ctx.textBaseline = "bottom";
  for (let j = 0; j < n; j++) {
    ctx.save();
    ctx.translate(labelPad + j * cellSize + cellSize / 2, labelPad - 6);
    ctx.rotate(-Math.PI / 4);
    ctx.fillText(shortNames[j], 0, 0);
    ctx.restore();
  }

  // Cells
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const val = matrix[i]?.[j];
      const x = labelPad + j * cellSize;
      const y = labelPad + i * cellSize;
      const gap = 2;

      if (i === j) {
        ctx.fillStyle = "rgba(124,58,237,0.65)";
      } else if (val == null) {
        ctx.fillStyle = "#f0eeff";
      } else {
        const abs = Math.abs(val);
        ctx.fillStyle = val >= 0
          ? `rgba(16,185,129,${0.08 + abs * 0.72})`
          : `rgba(244,63,94,${0.08 + abs * 0.72})`;
      }

      ctx.beginPath();
      ctx.roundRect(x + gap / 2, y + gap / 2, cellSize - gap, cellSize - gap, 4);
      ctx.fill();

      // Value text
      if (val != null) {
        ctx.fillStyle = (i === j || Math.abs(val) > 0.6) ? "#fff" : "#4c4a7c";
        ctx.font = `${i === j ? "bold " : ""}9px Inter, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(i === j ? "1" : val.toFixed(2), x + cellSize / 2, y + cellSize / 2);
      }
    }
  }

  // Colour legend
  const lgX = labelPad;
  const lgY = h - 18;
  const lgW = n * cellSize;
  const lgH = 8;
  const grad = ctx.createLinearGradient(lgX, 0, lgX + lgW, 0);
  grad.addColorStop(0,   "rgba(244,63,94,0.80)");
  grad.addColorStop(0.5, "rgba(200,200,220,0.30)");
  grad.addColorStop(1,   "rgba(16,185,129,0.80)");
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.roundRect(lgX, lgY, lgW, lgH, 4);
  ctx.fill();

  ctx.fillStyle = "#9b98c4";
  ctx.font = "9px Inter, sans-serif";
  ctx.textAlign = "left";   ctx.fillText("-1", lgX, lgY + lgH + 10);
  ctx.textAlign = "center"; ctx.fillText("0",  lgX + lgW / 2, lgY + lgH + 10);
  ctx.textAlign = "right";  ctx.fillText("+1", lgX + lgW,     lgY + lgH + 10);
}

window.Charts = { renderPriceChart, renderCompareChart, renderPredictionChart, renderCorrelationHeatmap };
