// Evaluator — menilai sinyal lama terhadap pergerakan harga aktual.
// Dijalankan via cron harian (setelah pasar tutup) atau manual: POST /api/loop/evaluate

import { readFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { getSignals, attachOutcome } from './journal.js';
import { fetchBars } from './routes/market.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = path.join(__dirname, '..', 'config', 'strategy.json');

async function loadConfig() {
  return JSON.parse(await readFile(CONFIG_PATH, 'utf8'));
}

const DAY_MS = 86_400_000;

/**
 * Evaluasi semua sinyal yang horizonnya sudah lewat tapi belum dinilai.
 * Skor: return % dari harga sinyal ke harga close di horizon tsb.
 * "hit" untuk buy_watch = return >= hitThresholdPct;
 * "hit" untuk sell_watch = return <= -hitThresholdPct (harga memang turun).
 */
export async function evaluatePending() {
  const config = await loadConfig();
  const { horizonsDays, hitThresholdPct } = config.evaluation;
  const results = [];

  for (const days of horizonsDays) {
    const horizon = `${days}d`;
    const pending = await getSignals({ unevaluatedHorizon: horizon });

    for (const sig of pending) {
      const signalTime = new Date(sig.at).getTime();
      // Belum waktunya dievaluasi? Skip (pakai kalender sederhana; hari bursa
      // bisa diperketat nanti)
      if (Date.now() - signalTime < days * DAY_MS) continue;

      try {
        const bars = await fetchBars(sig.symbol, '1d', '1mo');
        // Cari bar close pertama pada/atau setelah target
        const targetSec = Math.floor((signalTime + days * DAY_MS) / 1000);
        const bar = bars.find(b => b.time >= targetSec) ?? bars[bars.length - 1];
        if (!bar) continue;

        const returnPct = ((bar.close - sig.price) / sig.price) * 100;
        const hit = sig.signal === 'buy_watch'
          ? returnPct >= hitThresholdPct
          : returnPct <= -hitThresholdPct;

        const outcome = {
          evaluatedAt: new Date().toISOString(),
          priceAtHorizon: bar.close,
          returnPct: Number(returnPct.toFixed(2)),
          hit,
        };
        await attachOutcome(sig.id, horizon, outcome);
        results.push({ id: sig.id, symbol: sig.symbol, horizon, ...outcome });
      } catch (err) {
        console.error(`[evaluate] ${sig.id} ${horizon}: ${err.message}`);
      }
    }
  }
  return results;
}

/**
 * Ringkasan performa — bahan mentah untuk review Claude.
 */
export async function performanceSummary() {
  const signals = await getSignals();
  const evaluated = signals.filter(s => Object.keys(s.outcomes).length > 0);

  const bySource = {};
  for (const sig of evaluated) {
    for (const [horizon, out] of Object.entries(sig.outcomes)) {
      const key = `${sig.source}|${sig.signal}|${horizon}`;
      bySource[key] ??= { count: 0, hits: 0, totalReturnPct: 0, configVersions: new Set() };
      const b = bySource[key];
      b.count++;
      if (out.hit) b.hits++;
      b.totalReturnPct += out.returnPct;
      b.configVersions.add(sig.configVersion);
    }
  }

  const rows = Object.entries(bySource).map(([key, b]) => {
    const [source, signal, horizon] = key.split('|');
    return {
      source, signal, horizon,
      count: b.count,
      hitRate: Number((b.hits / b.count).toFixed(2)),
      avgReturnPct: Number((b.totalReturnPct / b.count).toFixed(2)),
      configVersions: [...b.configVersions],
    };
  });

  return {
    totalSignals: signals.length,
    evaluated: evaluated.length,
    rows,
  };
}
