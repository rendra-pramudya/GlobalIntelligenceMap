// Jurnal sinyal — append-only log, dasar dari continuous improvement loop.
// Setiap sinyal dicatat DENGAN snapshot indikator saat itu, supaya evaluasi
// nanti bisa menjawab: "kondisi seperti apa yang menghasilkan sinyal bagus?"

import { readFile, writeFile, mkdir } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', 'data');
const JOURNAL_PATH = path.join(DATA_DIR, 'journal.json');

async function load() {
  try {
    return JSON.parse(await readFile(JOURNAL_PATH, 'utf8'));
  } catch {
    return { signals: [] };
  }
}

async function save(journal) {
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(JOURNAL_PATH, JSON.stringify(journal, null, 2));
}

/**
 * Catat satu sinyal.
 * @param {object} s
 * @param {string} s.symbol     mis. "BBCA.JK"
 * @param {"buy_watch"|"sell_watch"} s.signal
 * @param {string} s.source     "rule:rsi_oversold" | "claude" | dll
 * @param {number} s.price      harga saat sinyal terbit
 * @param {object} s.indicators snapshot: { rsi, macdHist, ema20, volumeRatio }
 * @param {number} s.configVersion versi strategy.json saat sinyal dibuat
 */
export async function logSignal(s) {
  const journal = await load();
  const entry = {
    id: `sig_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    at: new Date().toISOString(),
    ...s,
    outcomes: {}, // diisi evaluator: { "1d": {...}, "3d": {...}, "5d": {...} }
  };
  journal.signals.push(entry);
  await save(journal);
  return entry;
}

export async function getSignals(filter = {}) {
  const { signals } = await load();
  return signals.filter(s =>
    (!filter.symbol || s.symbol === filter.symbol) &&
    (!filter.unevaluatedHorizon || s.outcomes[filter.unevaluatedHorizon] === undefined)
  );
}

export async function attachOutcome(id, horizon, outcome) {
  const journal = await load();
  const sig = journal.signals.find(s => s.id === id);
  if (!sig) throw new Error(`Signal ${id} tidak ditemukan`);
  sig.outcomes[horizon] = outcome;
  await save(journal);
  return sig;
}
