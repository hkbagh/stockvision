const C = {
  blue:   "#2563eb",
  teal:   "#0891b2",
  green:  "#059669",
  red:    "#dc2626",
  amber:  "#d97706",
  purple: "#7c3aed",
  muted:  "#94a3b8",
  border: "#e2e8f0",
};

const BASE = {
  responsive: true,
  maintainAspectRatio: false,
  animation: { duration: 300 },
  interaction: { mode: "index", intersect: false },
  plugins: {
    legend: { display: false },
    tooltip: {
      backgroundColor: "#0f172a",
      borderColor: "#1e293b",
      borderWidth: 1,
      titleColor: "#f1f5f9",
      bodyColor:  "#cbd5e1",
      padding: 12,
      cornerRadius: 8,
      titleFont: { weight: "700", size: 12 },
      bodyFont: { size: 11 },
      displayColors: true,
      boxWidth: 8, boxHeight: 8, boxPadding: 4,
    },
  },
  scales: {
    x: {
      type: "time",
      time: {
        tooltipFormat: "dd MMM yyyy",
        displayFormats: {
          hour:  "HH:mm",
          day:   "dd MMM",
          week:  "dd MMM",
          month: "MMM yyyy",
        },
      },
      ticks: { color: C.muted, maxTicksLimit: 8, font: { size: 10 } },
      grid: { color: "#f1f5f9" },
      border: { color: C.border },
    },
    y: {
      ticks: { color: C.muted, font: { size: 10 } },
      grid: { color: "#f1f5f9" },
      border: { color: C.border },
    },
  },
};

let _price = null, _vol = null, _compare = null, _forecast = null;

function dc(c) { if (c) { try { c.destroy(); } catch (_) {} } }

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

