// /api/market — Yahoo Finance proxy (server-side fetch, hindari CORS)
// Format simbol IDX: {TICKER}.JK, contoh BBCA.JK

import { Router } from 'express';

const router = Router();
const YF_BASE = 'https://query1.finance.yahoo.com/v8/finance/chart';
const UA = 'Mozilla/5.0 (compatible; idx-signal/0.1)';

// Cache sederhana in-memory (TTL per interval)
const cache = new Map();
const TTL = { '1m': 30_000, '5m': 60_000, '15m': 60_000, '1d': 300_000, '1wk': 3_600_000 };

async function yfFetch(symbol, interval, range) {
  const key = `${symbol}:${interval}:${range}`;
  const hit = cache.get(key);
  const ttl = TTL[interval] ?? 300_000;
  if (hit && Date.now() - hit.at < ttl) return hit.data;

  const url = `${YF_BASE}/${encodeURIComponent(symbol)}?interval=${interval}&range=${range}`;
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`Yahoo Finance ${res.status} for ${symbol}`);
  const json = await res.json();
  const result = json?.chart?.result?.[0];
  if (!result) throw new Error(json?.chart?.error?.description || 'Empty chart result');

  cache.set(key, { at: Date.now(), data: result });
  return result;
}

function toOhlcv(result) {
  const ts = result.timestamp || [];
  const q = result.indicators?.quote?.[0] || {};
  const bars = [];
  for (let i = 0; i < ts.length; i++) {
    // Yahoo kadang kirim null di bar terakhir/gap — skip
    if (q.open?.[i] == null || q.close?.[i] == null) continue;
    bars.push({
      time: ts[i], // epoch seconds — format yang diterima Lightweight Charts
      open: q.open[i],
      high: q.high[i],
      low: q.low[i],
      close: q.close[i],
      volume: q.volume?.[i] ?? 0,
    });
  }
  return bars;
}

export async function fetchBars(symbol, interval = '1d', range = '1mo') {
  return toOhlcv(await yfFetch(symbol, interval, range));
}

export async function fetchQuote(symbol) {
  const result = await yfFetch(symbol, '1m', '1d');
  const meta = result.meta || {};
  return {
    price: meta.regularMarketPrice,
    prevClose: meta.chartPreviousClose ?? meta.previousClose,
    currency: meta.currency,
    exchange: meta.exchangeName,
    time: meta.regularMarketTime,
  };
}

// GET /api/market/ohlcv/BBCA.JK?interval=1d&range=6mo
router.get('/ohlcv/:symbol', async (req, res) => {
  const { symbol } = req.params;
  const interval = req.query.interval || '1d';
  const range = req.query.range || '6mo';
  try {
    const result = await yfFetch(symbol, interval, range);
    res.json({ symbol, interval, range, bars: toOhlcv(result), meta: result.meta });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// GET /api/market/quote/BBCA.JK
router.get('/quote/:symbol', async (req, res) => {
  try {
    res.json(await fetchQuote(req.params.symbol));
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

export default router;
