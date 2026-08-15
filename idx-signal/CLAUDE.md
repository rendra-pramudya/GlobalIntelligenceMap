# CLAUDE.md — idx-signal

Dashboard charting & sinyal saham IDX (Bursa Efek Indonesia). Self-hosted,
Node.js, tanpa framework frontend. Eksekusi order selalu manual di aplikasi
sekuritas (Growin' by Mandiri, tidak ada API publik) — sistem ini murni
decision support, bukan auto-trading.

## Menjalankan & tes

```bash
npm install
npm start          # port 3100 (3000 dipakai project lain: VizrtControlHub)
npm run dev        # dengan --watch
```

Windows: `start.bat` / `stop.bat`. Smoke test: buka http://localhost:3100,
chart BBCA harus render dengan data; `curl localhost:3100/api/signals/BBCA.JK`
harus return snapshot indikator.

## Arsitektur

- **ESM murni** (`"type": "module"`), Express + `ws`, vanilla JS frontend.
  JANGAN tambah framework (React/Vue/dst) atau TypeScript tanpa diminta.
- `server.js` — HTTP + WebSocket + scheduler (quote poll 15 dtk, scanner 15 mnt
  saat jam bursa, evaluator harian jam 09 UTC / 16:00 WIB).
- `src/routes/market.js` — proxy Yahoo Finance. Simbol IDX: `{KODE}.JK`.
  WAJIB kirim header User-Agent, tanpa itu Yahoo balas 403. Ada cache in-memory.
- `src/routes/watchlist.js` — watchlist persistent (`config/watchlist.json`),
  satu sumber untuk frontend + poller + scanner. Validasi simbol ke Yahoo
  sebelum simpan.
- `src/indicators.js` — RSI/MACD/EMA/volume ratio via `technicalindicators`.
  Parameter SELALU dibaca dari `config/strategy.json`, jangan hardcode.
- `src/routes/signals.js` — analisis on-demand + `scanWatchlist()` dengan
  dedup satu-rule-per-simbol-per-hari.
- **Improvement loop** (`src/journal.js`, `src/evaluator.js`, `src/improve.js`,
  `src/routes/loop.js`): sinyal → jurnal → evaluasi horizon 1/3/5 hari →
  review Claude API → proposal.

## Aturan yang tidak boleh dilanggar

1. **Proposal perubahan config TIDAK PERNAH diterapkan otomatis.** Harus lewat
   `POST /api/loop/apply` (approval manusia). Gate ini disengaja — jangan
   "disederhanakan".
2. `config/strategy.json` versioned: tiap perubahan menaikkan `version` dan
   mengarsipkan rules lama ke `history`. Sinyal di jurnal menyimpan
   `configVersion` asalnya.
3. Review Claude butuh minimal 10 sinyal terevaluasi (MIN_SAMPLE di
   `improve.js`) dan maksimal mengubah 2 parameter per siklus.
4. `data/` (jurnal, proposal) dan `.env` di-gitignore — jangan pernah commit.
   API key hanya via env `ANTHROPIC_API_KEY`.
5. Jam bursa IDX: 09:00–15:50 WIB = 02:00–08:50 UTC, Senin–Jumat
   (`isIdxOpen()` di server.js).

## Konvensi

- Komentar kode dalam Bahasa Indonesia, nama variabel/fungsi Inggris.
- UI: palet teal `#00B4CC` / near-black `#111316`, font IBM Plex Mono (data)
  + Archivo (UI). Estetika "master control room broadcast".
- Semua teks UI Bahasa Indonesia.

## Roadmap

- **Fase 3 (berikutnya):** notifikasi Telegram Bot — kirim sinyal dari
  `scanWatchlist()` ke chat, token via env `TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID`.
- **Fase 4:** Claude API menganalisis konteks (indikator + berita) sebelum
  sinyal dikirim → `{signal, confidence, reasoning}`.
- Backlog: hari libur bursa di `isIdxOpen()`, evaluator pakai hari bursa
  (bukan kalender), panel RSI/MACD sebagai pane terpisah di chart.