export function renderPriceChart(data) {
  dc(_price); dc(_vol);
  if (!data || data.length === 0) return;

  const priceEl = document.getElementById("price-chart");
  const volEl   = document.getElementById("volume-chart");
  if (!priceEl || !volEl) return;

  const isUp = d => (d.close ?? 0) >= (d.open ?? d.close ?? 0);

  // ── Custom canvas plugin: draws real candlestick bodies + wicks ──
  const candlePlugin = {
    id: "candles",
    afterDatasetsDraw(chart) {
      const { ctx, scales: { x, y } } = chart;
      if (!x || !y || !data.length) return;

      let bw = 6;
      if (data.length > 1) {
        const dx = Math.abs(
          x.getPixelForValue(data[1].date) - x.getPixelForValue(data[0].date)
        );
        bw = Math.max(2, Math.min(16, dx * 0.55));
      }

      data.forEach(d => {
        const px = x.getPixelForValue(d.date);
        const o  = d.open  ?? d.close;
        const h  = d.high  ?? d.close;
        const l  = d.low   ?? d.close;
        const c  = d.close;
        const up    = c >= o;
        const col   = up ? "#059669" : "#dc2626";
        const fill  = up ? "rgba(5,150,105,0.82)" : "rgba(220,38,38,0.82)";

        const hPx = y.getPixelForValue(h);
        const lPx = y.getPixelForValue(l);
        const oPx = y.getPixelForValue(o);
        const cPx = y.getPixelForValue(c);

        ctx.save();
        ctx.strokeStyle = col;
        ctx.lineWidth   = 1;

        // High-low wick
        ctx.beginPath();
        ctx.moveTo(px, hPx);
        ctx.lineTo(px, lPx);
        ctx.stroke();

        // Open-close body
        const top = Math.min(oPx, cPx);
        const bh  = Math.max(Math.abs(oPx - cPx), 1.5);
        ctx.fillStyle = fill;
        ctx.fillRect(  px - bw / 2, top, bw, bh);
        ctx.strokeRect(px - bw / 2, top, bw, bh);

        ctx.restore();
      });
    },
  };

  // ── Invisible datasets to anchor Y-axis to full OHLC range ──
  const hidden = (pts) => ({
    data: pts, borderWidth: 0, pointRadius: 0, fill: false,
    borderColor: "transparent", backgroundColor: "transparent",
  });

  _price = new Chart(priceEl.getContext("2d"), {
    type: "line",
    data: {
      datasets: [
        { label: "_h", ...hidden(data.map(d => ({ x: d.date, y: d.high  ?? d.close }))) },
        { label: "_l", ...hidden(data.map(d => ({ x: d.date, y: d.low   ?? d.close }))) },
        { label: "_c", ...hidden(data.map(d => ({ x: d.date, y: d.close }))) },
        {
          label: "MA 7",
          data: data.map(d => ({ x: d.date, y: d.ma_7 })),
          borderColor: C.teal, borderWidth: 1.5, borderDash: [4, 3],
          pointRadius: 0, fill: false, tension: 0.3,
        },
        {
          label: "MA 30",
          data: data.map(d => ({ x: d.date, y: d.ma_30 })),
          borderColor: C.amber, borderWidth: 1.5, borderDash: [7, 3],
          pointRadius: 0, fill: false, tension: 0.3,
        },
      ],
    },
    plugins: [candlePlugin],
    options: {
      ...BASE,
      plugins: {
        ...BASE.plugins,
        tooltip: {
          ...BASE.plugins.tooltip,
          filter: item => !item.dataset.label.startsWith("_"),
          callbacks: {
            title: items => items[0]?.label ?? "",
            beforeBody: items => {
              const d = data[items[0]?.dataIndex];
              if (!d) return [];
              const ret = d.daily_return;
              const r = ret != null
                ? `  ${ret >= 0 ? "▲" : "▼"} ${Math.abs(ret * 100).toFixed(2)}%`
                : "";
              return [
                ` O ${fINR(d.open)}   H ${fINR(d.high)}`,
                ` C ${fINR(d.close)}  L ${fINR(d.low)}${r}`,
                ` Vol ${fVol(d.volume)}`,
                "─────────────────────",
              ];
            },
            label: ctx => ` ${ctx.dataset.label}: ${fINR(ctx.parsed.y)}`,
          },
        },
      },
      scales: {
        x: { ...BASE.scales.x },
        y: {
          ...BASE.scales.y,
          ticks: {
            color: C.muted, font: { size: 10 },
            callback: v => "₹" + Number(v).toLocaleString("en-IN"),
          },
        },
      },
    },
  });

  // ── Volume chart ───────────────────────────────────
  _vol = new Chart(volEl.getContext("2d"), {
    type: "bar",
    data: {
      datasets: [{
        label: "Volume",
        data: data.map(d => ({ x: d.date, y: d.volume })),
        backgroundColor: data.map(d => isUp(d) ? "rgba(5,150,105,0.55)" : "rgba(220,38,38,0.55)"),
        borderWidth: 0, borderRadius: 1, barPercentage: 0.8, categoryPercentage: 0.9,
      }],
    },
    options: {
      ...BASE,
      plugins: {
        ...BASE.plugins,
        tooltip: {
          ...BASE.plugins.tooltip,
          callbacks: { label: ctx => ` Vol: ${fVol(ctx.parsed.y)}` },
        },
      },
      scales: {
        x: { ...BASE.scales.x, ticks: { display: false }, grid: { display: false } },
        y: {
          ticks: { color: C.muted, font: { size: 9 }, maxTicksLimit: 3, callback: v => fVol(v) },
          grid: { color: "#f8fafc" },
          border: { color: C.border },
        },
      },
    },
  });

  // ── Legend ─────────────────────────────────────────
  const leg = document.getElementById("price-legend");
  if (leg) {
    leg.innerHTML = [
      { label: "Up day",   color: C.green, type: "box" },
      { label: "Down day", color: C.red,   type: "box" },
      { label: "MA 7",     color: C.teal,  type: "dash" },
      { label: "MA 30",    color: C.amber, type: "dash" },
    ].map(({ label, color, type }) => `
      <span class="legend-item">
        <span class="${type === "box" ? "legend-box" : "legend-dash"}" style="background:${color}"></span>
        ${label}
      </span>`).join("");
  }
}

