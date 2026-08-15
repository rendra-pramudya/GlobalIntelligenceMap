// Improvement step — Claude me-review metrik performa dan MENGUSULKAN revisi
// threshold. Usulan TIDAK diterapkan otomatis; harus di-approve manual via
// POST /api/loop/apply. Ini disengaja: auto-tuning tanpa gate manusia cenderung
// overfit ke noise pasar jangka pendek.

import { readFile, writeFile, mkdir } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { performanceSummary } from './evaluator.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = path.join(__dirname, '..', 'config', 'strategy.json');
const PROPOSAL_PATH = path.join(__dirname, '..', 'data', 'proposal.json');

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-sonnet-4-6';
const MIN_SAMPLE = 10; // di bawah ini, review ditolak — sampel terlalu kecil

export async function runReview() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('Set ANTHROPIC_API_KEY di environment dulu');

  const config = JSON.parse(await readFile(CONFIG_PATH, 'utf8'));
  const summary = await performanceSummary();

  if (summary.evaluated < MIN_SAMPLE) {
    return {
      status: 'insufficient_data',
      message: `Baru ${summary.evaluated} sinyal terevaluasi; minimal ${MIN_SAMPLE} sebelum review layak dijalankan. Biarkan sistem berjalan dulu.`,
    };
  }

  const prompt = `Kamu adalah reviewer strategi sinyal teknikal untuk saham IDX.

Config aktif (versi ${config.version}):
${JSON.stringify(config.rules, null, 2)}

Performa sinyal terevaluasi:
${JSON.stringify(summary, null, 2)}

Tugas:
1. Identifikasi rule mana yang underperform (hitRate < 0.5 atau avgReturnPct negatif) dan mana yang bekerja baik.
2. Usulkan revisi parameter yang KONSERVATIF (ubah maksimal 2 parameter, pergeseran kecil). Jika sampel per-rule < 5, jangan ubah rule itu.
3. Jika tidak ada perubahan yang justified, katakan itu — "tidak mengubah apa-apa" adalah jawaban valid.

Balas HANYA JSON valid tanpa markdown, format:
{
  "analysis": "ringkasan 2-3 kalimat",
  "proposedRules": { ...struktur sama dengan config.rules... },
  "changes": [{ "path": "rsi.oversold", "from": 30, "to": 28, "reason": "..." }],
  "confidence": "low|medium|high"
}
Jika tidak ada perubahan: "proposedRules" = rules saat ini dan "changes" = [].`;

  const res = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 1500,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  if (!res.ok) throw new Error(`Anthropic API ${res.status}: ${await res.text()}`);

  const data = await res.json();
  const text = data.content.filter(b => b.type === 'text').map(b => b.text).join('\n');
  const clean = text.replace(/```json|```/g, '').trim();
  const review = JSON.parse(clean);

  const proposal = {
    createdAt: new Date().toISOString(),
    baseVersion: config.version,
    summarySnapshot: summary,
    review,
    status: 'pending_approval',
  };
  await mkdir(path.dirname(PROPOSAL_PATH), { recursive: true });
  await writeFile(PROPOSAL_PATH, JSON.stringify(proposal, null, 2));
  return proposal;
}

export async function getProposal() {
  try {
    return JSON.parse(await readFile(PROPOSAL_PATH, 'utf8'));
  } catch {
    return null;
  }
}

/** Terapkan proposal — hanya dipanggil setelah user approve secara eksplisit. */
export async function applyProposal() {
  const proposal = await getProposal();
  if (!proposal || proposal.status !== 'pending_approval') {
    throw new Error('Tidak ada proposal yang menunggu approval');
  }
  const config = JSON.parse(await readFile(CONFIG_PATH, 'utf8'));
  if (config.version !== proposal.baseVersion) {
    throw new Error(
      `Config sudah berubah (v${config.version} != base v${proposal.baseVersion}). Jalankan review ulang.`
    );
  }

  config.history.push({
    version: config.version,
    rules: config.rules,
    archivedAt: new Date().toISOString(),
  });
  config.rules = proposal.review.proposedRules;
  config.version += 1;
  config.updatedAt = new Date().toISOString();
  config.updatedBy = 'claude_review_approved';
  await writeFile(CONFIG_PATH, JSON.stringify(config, null, 2));

  proposal.status = 'applied';
  proposal.appliedAt = new Date().toISOString();
  await writeFile(PROPOSAL_PATH, JSON.stringify(proposal, null, 2));

  return { newVersion: config.version, changes: proposal.review.changes };
}
