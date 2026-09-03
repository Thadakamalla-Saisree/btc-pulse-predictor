// src/engine/indicators.js
// High-performance institutional quantitative indicators computed for 1m, 5m & 15m charts

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

    const offset = slow - fast;
    const macdLine = [];
    for (let i = 0; i < slowEMA.length; i++) {
      macdLine.push(fastEMA[i + offset] - slowEMA[i]);
    }

    const signalLine = this.calculateEMA(macdLine, signal);
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
      return { upper: p, middle: p, lower: p, percentB: 0.5, bandwidth: 0, isSqueezing: false };
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
      isSqueezing: bandwidth < 0.28
    };
  }

  /**
   * Average Directional Index (ADX) - Trend Strength vs Choppy Range Detector
   */
  static calculateADX(candles, period = 14) {
    if (!candles || candles.length < period * 2) {
      return { adx: 20, plusDI: 20, minusDI: 20, isTrending: false, isChoppy: true, trendBias: 'NEUTRAL' };
    }

    const trList = [];
    const plusDMList = [];
    const minusDMList = [];

    for (let i = 1; i < candles.length; i++) {
      const cur = candles[i];
      const prev = candles[i - 1];

      const tr = Math.max(
        cur.high - cur.low,
        Math.abs(cur.high - prev.close),
        Math.abs(cur.low - prev.close)
      );
      trList.push(tr);

      const upMove = cur.high - prev.high;
      const downMove = prev.low - cur.low;

      let plusDM = 0;
      let minusDM = 0;

      if (upMove > downMove && upMove > 0) plusDM = upMove;
      if (downMove > upMove && downMove > 0) minusDM = downMove;

      plusDMList.push(plusDM);
      minusDMList.push(minusDM);
    }

    // Smoothed values over period
    let trSmooth = trList.slice(0, period).reduce((a, b) => a + b, 0);
    let plusDMSmooth = plusDMList.slice(0, period).reduce((a, b) => a + b, 0);
    let minusDMSmooth = minusDMList.slice(0, period).reduce((a, b) => a + b, 0);

    const dxList = [];
    const plusDIList = [];
    const minusDIList = [];

    for (let i = period; i < trList.length; i++) {
      trSmooth = trSmooth - (trSmooth / period) + trList[i];
      plusDMSmooth = plusDMSmooth - (plusDMSmooth / period) + plusDMList[i];
      minusDMSmooth = minusDMSmooth - (minusDMSmooth / period) + minusDMList[i];

      const plusDI = trSmooth > 0 ? (plusDMSmooth / trSmooth) * 100 : 0;
      const minusDI = trSmooth > 0 ? (minusDMSmooth / trSmooth) * 100 : 0;
      plusDIList.push(plusDI);
      minusDIList.push(minusDI);

      const diSum = plusDI + minusDI;
      const diDiff = Math.abs(plusDI - minusDI);
      const dx = diSum > 0 ? (diDiff / diSum) * 100 : 0;
      dxList.push(dx);
    }

    if (dxList.length < period) {
      return { adx: 22, plusDI: 22, minusDI: 20, isTrending: false, isChoppy: true, trendBias: 'NEUTRAL' };
    }

    let adx = dxList.slice(0, period).reduce((a, b) => a + b, 0) / period;
    for (let i = period; i < dxList.length; i++) {
      adx = (adx * (period - 1) + dxList[i]) / period;
    }

    const lastPlusDI = plusDIList[plusDIList.length - 1] || 0;
    const lastMinusDI = minusDIList[minusDIList.length - 1] || 0;

    return {
      adx: parseFloat(adx.toFixed(1)),
      plusDI: parseFloat(lastPlusDI.toFixed(1)),
      minusDI: parseFloat(lastMinusDI.toFixed(1)),
      isTrending: adx >= 25,
      isStrongTrend: adx >= 35,
      isChoppy: adx < 20,
      trendBias: lastPlusDI > lastMinusDI ? 'BULLISH' : 'BEARISH'
    };
  }

  /**
   * Intraday Volume-Weighted Average Price (VWAP) & Standard Deviation Bands
   */
  static calculateVWAP(candles) {
    if (!candles || candles.length === 0) {
      return { vwap: 75000, upperBand1: 75050, lowerBand1: 74950, upperBand2: 75100, lowerBand2: 74900, stdDev: 50 };
    }

    let cumTPV = 0;
    let cumVolume = 0;
    const vwapPoints = [];

    for (let i = 0; i < candles.length; i++) {
      const c = candles[i];
      const typicalPrice = (c.high + c.low + c.close) / 3;
      const volume = c.volume || 1;

      cumTPV += typicalPrice * volume;
      cumVolume += volume;

      const currentVWAP = cumTPV / (cumVolume || 1);
      vwapPoints.push({ vwap: currentVWAP, tp: typicalPrice, vol: volume });
    }

    const latestVWAP = vwapPoints[vwapPoints.length - 1].vwap;

    // Standard deviation of typical price from VWAP
    let varianceSum = 0;
    for (const pt of vwapPoints) {
      varianceSum += pt.vol * Math.pow(pt.tp - latestVWAP, 2);
    }
    const variance = varianceSum / (cumVolume || 1);
    const stdDev = Math.sqrt(variance) || 30;

    return {
      vwap: parseFloat(latestVWAP.toFixed(2)),
      upperBand1: parseFloat((latestVWAP + 1.28 * stdDev).toFixed(2)),
      lowerBand1: parseFloat((latestVWAP - 1.28 * stdDev).toFixed(2)),
      upperBand2: parseFloat((latestVWAP + 2.0 * stdDev).toFixed(2)),
      lowerBand2: parseFloat((latestVWAP - 2.0 * stdDev).toFixed(2)),
      stdDev: parseFloat(stdDev.toFixed(2))
    };
  }

  /**
   * RSI Divergence Detection (Bullish & Bearish Divergence)
   */
  static detectRSIDivergence(candles, rsiData, lookback = 25) {
    if (!candles || !rsiData || !rsiData.series || rsiData.series.length < lookback) {
      return null;
    }

    const recentCandles = candles.slice(-lookback);
    const recentRSI = rsiData.series.slice(-lookback);
    const n = recentCandles.length;

    // Find recent swing highs and lows in price
    let low1Idx = -1, low2Idx = -1; // low2 is the most recent
    let high1Idx = -1, high2Idx = -1; // high2 is the most recent

    // Local minima (swing low)
    for (let i = n - 2; i >= 3; i--) {
      if (recentCandles[i].low <= recentCandles[i - 1].low && recentCandles[i].low <= recentCandles[i + 1].low) {
        if (low2Idx === -1) {
          low2Idx = i;
        } else if (low1Idx === -1 && (low2Idx - i) >= 4) {
          low1Idx = i;
          break;
        }
      }
    }

    // Local maxima (swing high)
    for (let i = n - 2; i >= 3; i--) {
      if (recentCandles[i].high >= recentCandles[i - 1].high && recentCandles[i].high >= recentCandles[i + 1].high) {
        if (high2Idx === -1) {
          high2Idx = i;
        } else if (high1Idx === -1 && (high2Idx - i) >= 4) {
          high1Idx = i;
          break;
        }
      }
    }

    // 1. Regular Bullish Divergence: Price Lower Low, but RSI Higher Low
    if (low1Idx !== -1 && low2Idx !== -1) {
      const priceLow1 = recentCandles[low1Idx].low;
      const priceLow2 = recentCandles[low2Idx].low;
      const rsiLow1 = recentRSI[low1Idx];
      const rsiLow2 = recentRSI[low2Idx];

      if (priceLow2 < priceLow1 && rsiLow2 > rsiLow1 && rsiLow2 < 42) {
        return {
          type: 'BULLISH_DIVERGENCE',
          bias: 'BULLISH',
          weight: 28,
          name: `Bullish RSI Divergence: Price LL ($${priceLow2.toFixed(0)}) vs RSI HL (${rsiLow2.toFixed(1)} > ${rsiLow1.toFixed(1)})`
        };
      }
    }

    // 2. Regular Bearish Divergence: Price Higher High, but RSI Lower High
    if (high1Idx !== -1 && high2Idx !== -1) {
      const priceHigh1 = recentCandles[high1Idx].high;
      const priceHigh2 = recentCandles[high2Idx].high;
      const rsiHigh1 = recentRSI[high1Idx];
      const rsiHigh2 = recentRSI[high2Idx];

      if (priceHigh2 > priceHigh1 && rsiHigh2 < rsiHigh1 && rsiHigh2 > 58) {
        return {
          type: 'BEARISH_DIVERGENCE',
          bias: 'BEARISH',
          weight: 28,
          name: `Bearish RSI Divergence: Price HH ($${priceHigh2.toFixed(0)}) vs RSI LH (${rsiHigh2.toFixed(1)} < ${rsiHigh1.toFixed(1)})`
        };
      }
    }

    return null;
  }

  /**
   * Liquidity Sweep / Stop-Hunt Rejection Wick Detection
   */
  static detectLiquiditySweep(candles, lookback = 15) {
    if (!candles || candles.length < lookback + 2) return null;

    const current = candles[candles.length - 1];
    const prevSlice = candles.slice(-lookback - 1, -1);

    const highestHigh = Math.max(...prevSlice.map(c => c.high));
    const lowestLow = Math.min(...prevSlice.map(c => c.low));

    const range = current.high - current.low;
    if (range === 0) return null;

    const upperWick = current.high - Math.max(current.open, current.close);
    const lowerWick = Math.min(current.open, current.close) - current.low;

    // Bullish Liquidity Sweep: Swept previous low, then rejected aggressively with long lower wick
    if (current.low < lowestLow && current.close > lowestLow && lowerWick >= range * 0.55) {
      return {
        type: 'BULLISH_LIQUIDITY_SWEEP',
        bias: 'BULLISH',
        weight: 25,
        name: `Bullish Liquidity Sweep: Low ($${current.low.toFixed(0)}) swept previous support and aggressively rejected`
      };
    }

    // Bearish Liquidity Sweep: Swept previous high, then rejected aggressively with long upper wick
    if (current.high > highestHigh && current.close < highestHigh && upperWick >= range * 0.55) {
      return {
        type: 'BEARISH_LIQUIDITY_SWEEP',
        bias: 'BEARISH',
        weight: 25,
        name: `Bearish Liquidity Sweep: High ($${current.high.toFixed(0)}) swept previous resistance and aggressively rejected`
      };
    }

    return null;
  }

  /**
   * Volume Profile & Surge Multiplier
   */
  static calculateVolumeProfile(candles, period = 20) {
    if (!candles || candles.length < period) {
      return { volumeSurge: 1.0, isSurging: false };
    }

    const recent = candles.slice(-period);
    const avgVol = recent.reduce((sum, c) => sum + (c.volume || 0), 0) / period;
    const latestVol = candles[candles.length - 1].volume || 1;
    const volumeSurge = avgVol > 0 ? latestVol / avgVol : 1.0;

    return {
      volumeSurge: parseFloat(volumeSurge.toFixed(2)),
      isSurging: volumeSurge >= 1.75
    };
  }

  /**
   * Average True Range (ATR)
   */
  static calculateATR(candles, period = 14) {
    if (!candles || candles.length < period + 1) {
      return 25.0;
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
   * Key Candlestick Patterns
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
        name: 'Bullish Hammer / Pin Bar Rejection'
      };
    }

    // Shooting Star (Bearish)
    if (upperWick >= body * 2 && lowerWick <= body * 0.5) {
      return {
        type: 'SHOOTING_STAR',
        bias: 'BEARISH',
        weight: 15,
        name: 'Bearish Shooting Star / Pin Bar Rejection'
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
        name: 'Bullish Engulfing Price Action'
      };
    }

    // Bearish Engulfing
    const prevIsGreen = prev.close > prev.open;
    if (prevIsGreen && !isGreen && current.open >= prev.close && current.close <= prev.open && body > prevBody) {
      return {
        type: 'ENGULFING_BEAR',
        bias: 'BEARISH',
        weight: 18,
        name: 'Bearish Engulfing Price Action'
      };
    }

    return null;
  }
}