export function renderCompareChart(sym1, data1, sym2, data2, normalized = false) {
  dc(_compare);
  const el = document.getElementById("compare-chart");
  if (!el) return;

  const map1 = Object.fromEntries(data1.map(d => [d.date, d.close]));
  const map2 = Object.fromEntries(data2.map(d => [d.date, d.close]));
  const labels = [...new Set([...data1.map(d => d.date), ...data2.map(d => d.date)])].sort();

  let s1 = labels.map(d => map1[d] ?? null);
  let s2 = labels.map(d => map2[d] ?? null);

  if (normalized) {
    const b1 = s1.find(v => v != null) ?? 1;
    const b2 = s2.find(v => v != null) ?? 1;
    s1 = s1.map(v => v != null ? +((v / b1 - 1) * 100).toFixed(3) : null);
    s2 = s2.map(v => v != null ? +((v / b2 - 1) * 100).toFixed(3) : null);
  }

  const fLbl = (v, sym) => normalized
    ? ` ${sym}: ${v >= 0 ? "+" : ""}${v?.toFixed(2)}%`
    : ` ${sym}: ${fINR(v)}`;

  const yScales = normalized
    ? { y: { ...BASE.scales.y, ticks: { ...BASE.scales.y.ticks, callback: v => (v >= 0 ? "+" : "") + v.toFixed(1) + "%" } } }
    : {
        y:  { ...BASE.scales.y, position: "left",  title: { display: true, text: sym1, color: C.blue,   font: { size: 10 } } },
        y1: { ...BASE.scales.y, position: "right", grid: { drawOnChartArea: false },
              title: { display: true, text: sym2, color: C.purple, font: { size: 10 } } },
      };

  _compare = new Chart(el.getContext("2d"), {
    type: "line",
    data: {
      labels,
      datasets: [
        { label: sym1, data: s1, borderColor: C.blue,   backgroundColor: "rgba(37,99,235,.06)",  borderWidth: 2, pointRadius: 0, fill: true, tension: 0.25, yAxisID: normalized ? "y" : "y" },
        { label: sym2, data: s2, borderColor: C.purple, backgroundColor: "rgba(124,58,237,.06)", borderWidth: 2, pointRadius: 0, fill: true, tension: 0.25, yAxisID: normalized ? "y" : "y1" },
      ],
    },
    options: {
      ...BASE,
      plugins: {
        ...BASE.plugins,
        legend: { display: true, labels: { color: "#475569", boxWidth: 8, font: { size: 11 }, usePointStyle: true } },
        tooltip: { ...BASE.plugins.tooltip, callbacks: { label: ctx => fLbl(ctx.parsed.y, ctx.dataset.label) } },
      },
      scales: { x: BASE.scales.x, ...yScales },
    },
  });
}

export function renderForecastChart(histData, predictions) {
  dc(_forecast);
  const el = document.getElementById("forecast-chart");
  if (!el) return;

  const hist30 = histData.slice(-60);
  const hLabels = hist30.map(d => d.date);
  const hClose  = hist30.map(d => d.close);

  const pLabels = predictions.map(p => p.date);
  const pClose  = predictions.map(p => p.predicted_close);

  const bridge = hClose[hClose.length - 1];
  const pWithBridge  = [bridge, ...pClose];
  const lWithBridge  = [hLabels[hLabels.length - 1], ...pLabels];

  const ctx = el.getContext("2d");
  const gradH = ctx.createLinearGradient(0, 0, 0, 320);
  gradH.addColorStop(0, "rgba(37,99,235,0.12)");
  gradH.addColorStop(1, "rgba(37,99,235,0.00)");

  _forecast = new Chart(ctx, {
    type: "line",
    data: {
      datasets: [
        {
          label: "Historical",
          data: hLabels.map((d, i) => ({ x: d, y: hClose[i] })),
          borderColor: C.blue,
          backgroundColor: gradH,
          borderWidth: 2,
          pointRadius: 0,
          pointHoverRadius: 4,
          fill: true, tension: 0.25,
        },
        {
          label: "AI Forecast",
          data: lWithBridge.map((d, i) => ({ x: d, y: pWithBridge[i] })),
          borderColor: C.green,
          borderDash: [6, 3],
          borderWidth: 2.5,
          pointRadius: (c) => c.dataIndex === 0 ? 0 : 5,
          pointBackgroundColor: C.green,
          pointBorderColor: "#fff",
          pointBorderWidth: 2,
          fill: false, tension: 0.2,
        },
        {
          label: "_hi",
          data: lWithBridge.map((d, i) => ({ x: d, y: i === 0 ? null : pWithBridge[i] * 1.02 })),
          borderColor: "transparent",
          backgroundColor: "rgba(5,150,105,0.07)",
          borderWidth: 0, pointRadius: 0,
          fill: "+1", tension: 0.2,
        },
        {
          label: "_lo",
          data: lWithBridge.map((d, i) => ({ x: d, y: i === 0 ? null : pWithBridge[i] * 0.98 })),
          borderColor: "transparent",
          backgroundColor: "rgba(5,150,105,0.07)",
          borderWidth: 0, pointRadius: 0,
          fill: false, tension: 0.2,
        },
      ],
    },
    options: {
      ...BASE,
      plugins: {
        ...BASE.plugins,
        legend: {
          display: true,
          labels: {
            color: "#475569", font: { size: 11 }, usePointStyle: true,
            filter: item => !item.text.startsWith("_"),
          },
        },
        tooltip: {
          ...BASE.plugins.tooltip,
          filter: item => !item.dataset.label.startsWith("_"),
          callbacks: {
            label: ctx => ` ${ctx.dataset.label}: ${fINR(ctx.parsed.y)}`,
          },
        },
      },
    },
  });
}

