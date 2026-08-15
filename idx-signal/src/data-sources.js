// ============================================================
// Data Source Modules for IDX Stock Data
// ============================================================

const yahooFinance = require('yahoo-finance2').default;

// ============================================================
// YAHOO FINANCE DATA SOURCE
// ============================================================
const yahooFinanceSource = {
  name: 'Yahoo Finance',
  async fetchMarketData(code) {
    try {
      const yahooCode = `${code}.JK`;
      const quote = await yahooFinance.quote(yahooCode);
      const history = await yahooFinance.historical(yahooCode, {
        period1: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000),
        period2: new Date()
      });

      if (!quote || !history || history.length === 0) {
        throw new Error('No data available');
      }

      const prices = history.map(h => h.close).reverse();
      const volumes = history.map(h => h.volume).reverse();

      return {
        code,
        currentPrice: quote.regularMarketPrice || 1000,
        pe_ratio: quote.trailingPE || 15,
        pb_ratio: quote.priceToBook || 2,
        roe: (quote.returnOnEquity || 0.15) * 100,
        debt_to_equity: quote.debtToEquity || 0.5,
        revenue_growth: (quote.revenueGrowth || 0.1) * 100,
        profit_margin: (quote.profitMargins || 0.15) * 100,
        volume: volumes[volumes.length - 1] || 1000000,
        moving_average_50: calculateMA(prices, 50),
        moving_average_200: calculateMA(prices, 200),
        rsi: calculateRSI(prices, 14),
        macd: calculateMACD(prices),
        price_change_percent: ((quote.regularMarketPrice - quote.regularMarketPreviousClose) / quote.regularMarketPreviousClose) * 100 || 0
      };
    } catch (error) {
      console.error(`Error fetching from Yahoo Finance for ${code}:`, error.message);
      throw error;
    }
  },

  async fetchHistoricalData(code) {
    try {
      const yahooCode = `${code}.JK`;
      const history = await yahooFinance.historical(yahooCode, {
        period1: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000),
        period2: new Date()
      });

      if (!history || history.length === 0) {
        throw new Error('No historical data available');
      }

      const last30Days = history.slice(-30);
      return {
        priceHistory: last30Days.map(h => Math.round(h.close)),
        volumeHistory: last30Days.map(h => Math.round(h.volume / 1000000))
      };
    } catch (error) {
      console.error(`Error fetching historical data from Yahoo Finance for ${code}:`, error.message);
      throw error;
    }
  }
};

// ============================================================
// FINTECH.ID DATA SOURCE (Ready when API key is available)
// ============================================================
const fintechIdSource = {
  name: 'Fintech.id',

  async fetchMarketData(code, apiKey) {
    try {
      if (!apiKey) {
        throw new Error('Fintech.id API key not provided');
      }

      // Placeholder for fintech.id API integration
      // When you get the API key, implement the actual API calls here

      // Example structure (implement with actual fintech.id API):
      /*
      const response = await fetch(`https://api.fintech.id/stocks/${code}`, {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        }
      });

      const data = await response.json();

      return {
        code,
        currentPrice: data.lastPrice,
        pe_ratio: data.peRatio,
        pb_ratio: data.pbRatio,
        roe: data.roe,
        debt_to_equity: data.debtToEquity,
        revenue_growth: data.revenueGrowth,
        profit_margin: data.profitMargin,
        volume: data.volume,
        moving_average_50: data.ma50,
        moving_average_200: data.ma200,
        rsi: data.rsi,
        macd: data.macd,
        price_change_percent: data.priceChangePercent
      };
      */

      console.warn('Fintech.id API integration not yet implemented');
      throw new Error('Fintech.id integration pending API documentation');
    } catch (error) {
      console.error(`Error fetching from Fintech.id for ${code}:`, error.message);
      throw error;
    }
  },

  async fetchHistoricalData(code, apiKey) {
    try {
      if (!apiKey) {
        throw new Error('Fintech.id API key not provided');
      }

      // Placeholder for fintech.id historical data API
      // Implement when API documentation is available

      console.warn('Fintech.id historical data integration not yet implemented');
      throw new Error('Fintech.id integration pending API documentation');
    } catch (error) {
      console.error(`Error fetching historical data from Fintech.id for ${code}:`, error.message);
      throw error;
    }
  }
};

// ============================================================
// Technical Indicator Calculations
// ============================================================
function calculateMA(prices, period) {
  if (prices.length < period) return prices[prices.length - 1] || 0;
  let sum = 0;
  for (let i = 0; i < period; i++) {
    sum += prices[prices.length - 1 - i];
  }
  return sum / period;
}

function calculateRSI(prices, period = 14) {
  if (prices.length < period + 1) return 50;

  let gains = 0, losses = 0;
  for (let i = prices.length - period; i < prices.length; i++) {
    const diff = prices[i] - prices[i - 1];
    if (diff > 0) gains += diff;
    else losses -= diff;
  }

  const avgGain = gains / period;
  const avgLoss = losses / period;
  const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
}

function calculateMACD(prices) {
  const ema12 = calculateEMA(prices, 12);
  const ema26 = calculateEMA(prices, 26);
  return ema12 - ema26;
}

function calculateEMA(prices, period) {
  if (prices.length < period) return prices[prices.length - 1] || 0;

  let sma = 0;
  for (let i = prices.length - period; i < prices.length; i++) {
    sma += prices[i];
  }
  sma /= period;

  const multiplier = 2 / (period + 1);
  let ema = sma;

  for (let i = prices.length - period + 1; i < prices.length; i++) {
    ema = prices[i] * multiplier + ema * (1 - multiplier);
  }

  return ema;
}

// ============================================================
// Select Active Data Source
// ============================================================
function getActiveDataSource(sourceType, apiKey) {
  if (sourceType === 'fintech-id' && apiKey) {
    return {
      ...fintechIdSource,
      async fetchMarketData(code) {
        return fintechIdSource.fetchMarketData(code, apiKey);
      },
      async fetchHistoricalData(code) {
        return fintechIdSource.fetchHistoricalData(code, apiKey);
      }
    };
  }

  // Default to Yahoo Finance
  return yahooFinanceSource;
}

module.exports = {
  yahooFinanceSource,
  fintechIdSource,
  getActiveDataSource,
  calculateMA,
  calculateRSI,
  calculateMACD,
  calculateEMA
};
