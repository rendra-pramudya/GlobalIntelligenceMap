const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { getActiveDataSource, calculateMA, calculateRSI, calculateMACD, calculateEMA } = require('./data-sources');

const app = express();
const PORT = process.env.PORT || 3000;

// ============================================================
// DATA SOURCE CONFIGURATION
// ============================================================
// Available: 'yahoo-finance' (default) or 'fintech-id'
// To use fintech-id:
// 1. Set FINTECH_API_KEY environment variable
// 2. Set DATA_SOURCE='fintech-id' environment variable
// ============================================================
const DATA_SOURCE = process.env.DATA_SOURCE || 'yahoo-finance';
const FINTECH_API_KEY = process.env.FINTECH_API_KEY || null;
const dataSource = getActiveDataSource(DATA_SOURCE, FINTECH_API_KEY);

console.log(`📊 Using data source: ${DATA_SOURCE}`);
if (DATA_SOURCE === 'fintech-id' && !FINTECH_API_KEY) {
  console.warn('⚠️  fintech-id selected but FINTECH_API_KEY not set. Falling back to yahoo-finance.');
}

// Cache for data to avoid excessive API calls
const dataCache = {};
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// Load stocks data
const stocksData = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/stocks.json'), 'utf8'));

// Fetch real market data using configured data source
const fetchMarketData = async (code) => {
  try {
    // Check cache
    if (dataCache[code] && Date.now() - dataCache[code].timestamp < CACHE_TTL) {
      return dataCache[code].data;
    }

    const marketData = await dataSource.fetchMarketData(code);

    // Cache the data
    dataCache[code] = {
      data: marketData,
      timestamp: Date.now()
    };

    return marketData;
  } catch (error) {
    console.error(`Error fetching data for ${code}:`, error.message);
    // Fallback to mock data if API fails
    return generateMockMarketData(code);
  }
};

// Fallback mock data for analysis
const generateMockMarketData = (code) => {
  const hash = code.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const seed = hash % 1000;

  return {
    code,
    currentPrice: 1000 + (seed * 15) % 5000,
    pe_ratio: 12 + (seed % 20),
    pb_ratio: 1 + (seed % 5),
    roe: 8 + (seed % 25),
    debt_to_equity: 0.3 + (seed % 100) / 100,
    revenue_growth: 5 + (seed % 30),
    profit_margin: 10 + (seed % 30),
    volume: Math.floor(1000000 + (seed * 50000) % 10000000),
    moving_average_50: 950 + (seed * 10) % 4500,
    moving_average_200: 900 + (seed * 10) % 4500,
    rsi: 30 + (seed % 70),
    macd: -100 + (seed % 200),
    price_change_percent: -10 + (seed % 20)
  };
};


// Signal generation based on fundamental and technical analysis
const generateSignal = (stock, marketData) => {
  const signals = {
    fundamental: [],
    technical: [],
    score: 0
  };

  // Fundamental Analysis
  if (marketData.pe_ratio < 15) signals.fundamental.push({ metric: 'P/E Ratio', value: marketData.pe_ratio, signal: 'BUY', strength: 'Medium' });
  if (marketData.pb_ratio < 1.5) signals.fundamental.push({ metric: 'P/B Ratio', value: marketData.pb_ratio, signal: 'BUY', strength: 'Medium' });
  if (marketData.roe > 15) signals.fundamental.push({ metric: 'ROE', value: marketData.roe + '%', signal: 'BUY', strength: 'Strong' });
  if (marketData.debt_to_equity < 0.5) signals.fundamental.push({ metric: 'Debt/Equity', value: marketData.debt_to_equity, signal: 'BUY', strength: 'Medium' });
  if (marketData.revenue_growth > 10) signals.fundamental.push({ metric: 'Revenue Growth', value: marketData.revenue_growth + '%', signal: 'BUY', strength: 'Strong' });
  if (marketData.profit_margin > 15) signals.fundamental.push({ metric: 'Profit Margin', value: marketData.profit_margin + '%', signal: 'BUY', strength: 'Medium' });

  // Technical Analysis
  if (marketData.moving_average_50 > marketData.moving_average_200) signals.technical.push({ metric: 'MA50 > MA200', value: 'Uptrend', signal: 'BUY', strength: 'Medium' });
  if (marketData.rsi < 30) signals.technical.push({ metric: 'RSI', value: marketData.rsi, signal: 'BUY', strength: 'Strong' });
  if (marketData.rsi > 70) signals.technical.push({ metric: 'RSI', value: marketData.rsi, signal: 'SELL', strength: 'Strong' });
  if (marketData.macd > 0) signals.technical.push({ metric: 'MACD', value: 'Positive', signal: 'BUY', strength: 'Medium' });
  if (marketData.price_change_percent > 0) signals.technical.push({ metric: 'Price Change', value: marketData.price_change_percent + '%', signal: 'BUY', strength: 'Weak' });

  // Calculate overall score
  let buyScore = 0;
  let sellScore = 0;

  [...signals.fundamental, ...signals.technical].forEach(sig => {
    const strength = sig.strength === 'Strong' ? 3 : sig.strength === 'Medium' ? 2 : 1;
    if (sig.signal === 'BUY') buyScore += strength;
    else if (sig.signal === 'SELL') sellScore += strength;
  });

  signals.score = buyScore - sellScore;
  signals.recommendation = signals.score > 5 ? 'STRONG BUY' : signals.score > 0 ? 'BUY' : signals.score < -5 ? 'STRONG SELL' : signals.score < 0 ? 'SELL' : 'HOLD';

  return signals;
};

