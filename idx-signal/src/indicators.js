// Fase 2 — Indicator engine.
// Hitung RSI/MACD/EMA/volume ratio dari bars, lalu evaluasi rules dari
// config/strategy.json menjadi sinyal buy_watch / sell_watch.

import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { RSI, MACD, EMA } = require('technicalindicators');

/**
 * @param {Array<{time,open,high,low,close,volume}>} bars  urut dari lama ke baru
 * @param {object} rules  config.rules dari strategy.json
 * @returns snapshot indikator terkini + seri lengkap untuk chart
 */
export function computeIndicators(bars, rules) {
  const closes = bars.map(b => b.close);
  const volumes = bars.map(b => b.volume);

  const rsiSeries = RSI.calculate({ values: closes, period: rules.rsi.period });
  const macdSeries = MACD.calculate({
    values: closes,
    fastPeriod: rules.macd.fast,
    slowPeriod: rules.macd.slow,
    signalPeriod: rules.macd.signal,
    SimpleMAOscillator: false,
    SimpleMASignal: false,
  });
  const emaSeries = EMA.calculate({ values: closes, period: rules.ema.period });

  // Rata-rata volume 20 bar terakhir (exclude bar terkini)
  const volWindow = volumes.slice(-21, -1);
  const avgVol = volWindow.length
    ? volWindow.reduce((a, b) => a + b, 0) / volWindow.length
    : 0;
  const volumeRatio = avgVol > 0 ? volumes[volumes.length - 1] / avgVol : 0;

  const last = (arr) => arr[arr.length - 1];
  const prev = (arr) => arr[arr.length - 2];

  const macdNow = last(macdSeries);
  const macdPrev = prev(macdSeries);

  return {
    snapshot: {
      close: last(closes),
      rsi: round2(last(rsiSeries)),
      rsiPrev: round2(prev(rsiSeries)),
      macdHist: round4(macdNow?.histogram),
      macdHistPrev: round4(macdPrev?.histogram),
      macdCrossUp: macdPrev?.histogram < 0 && macdNow?.histogram > 0,
      macdCrossDown: macdPrev?.histogram > 0 && macdNow?.histogram < 0,
      ema: round2(last(emaSeries)),
      priceAboveEma: last(closes) > last(emaSeries),
      volumeRatio: round2(volumeRatio),
    },
    series: {
      // Seri di-align ke timestamp bar untuk overlay di chart
      rsi: alignSeries(bars, rsiSeries),
      ema: alignSeries(bars, emaSeries),
      macdHist: alignSeries(bars, macdSeries.map(m => m.histogram)),
    },
  };
}

/** Evaluasi rules -> daftar sinyal. Satu snapshot bisa memicu beberapa rule. */
export function evaluateRules(snapshot, rules) {
  const signals = [];
  const s = snapshot;

  if (s.rsi != null && s.rsi < rules.rsi.oversold) {
    signals.push({
      signal: 'buy_watch',
      source: 'rule:rsi_oversold',
      reason: `RSI ${s.rsi} < ${rules.rsi.oversold}`,
    });
  }
  if (s.rsi != null && s.rsi > rules.rsi.overbought) {
    signals.push({
      signal: 'sell_watch',
      source: 'rule:rsi_overbought',
      reason: `RSI ${s.rsi} > ${rules.rsi.overbought}`,
    });
  }
  if (s.macdCrossUp) {
    signals.push({
      signal: 'buy_watch',
      source: 'rule:macd_cross_up',
      reason: `MACD histogram cross ke positif (${s.macdHistPrev} -> ${s.macdHist})`,
    });
  }
  if (s.macdCrossDown) {
    signals.push({
      signal: 'sell_watch',
      source: 'rule:macd_cross_down',
      reason: `MACD histogram cross ke negatif (${s.macdHistPrev} -> ${s.macdHist})`,
    });
  }
  // Volume spike memperkuat sinyal yang sudah ada, bukan sinyal sendiri
  if (s.volumeRatio >= rules.volumeSpikeMultiplier) {
    for (const sig of signals) {
      sig.reason += ` + volume ${s.volumeRatio}x rata-rata`;
      sig.volumeConfirmed = true;
    }
  }
  return signals;
}

function alignSeries(bars, series) {
  // Indikator lebih pendek dari bars (butuh warm-up) — align dari belakang
  const offset = bars.length - series.length;
  const out = [];
  for (let i = 0; i < series.length; i++) {
    if (series[i] == null) continue;
    out.push({ time: bars[i + offset].time, value: round4(series[i]) });
  }
  return out;
}

const round2 = (v) => (v == null ? null : Number(v.toFixed(2)));
const round4 = (v) => (v == null ? null : Number(v.toFixed(4)));
