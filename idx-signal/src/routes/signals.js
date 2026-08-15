// /api/signals — indikator on-demand + scanner otomatis
//
// GET /api/signals/:symbol            -> snapshot indikator + sinyal aktif + seri utk chart
// Scanner: scanWatchlist() dipanggil dari server.js tiap 15 menit saat jam
// bursa, otomatis mencatat sinyal baru ke jurnal (dedup per hari per rule).

import { Router } from 'express';
import { readFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { fetchBars } from './market.js';
import { computeIndicators, evaluateRules } from '../indicators.js';
import { logSignal, getSignals } from '../journal.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = path.join(__dirname, '..', '..', 'config', 'strategy.json');

const router = Router();

async function loadConfig() {
  return JSON.parse(await readFile(CONFIG_PATH, 'utf8'));
}

export async function analyzeSymbol(symbol) {
  const config = await loadConfig();
  const bars = await fetchBars(symbol, '1d', '6mo');
  if (bars.length < 40) throw new Error(`Data ${symbol} terlalu pendek (${bars.length} bar)`);
  const { snapshot, series } = computeIndicators(bars, config.rules);
  const signals = evaluateRules(snapshot, config.rules);
  return { symbol, configVersion: config.version, snapshot, signals, series };
}

router.get('/:symbol', async (req, res) => {
  try {
    res.json(await analyzeSymbol(req.params.symbol));
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

/**
 * Scan watchlist, catat sinyal BARU ke jurnal.
 * Dedup: satu rule per simbol per hari — kalau RSI oversold bertahan seharian,
 * cukup satu entri jurnal, bukan satu tiap 15 menit.
 */
export async function scanWatchlist(watchlist) {
  const today = new Date().toISOString().slice(0, 10);
  const existing = await getSignals();
  const todayKeys = new Set(
    existing
      .filter(s => s.at.startsWith(today))
      .map(s => `${s.symbol}|${s.source}`)
  );

  const logged = [];
  for (const symbol of watchlist) {
    try {
      const { snapshot, signals, configVersion } = await analyzeSymbol(symbol);
      for (const sig of signals) {
        const key = `${symbol}|${sig.source}`;
        if (todayKeys.has(key)) continue;
        todayKeys.add(key);
        const entry = await logSignal({
          symbol,
          signal: sig.signal,
          source: sig.source,
          price: snapshot.close,
          indicators: {
            rsi: snapshot.rsi,
            macdHist: snapshot.macdHist,
            ema: snapshot.ema,
            volumeRatio: snapshot.volumeRatio,
          },
          configVersion,
          reason: sig.reason,
        });
        logged.push(entry);
      }
    } catch (err) {
      console.error(`[scan] ${symbol}: ${err.message}`);
    }
  }
  return logged;
}

export default router;
