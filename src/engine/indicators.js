// src/engine/indicators.js
// High-performance quantitative indicators computed for 1m & 5m charts

export class IndicatorsEngine {
  /**
   * Exponential Moving Average (EMA)
   */
  static calculateEMA(prices, period) {
    if (!prices || prices.length < period) return [];
    const k = 2 / (period + 1);
    const emaArray = [];

    // First value is simple moving average
    let sum = 0;
    for (let i = 0; i < period; i++) {
      sum += prices[i];
    }
    let prevEma = sum / period;
    emaArray.push(prevEma);

    for (let i = period; i < prices.length; i++) {
      const currentEma = prices[i] * k + prevEma * (1 - k);
      emaArray.push(currentEma);
      prevEma = currentEma;
    }

    return emaArray;
  }

  /**
   * Relative Strength Index (RSI, Wilder's method)
   */
  static calculateRSI(prices, period = 14) {
    if (!prices || prices.length <= period) {
      return { rsi: 50, slope: 0, series: [] };
    }

    let gains = 0;
    let losses = 0;

    for (let i = 1; i <= period; i++) {
      const diff = prices[i] - prices[i - 1];
      if (diff >= 0) gains += diff;
      else losses -= diff;
    }

    let avgGain = gains / period;
    let avgLoss = losses / period;

    const rsiSeries = [];
    let rsi = avgLoss === 0 ? 100 : 100 - (100 / (1 + avgGain / avgLoss));
    rsiSeries.push(rsi);

    for (let i = period + 1; i < prices.length; i++) {
      const diff = prices[i] - prices[i - 1];
      const gain = diff > 0 ? diff : 0;
      const loss = diff < 0 ? -diff : 0;

      avgGain = (avgGain * (period - 1) + gain) / period;
      avgLoss = (avgLoss * (period - 1) + loss) / period;

      if (avgLoss === 0) {
        rsi = 100;
      } else {
        const rs = avgGain / avgLoss;
        rsi = 100 - (100 / (1 + rs));
      }
      rsiSeries.push(rsi);
    }

    const currentRsi = rsiSeries[rsiSeries.length - 1] || 50;
    const prevRsi = rsiSeries[rsiSeries.length - 3] || currentRsi;
    const slope = currentRsi - prevRsi;

    return {
      rsi: parseFloat(currentRsi.toFixed(2)),
      slope: parseFloat(slope.toFixed(2)),
      series: rsiSeries
    };
  }

  /**
   * Moving Average Convergence Divergence (MACD)
   */
  static calculateMACD(prices, fast = 12, slow = 26, signal = 9) {
    if (!prices || prices.length < slow + signal) {
      return { macd: 0, signal: 0, histogram: 0, isBullishCross: false, isBearishCross: false };
    }

    const fastEMA = this.calculateEMA(prices, fast);
    const slowEMA = this.calculateEMA(prices, slow);

    // Align fast and slow series
    const offset = slow - fast;
    const macdLine = [];
    for (let i = 0; i < slowEMA.length; i++) {
      macdLine.push(fastEMA[i + offset] - slowEMA[i]);
    }

    const signalLine = this.calculateEMA(macdLine, signal);
    const macdOffset = macdLine.length - signalLine.length;

    const currentMACD = macdLine[macdLine.length - 1] || 0;
    const currentSignal = signalLine[signalLine.length - 1] || 0;
    const currentHistogram = currentMACD - currentSignal;

    const prevMACD = macdLine[macdLine.length - 2] || 0;
    const prevSignal = signalLine[signalLine.length - 2] || 0;
    const prevHistogram = prevMACD - prevSignal;

    const isBullishCross = prevHistogram <= 0 && currentHistogram > 0;
    const isBearishCross = prevHistogram >= 0 && currentHistogram < 0;

    return {
      macd: parseFloat(currentMACD.toFixed(2)),
      signal: parseFloat(currentSignal.toFixed(2)),
      histogram: parseFloat(currentHistogram.toFixed(2)),
      histogramExpansion: currentHistogram > prevHistogram,
      isBullishCross,
      isBearishCross
    };
  }

