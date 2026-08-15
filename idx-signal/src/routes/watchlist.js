// Watchlist persistent — satu sumber kebenaran untuk frontend, quote poller,
// dan scanner sinyal. Disimpan di config/watchlist.json.
//
// GET    /api/watchlist          -> daftar simbol
// POST   /api/watchlist          -> { symbol: "BMRI" }  (auto .JK, divalidasi ke Yahoo)
// DELETE /api/watchlist/:symbol  -> hapus

import { Router } from 'express';
import { readFile, writeFile, mkdir } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { fetchQuote } from './market.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WATCHLIST_PATH = path.join(__dirname, '..', '..', 'config', 'watchlist.json');
const DEFAULT = ['BBCA.JK', 'BBRI.JK', 'TLKM.JK', 'ASII.JK'];
const MAX_SYMBOLS = 30; // jaga-jaga: tiap simbol = request Yahoo tiap 15 dtk saat live

let symbols = null;

export async function getWatchlist() {
  if (symbols) return symbols;
  try {
    symbols = JSON.parse(await readFile(WATCHLIST_PATH, 'utf8')).symbols;
  } catch {
    symbols = [...DEFAULT];
    await save();
  }
  return symbols;
}

async function save() {
  await mkdir(path.dirname(WATCHLIST_PATH), { recursive: true });
  await writeFile(WATCHLIST_PATH, JSON.stringify({ symbols }, null, 2));
}

function normalize(raw) {
  const code = String(raw || '').trim().toUpperCase();
  if (!/^[A-Z]{2,6}(\.JK)?$/.test(code)) return null;
  return code.endsWith('.JK') ? code : `${code}.JK`;
}

const router = Router();

router.get('/', async (_req, res) => {
  res.json({ symbols: await getWatchlist() });
});

router.post('/', async (req, res) => {
  const symbol = normalize(req.body?.symbol);
  if (!symbol) {
    return res.status(400).json({ error: 'Kode saham tidak valid (contoh: BMRI atau BMRI.JK)' });
  }
  const list = await getWatchlist();
  if (list.includes(symbol)) return res.json({ symbols: list });
  if (list.length >= MAX_SYMBOLS) {
    return res.status(400).json({ error: `Maksimal ${MAX_SYMBOLS} simbol` });
  }
  // Validasi ke Yahoo sebelum disimpan — tolak kode yang tidak ada datanya
  try {
    await fetchQuote(symbol);
  } catch {
    return res.status(404).json({ error: `${symbol} tidak ditemukan di Yahoo Finance` });
  }
  list.push(symbol);
  await save();
  res.json({ symbols: list });
});

router.delete('/:symbol', async (req, res) => {
  const symbol = normalize(req.params.symbol);
  const list = await getWatchlist();
  const idx = list.indexOf(symbol);
  if (idx === -1) return res.status(404).json({ error: `${symbol} tidak ada di watchlist` });
  if (list.length === 1) {
    return res.status(400).json({ error: 'Watchlist tidak boleh kosong' });
  }
  list.splice(idx, 1);
  await save();
  res.json({ symbols: list });
});

export default router;
