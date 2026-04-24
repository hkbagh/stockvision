const API_BASE = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1"
  ? "http://localhost:8000"
  : `${window.location.protocol}//${window.location.host}/api`;

async function fetchJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} — ${url}`);
  return res.json();
}

export const Api = {
  getCompanies: () => fetchJSON(`${API_BASE}/companies`),
  getStockData: (sym, days = 30) => fetchJSON(`${API_BASE}/data/${encodeURIComponent(sym)}?days=${days}`),
  getSummary: (sym) => fetchJSON(`${API_BASE}/summary/${encodeURIComponent(sym)}`),
  compare: (s1, s2, days = 90) =>
    fetchJSON(`${API_BASE}/compare?symbol1=${encodeURIComponent(s1)}&symbol2=${encodeURIComponent(s2)}&days=${days}`),
  getTopGainers: (limit = 5) => fetchJSON(`${API_BASE}/top-gainers?limit=${limit}`),
  getCorrelation: () => fetchJSON(`${API_BASE}/correlation`),
  getPrediction: (sym) => fetchJSON(`${API_BASE}/predict/${encodeURIComponent(sym)}`),
  health: () => fetchJSON(`${API_BASE}/health`),
};

window.Api = Api;