  /**
   * Bollinger Bands (20, 2)
   */
  static calculateBollingerBands(prices, period = 20, multiplier = 2) {
    if (!prices || prices.length < period) {
      const p = prices[prices.length - 1] || 0;
      return { upper: p, middle: p, lower: p, percentB: 0.5, bandwidth: 0 };
    }

    const slice = prices.slice(-period);
    const mean = slice.reduce((a, b) => a + b, 0) / period;
    const variance = slice.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / period;
    const stdDev = Math.sqrt(variance);

    const upper = mean + multiplier * stdDev;
    const lower = mean - multiplier * stdDev;
    const currentPrice = prices[prices.length - 1];

    const bandwidth = mean > 0 ? ((upper - lower) / mean) * 100 : 0;
    const percentB = upper - lower > 0 ? (currentPrice - lower) / (upper - lower) : 0.5;

    return {
      upper: parseFloat(upper.toFixed(2)),
      middle: parseFloat(mean.toFixed(2)),
      lower: parseFloat(lower.toFixed(2)),
      percentB: parseFloat(percentB.toFixed(3)),
      bandwidth: parseFloat(bandwidth.toFixed(3)),
      isSqueezing: bandwidth < 0.25 // Volatility squeeze
    };
  }

  /**
   * Average True Range (ATR)
   */
  static calculateATR(candles, period = 14) {
    if (!candles || candles.length < period + 1) {
      return 25.0; // Default reasonable BTC 1m/5m ATR
    }

    const trueRanges = [];
    for (let i = 1; i < candles.length; i++) {
      const current = candles[i];
      const prev = candles[i - 1];
      const tr = Math.max(
        current.high - current.low,
        Math.abs(current.high - prev.close),
        Math.abs(current.low - prev.close)
      );
      trueRanges.push(tr);
    }

    // Smoothed average
    let sum = 0;
    for (let i = 0; i < period; i++) {
      sum += trueRanges[i];
    }
    let atr = sum / period;

    for (let i = period; i < trueRanges.length; i++) {
      atr = (atr * (period - 1) + trueRanges[i]) / period;
    }

    return parseFloat(atr.toFixed(2));
  }

  static detectCandlePattern(candles) {
    return this.detectCandlestickPatterns(candles);
  }

  /**
   * Detect key Candlestick Patterns in recent bars
   */
  static detectCandlestickPatterns(candles) {
    if (!candles || candles.length < 3) return null;

    const current = candles[candles.length - 1];
    const prev = candles[candles.length - 2];

    const body = Math.abs(current.close - current.open);
    const range = current.high - current.low;
    const isGreen = current.close >= current.open;

    if (range === 0) return null;

    const upperWick = current.high - Math.max(current.open, current.close);
    const lowerWick = Math.min(current.open, current.close) - current.low;

    // Pin Bar / Hammer (Bullish)
    if (lowerWick >= body * 2 && upperWick <= body * 0.5) {
      return {
        type: 'HAMMER',
        bias: 'BULLISH',
        weight: 15,
        name: 'Bullish Hammer / Pin Bar'
      };
    }

    // Shooting Star / Inverted Pin Bar (Bearish)
    if (upperWick >= body * 2 && lowerWick <= body * 0.5) {
      return {
        type: 'SHOOTING_STAR',
        bias: 'BEARISH',
        weight: 15,
        name: 'Bearish Shooting Star / Pin Bar'
      };
    }

    // Bullish Engulfing
    const prevBody = Math.abs(prev.close - prev.open);
    const prevIsRed = prev.close < prev.open;
    if (prevIsRed && isGreen && current.open <= prev.close && current.close >= prev.open && body > prevBody) {
      return {
        type: 'ENGULFING_BULL',
        bias: 'BULLISH',
        weight: 18,
        name: 'Bullish Engulfing'
      };
    }

    // Bearish Engulfing
    const prevIsGreen = prev.close > prev.open;
    if (prevIsGreen && !isGreen && current.open >= prev.close && current.close <= prev.open && body > prevBody) {
      return {
        type: 'ENGULFING_BEAR',
        bias: 'BEARISH',
        weight: 18,
        name: 'Bearish Engulfing'
      };
    }

    return null;
  }
}
