# IDX Signal Generator

Platform analisis saham Indonesia dengan signal BUY/SELL berdasarkan analisis fundamental dan teknikal.

## Fitur

### 📊 Daftar Saham Komprehensif
- Menampilkan daftar lengkap saham yang terdaftar di IDX
- Filter berdasarkan sektor industri
- Pencarian real-time berdasarkan kode atau nama saham

### 📈 Analisis Fundamental
- P/E Ratio
- P/B Ratio
- ROE (Return on Equity)
- Debt to Equity Ratio
- Revenue Growth
- Profit Margin

### 📊 Analisis Teknikal
- Moving Average 50 & 200 hari
- RSI (Relative Strength Index)
- MACD (Moving Average Convergence Divergence)
- Volume Analysis
- Price Change Analysis

### ⚡ Signal Trading
- **STRONG BUY**: Signal beli yang sangat kuat
- **BUY**: Signal beli
- **HOLD**: Tahan posisi
- **SELL**: Signal jual
- **STRONG SELL**: Signal jual yang sangat kuat

## Instalasi

### Requirements
- Node.js 14+
- npm atau yarn

### Setup

```bash
cd idx-signal
npm install
npm start
```

Server akan berjalan di `http://localhost:3000`

## Struktur Project

```
idx-signal/
├── src/
│   └── server.js          # Backend server Express
├── public/
│   ├── index.html         # Interface HTML
│   ├── styles.css         # Styling dengan flexbox
│   └── app.js             # JavaScript logic
├── data/
│   └── stocks.json        # Database saham IDX
└── package.json
```

## Interface Features

### Layout Responsif dengan Flexbox
- **Left Panel**: Daftar saham dengan search & filter
- **Center Panel**: Detail saham & metrik
- **Right Panel**: Analisis signal (Fundamental & Teknikal)

### Fitur Dockable
- Panel dapat dipindahkan dan di-resize
- Float panel untuk workspace yang lebih fleksibel
- Minimize/Maximize panel

### Signal Analysis
Kombinasi dari:
1. **Analisis Fundamental**: Valuasi dan kesehatan perusahaan
2. **Analisis Teknikal**: Tren harga dan momentum

## API Endpoints

### Get All Stocks
```
GET /api/stocks
```

Response:
```json
{
  "stocks": [...],
  "total": 50
}
```

### Get Stock Detail
```
GET /api/stocks/:code
```

### Get Trading Signals
```
GET /api/signals?sector=Energi&recommendation=BUY
```

## Development

### Adding More Stocks
Edit `data/stocks.json` dan tambahkan saham baru ke array.

### Customizing Analysis
Edit fungsi `generateSignal()` di `src/server.js` untuk mengubah logika signal generation.

## Live Demo

Akses application di browser:
```
http://localhost:3000
```

## Future Enhancements
- Real-time data integration dengan API penyedia data saham
- Advanced charting dengan TradingView
- Machine Learning untuk prediksi harga
- Export signals ke Telegram/Email
- Portfolio tracking

## Author
Rendra Pramudya

## License
MIT