// API Endpoints
app.get('/api/stocks', async (req, res) => {
  try {
    const stocksWithData = await Promise.all(
      stocksData.stocks.map(async (stock) => {
        const marketData = await fetchMarketData(stock.code);
        const signal = generateSignal(stock, marketData);
        return {
          ...stock,
          ...marketData,
          signal
        };
      })
    );
    res.json({ stocks: stocksWithData, total: stocksWithData.length });
  } catch (error) {
    console.error('Error fetching stocks:', error);
    res.status(500).json({ error: 'Error fetching stock data' });
  }
});

app.get('/api/stocks/:code', async (req, res) => {
  try {
    const stock = stocksData.stocks.find(s => s.code === req.params.code.toUpperCase());
    if (!stock) return res.status(404).json({ error: 'Stock not found' });

    const marketData = await fetchMarketData(stock.code);
    const signal = generateSignal(stock, marketData);

    res.json({ ...stock, ...marketData, signal });
  } catch (error) {
    console.error('Error fetching stock:', error);
    res.status(500).json({ error: 'Error fetching stock data' });
  }
});

app.get('/api/signals', async (req, res) => {
  try {
    const sector = req.query.sector;
    const recommendation = req.query.recommendation;

    let filteredStocks = stocksData.stocks;

    if (sector) {
      filteredStocks = filteredStocks.filter(s => s.sector.toLowerCase() === sector.toLowerCase());
    }

    const signals = await Promise.all(filteredStocks.map(async (stock) => {
      const marketData = await fetchMarketData(stock.code);
      const signal = generateSignal(stock, marketData);
      return { ...stock, signal };
    }));

    let filteredSignals = signals;
    if (recommendation) {
      filteredSignals = signals.filter(s => s.signal.recommendation.toUpperCase() === recommendation.toUpperCase());
    }

    res.json({ signals: filteredSignals, total: filteredSignals.length });
  } catch (error) {
    console.error('Error fetching signals:', error);
    res.status(500).json({ error: 'Error fetching signals' });
  }
});

app.get('/api/charts/:code', async (req, res) => {
  try {
    const code = req.params.code.toUpperCase();
    const stock = stocksData.stocks.find(s => s.code === code);
    if (!stock) return res.status(404).json({ error: 'Stock not found' });

    let priceHistory = [];
    let volumeHistory = [];

    try {
      const historicalData = await dataSource.fetchHistoricalData(code);
      priceHistory = historicalData.priceHistory;
      volumeHistory = historicalData.volumeHistory;
    } catch (error) {
      // Fallback to mock data if no history available
      const marketData = generateMockMarketData(code);
      const basePrice = marketData.currentPrice;
      const baseVolume = marketData.volume;
      const hash = code.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
      const seed = hash % 1000;

      let currentPrice = basePrice * 0.95;
      for (let i = 0; i < 30; i++) {
        const randomFactor = (seed + i) % 100;
        const priceChange = ((randomFactor - 50) / 100) * basePrice * 0.03;
        currentPrice = Math.max(basePrice * 0.7, currentPrice + priceChange);
        priceHistory.push(Math.round(currentPrice));

        const volumeVariance = ((seed * (i + 1)) % 150) / 100;
        volumeHistory.push(Math.round(baseVolume * volumeVariance / 1000000));
      }
    }

    const marketData = await fetchMarketData(code);
    res.json({
      code,
      name: stock.name,
      priceHistory,
      volumeHistory,
      currentPrice: marketData.currentPrice,
      baseVolume: marketData.volume
    });
  } catch (error) {
    console.error('Error fetching chart data:', error);
    res.status(500).json({ error: 'Error fetching chart data' });
  }
});

app.listen(PORT, () => {
  console.log(`IDX Signal Server running on http://localhost:${PORT}`);
});
