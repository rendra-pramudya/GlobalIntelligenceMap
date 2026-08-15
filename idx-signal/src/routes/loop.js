// /api/loop — endpoint continuous improvement loop
//
// GET  /api/loop/status     -> ringkasan jurnal + config versi aktif
// POST /api/loop/signal     -> catat sinyal manual/dari engine (Phase 2 akan panggil ini)
// POST /api/loop/evaluate   -> jalankan evaluator (dipanggil cron harian)
// GET  /api/loop/metrics    -> performance summary
// POST /api/loop/review     -> minta Claude review + buat proposal
// GET  /api/loop/proposal   -> lihat proposal yang menunggu
// POST /api/loop/apply      -> APPROVE & terapkan proposal (aksi manual kamu)

import { Router } from 'express';
import { readFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { logSignal, getSignals } from '../journal.js';
import { evaluatePending, performanceSummary } from '../evaluator.js';
import { runReview, getProposal, applyProposal } from '../improve.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = path.join(__dirname, '..', '..', 'config', 'strategy.json');

const router = Router();

router.get('/status', async (_req, res) => {
  try {
    const config = JSON.parse(await readFile(CONFIG_PATH, 'utf8'));
    const signals = await getSignals();
    const proposal = await getProposal();
    res.json({
      configVersion: config.version,
      rules: config.rules,
      journal: {
        total: signals.length,
        evaluated: signals.filter(s => Object.keys(s.outcomes).length > 0).length,
      },
      pendingProposal: proposal?.status === 'pending_approval' ? proposal.createdAt : null,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/signal', async (req, res) => {
  const { symbol, signal, source, price, indicators } = req.body || {};
  if (!symbol || !signal || !price) {
    return res.status(400).json({ error: 'Wajib: symbol, signal (buy_watch|sell_watch), price' });
  }
  try {
    const config = JSON.parse(await readFile(CONFIG_PATH, 'utf8'));
    const entry = await logSignal({
      symbol, signal,
      source: source || 'manual',
      price,
      indicators: indicators || {},
      configVersion: config.version,
    });
    res.json(entry);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/evaluate', async (_req, res) => {
  try {
    res.json({ evaluated: await evaluatePending() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/metrics', async (_req, res) => {
  try {
    res.json(await performanceSummary());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/review', async (_req, res) => {
  try {
    res.json(await runReview());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/proposal', async (_req, res) => {
  const p = await getProposal();
  if (!p) return res.status(404).json({ error: 'Belum ada proposal' });
  res.json(p);
});

router.post('/apply', async (_req, res) => {
  try {
    res.json(await applyProposal());
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
