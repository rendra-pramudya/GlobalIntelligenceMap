# IDX Signal - Batch Files (Windows)

Batch files untuk memudahkan menjalankan aplikasi IDX Signal di Windows.

## File-file yang tersedia

### 1. **setup.bat**
Untuk instalasi awal dan setup dependencies.

```bash
setup.bat
```

**Fungsi:**
- Mengecek apakah Node.js sudah terinstall
- Install semua npm dependencies (node_modules)
- Validasi instalasi

**Kapan digunakan:**
- Pertama kali setelah clone repository
- Setelah menambah dependency baru

---

### 2. **start.bat** ⭐ (REKOMENDASI)
Untuk menjalankan server dengan cara termudah.

```bash
start.bat
```

**Fungsi:**
- Auto-check dan install dependencies jika belum ada
- Start server di port 3000
- Tampilkan informasi server
- Auto-install jika node_modules hilang

**Keuntungan:**
- Paling sederhana dan reliable
- Cocok untuk daily use
- Error handling yang baik

---

### 3. **run.bat**
Untuk menjalankan server dan auto-open browser.

```bash
run.bat
```

**Fungsi:**
- Start server
- Auto-open browser ke http://localhost:3000
- Menampilkan informasi penting

**Keuntungan:**
- One-click untuk develop + browse
- Lebih cepat dibanding manual open browser

---

### 4. **dev.bat**
Untuk development dengan informasi detail.

```bash
dev.bat
```

**Fungsi:**
- Start server dalam mode development
- Tampilkan environment info
- Tampilkan features yang tersedia
- Tampilkan cara menggunakan fintech.id API

**Keuntungan:**
- Informatif untuk developer
- Reminder tentang konfigurasi fintech.id
- Lengkap dengan documentation inline

---

### 5. **stop.bat**
Untuk menghentikan server yang running.

```bash
stop.bat
```

**Fungsi:**
- Terminate semua process Node.js yang sedang running
- Konfirmasi bahwa server sudah berhenti

**Keuntungan:**
- Lebih aman dibanding Force Close
- Bisa dijalankan dari Command Prompt lain

---

## Cara Menggunakan

### Pertama Kali (Fresh Install)
```
1. Buka Command Prompt di folder idx-signal
2. Jalankan: setup.bat
3. Tunggu instalasi selesai
4. Jalankan: start.bat atau run.bat
5. Server akan jalan di http://localhost:3000
```

### Hari-hari Selanjutnya
```
1. Jalankan: start.bat (atau run.bat jika ingin auto-open browser)
2. Buka browser ke http://localhost:3000
3. Untuk stop server, jalankan: stop.bat (atau Ctrl+C di console)
```

### Development
```
1. Jalankan: dev.bat
2. Lihat informasi environment dan features
3. Buat perubahan di code
4. Server akan reload (tergantung setup)
```

---

## Persyaratan

- **Node.js** v14 atau lebih tinggi
  - Download: https://nodejs.org/
  - Verify: Buka CMD, ketik `node --version`

- **npm** (included dengan Node.js)
  - Verify: Buka CMD, ketik `npm --version`

---

## Troubleshooting

### "Node.js is not installed!"
**Solusi:** 
- Install Node.js dari https://nodejs.org/
- Restart Command Prompt setelah install

### "npm: command not found"
**Solusi:**
- Node.js tidak ter-install dengan benar
- Uninstall dan reinstall Node.js
- Pastikan PATH environment variable sudah benar

### Port 3000 sudah terpakai
**Solusi:**
```
1. Jalankan: stop.bat
2. Atau ubah PORT di server.js
   export PORT=3001
   Lalu start server
```

### Dependencies error saat npm install
**Solusi:**
```
1. Buka CMD di folder idx-signal
2. Jalankan: npm cache clean --force
3. Jalankan: setup.bat lagi
```

---

## Konfigurasi Fintech.id (Future)

Ketika sudah dapat API key dari fintech.id:

### Menggunakan GUI (Easiest)
Buat file `config.bat` di folder idx-signal:
```batch
@echo off
setx FINTECH_API_KEY "your_api_key_here"
setx DATA_SOURCE "fintech-id"
echo Configuration saved! Please restart the server.
pause
```

Jalankan:
```
config.bat
```

### Atau Manual di CMD
```
setx FINTECH_API_KEY "your_api_key_here"
setx DATA_SOURCE "fintech-id"
```

Restart server setelah set environment variables.

---

## File Structure
```
idx-signal/
├── start.bat          ← Main (Jalankan ini!)
├── run.bat            ← Auto browser
├── dev.bat            ← Development
├── setup.bat          ← Setup awal
├── stop.bat           ← Stop server
├── src/
│   ├── server.js      ← Backend
│   └── data-sources.js ← Data providers
├── public/
│   ├── index.html     ← Frontend
│   ├── app.js         ← JavaScript logic
│   └── styles.css     ← Styling
├── data/
│   └── stocks.json    ← Stock data
└── package.json       ← Dependencies
```

---

## Tips

✅ **Best Practices:**
- Selalu gunakan `start.bat` atau `run.bat`
- Jangan hardcode API keys di file batch
- Gunakan `dev.bat` untuk development
- Gunakan `stop.bat` untuk graceful shutdown

❌ **Jangan Lakukan:**
- Jangan edit batch files jika tidak tahu
- Jangan hapus node_modules manual
- Jangan force-kill Node.js dari Task Manager
- Jangan commit batch files dengan credentials

---

## Customization

Bisa buat custom batch file sesuai kebutuhan. Contoh:

```batch
@echo off
title My Custom Setup
cd /d "%~dp0"

:: Custom environment
set NODE_ENV=production
set PORT=8080
set FINTECH_API_KEY=your_key

npm start
pause
```

---

**Happy Trading! 📈**