export function renderCorrelationHeatmap(symbols, matrix) {
  const n   = symbols.length;
  const cell = 36;
  const pad  = 90;
  const W = n * cell + pad;
  const H = n * cell + pad + 24;

  const canvas = document.getElementById("heatmap-chart");
  canvas.width  = W;
  canvas.height = H;
  canvas.style.maxWidth = "100%";
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, W, H);

  const names = symbols.map(s => s.replace(".NS", ""));

  // Row labels
  ctx.font = "600 10px Inter,sans-serif";
  ctx.fillStyle = "#475569";
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  for (let i = 0; i < n; i++) {
    ctx.fillText(names[i], pad - 8, pad + i * cell + cell / 2);
  }

  // Col labels (rotated)
  ctx.textAlign = "left"; ctx.textBaseline = "bottom";
  for (let j = 0; j < n; j++) {
    ctx.save();
    ctx.translate(pad + j * cell + cell / 2, pad - 6);
    ctx.rotate(-Math.PI / 4);
    ctx.fillText(names[j], 0, 0);
    ctx.restore();
  }

  // Cells
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const val = matrix[i]?.[j];
      const x = pad + j * cell + 1;
      const y = pad + i * cell + 1;
      const sz = cell - 2;
      const r = 5;

      if (i === j) {
        ctx.fillStyle = "#1d4ed8";
      } else if (val == null) {
        ctx.fillStyle = "#f1f5f9";
      } else {
        const abs = Math.abs(val);
        ctx.fillStyle = val >= 0
          ? `rgba(5,150,105,${0.1 + abs * 0.75})`
          : `rgba(220,38,38,${0.1 + abs * 0.75})`;
      }
      ctx.beginPath();
      ctx.roundRect(x, y, sz, sz, r);
      ctx.fill();

      if (val != null) {
        ctx.fillStyle = (i === j || Math.abs(val) > 0.55) ? "#fff" : "#475569";
        ctx.font = `${i === j ? "700 " : ""}9px Inter,sans-serif`;
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText(i === j ? "1.00" : val.toFixed(2), x + sz / 2, y + sz / 2);
      }
    }
  }

  // Legend
  const lx = pad, ly = H - 18, lw = n * cell;
  const grad = ctx.createLinearGradient(lx, 0, lx + lw, 0);
  grad.addColorStop(0,   "rgba(220,38,38,0.85)");
  grad.addColorStop(0.5, "rgba(203,213,225,0.4)");
  grad.addColorStop(1,   "rgba(5,150,105,0.85)");
  ctx.fillStyle = grad;
  ctx.beginPath(); ctx.roundRect(lx, ly, lw, 7, 3); ctx.fill();
  ctx.fillStyle = "#94a3b8"; ctx.font = "9px Inter,sans-serif";
  ctx.textAlign = "left";   ctx.fillText("-1",  lx,          ly + 7 + 9);
  ctx.textAlign = "center"; ctx.fillText("0",   lx + lw / 2, ly + 7 + 9);
  ctx.textAlign = "right";  ctx.fillText("+1",  lx + lw,     ly + 7 + 9);
}

window.Charts = { renderPriceChart, renderCompareChart, renderForecastChart, renderCorrelationHeatmap };
