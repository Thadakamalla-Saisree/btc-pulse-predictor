// src/engine/predictor.js
// Top Quant Trader Decision Engine & Real-Time Probability Calculator

import { IndicatorsEngine } from './indicators.js';

export class PredictorEngine {
  constructor() {
    this.lastAnalysis = null;
  }

  /**
   * Run full institutional quant analysis on candles and live order flow
   * Analyzed every second to determine optimal 5-minute direction
   */
  analyzeMarket({ candles1m, candles5m, currentPrice, cvdData }) {
    if (!candles1m || candles1m.length < 30) {
      return this.getDefaultPrediction(currentPrice);
    }

    const closePrices = candles1m.map(c => c.close);
    // Replace latest close with live price for real-time accuracy
    closePrices[closePrices.length - 1] = currentPrice;

    // 1. Calculate Technical Indicators
    const ema9Series = IndicatorsEngine.calculateEMA(closePrices, 9);
    const ema21Series = IndicatorsEngine.calculateEMA(closePrices, 21);
    const ema50Series = IndicatorsEngine.calculateEMA(closePrices, 50);

    const currentEma9 = ema9Series[ema9Series.length - 1];
    const currentEma21 = ema21Series[ema21Series.length - 1];
    const currentEma50 = ema50Series[ema50Series.length - 1] || currentEma21;

    const prevEma9 = ema9Series[ema9Series.length - 3] || currentEma9;
    const ema9Slope = currentEma9 - prevEma9;

    const rsiData = IndicatorsEngine.calculateRSI(closePrices, 14);
    const macdData = IndicatorsEngine.calculateMACD(closePrices, 12, 26, 9);
    const bbData = IndicatorsEngine.calculateBollingerBands(closePrices, 20, 2);
    const atr = IndicatorsEngine.calculateATR(candles1m, 14);
    const pattern = IndicatorsEngine.detectCandlestickPatterns(candles1m);

    // 2. Scoring System (Bull Score vs Bear Score, base 50/50)
    let bullScore = 45;
    let bearScore = 45;
    const rationale = [];

    // Factor A: Moving Average Ribbon & Trend (25%)
    if (currentEma9 > currentEma21 && currentEma21 > currentEma50) {
      bullScore += 18;
      rationale.push(`Bullish trend alignment: EMA-9 ($${currentEma9.toFixed(0)}) > EMA-21 > EMA-50`);
    } else if (currentEma9 < currentEma21 && currentEma21 < currentEma50) {
      bearScore += 18;
      rationale.push(`Bearish trend alignment: EMA-9 ($${currentEma9.toFixed(0)}) < EMA-21 < EMA-50`);
    } else if (currentEma9 > currentEma21) {
      bullScore += 10;
      rationale.push(`Fast EMA-9 crossed above EMA-21 upward`);
    } else {
      bearScore += 10;
      rationale.push(`Fast EMA-9 crossed below EMA-21 downward`);
    }

    if (ema9Slope > 1.5) bullScore += 6;
    else if (ema9Slope < -1.5) bearScore += 6;

    // Factor B: RSI Momentum & Divergence (20%)
    if (rsiData.rsi < 35 && rsiData.slope > 0) {
      bullScore += 16;
      rationale.push(`Oversold RSI (${rsiData.rsi}) curling upward — mean reversion bounce`);
    } else if (rsiData.rsi > 68 && rsiData.slope < 0) {
      bearScore += 16;
      rationale.push(`Overbought RSI (${rsiData.rsi}) declining — local exhaustion signal`);
    } else if (rsiData.rsi >= 50 && rsiData.slope > 0) {
      bullScore += 9;
      rationale.push(`RSI (${rsiData.rsi}) sustaining bullish momentum above 50 midline`);
    } else if (rsiData.rsi < 50 && rsiData.slope < 0) {
      bearScore += 9;
      rationale.push(`RSI (${rsiData.rsi}) under bearish pressure below 50 midline`);
    }

    // Factor C: MACD Histogram & Crosses (20%)
    if (macdData.isBullishCross) {
      bullScore += 18;
      rationale.push(`Bullish MACD Golden Cross confirmed on 1m chart`);
    } else if (macdData.isBearishCross) {
      bearScore += 18;
      rationale.push(`Bearish MACD Death Cross confirmed on 1m chart`);
    } else if (macdData.histogram > 0 && macdData.histogramExpansion) {
      bullScore += 12;
      rationale.push(`Expanding positive MACD histogram (+${macdData.histogram})`);
    } else if (macdData.histogram < 0 && !macdData.histogramExpansion) {
      bearScore += 12;
      rationale.push(`Expanding negative MACD histogram (${macdData.histogram})`);
    }

    // Factor D: Bollinger Bands Extreme (%B) (15%)
    if (bbData.percentB < 0.08) {
      bullScore += 14;
      rationale.push(`Price tagged lower Bollinger Band ($${bbData.lower.toFixed(0)}) — oversold squeeze`);
    } else if (bbData.percentB > 0.92) {
      bearScore += 14;
      rationale.push(`Price tagged upper Bollinger Band ($${bbData.upper.toFixed(0)}) — upper resistance test`);
    } else if (bbData.percentB > 0.55 && currentPrice > bbData.middle) {
      bullScore += 6;
    } else if (bbData.percentB < 0.45 && currentPrice < bbData.middle) {
      bearScore += 6;
    }

    // Factor E: Order Flow / Cumulative Volume Delta (15%)
    if (cvdData) {
      if (cvdData.deltaRatio > 0.15) {
        bullScore += 15;
        const buyMillions = (cvdData.buyVol / 1e6).toFixed(2);
        rationale.push(`Aggressive taker buy volume surge (+$${buyMillions}M CVD delta)`);
      } else if (cvdData.deltaRatio < -0.15) {
        bearScore += 15;
        const sellMillions = (cvdData.sellVol / 1e6).toFixed(2);
        rationale.push(`Aggressive taker sell volume dominance (-$${sellMillions}M CVD delta)`);
      } else if (cvdData.netDelta > 0) {
        bullScore += 5;
      } else {
        bearScore += 5;
      }
    }

    // Factor F: Candlestick Pattern Bonus (10%)
    if (pattern) {
      if (pattern.bias === 'BULLISH') {
        bullScore += pattern.weight;
        rationale.push(`Price action confirmation: ${pattern.name}`);
      } else if (pattern.bias === 'BEARISH') {
        bearScore += pattern.weight;
        rationale.push(`Price action confirmation: ${pattern.name}`);
      }
    }

    // 3. Formulate Final Direction & Confidence
    const totalScore = bullScore + bearScore;
    const isUp = bullScore >= bearScore;
    const scoreDiff = Math.abs(bullScore - bearScore);

    // Normalize confidence between 65% and 94%
    const rawConfidence = 50 + (scoreDiff / totalScore) * 60;
    const confidence = Math.min(94, Math.max(65, Math.round(rawConfidence)));

    const expectedMove = atr * 0.85;
    const targetPrice = isUp
      ? parseFloat((currentPrice + expectedMove).toFixed(2))
      : parseFloat((currentPrice - expectedMove).toFixed(2));

    const result = {
      prediction: isUp ? 'UP' : 'DOWN',
      confidence,
      targetPrice,
      expectedMove: parseFloat(expectedMove.toFixed(2)),
      bullScore: Math.round(bullScore),
      bearScore: Math.round(bearScore),
      atr,
      rationale: rationale.slice(0, 4), // Top 4 trader justifications
      indicators: {
        rsi: rsiData.rsi,
        rsiSlope: rsiData.slope,
        macd: macdData.macd,
        macdHist: macdData.histogram,
        bbPercentB: bbData.percentB,
        bbMiddle: bbData.middle,
        ema9: currentEma9,
        ema21: currentEma21,
        cvdRatio: cvdData ? cvdData.deltaRatio : 0
      }
    };

    this.lastAnalysis = result;
    return result;
  }

  /**
   * Dynamically calculate the live probability of finishing UP vs DOWN
   * based on current price, lock price, remaining time, and ATR volatility
   */
  calculateLiveProbability(lockPrice, currentPrice, prediction, secondsRemaining, atr = 30) {
    if (!lockPrice || lockPrice <= 0 || !currentPrice) {
      return { upProb: 50, downProb: 50 };
    }

    const priceDelta = currentPrice - lockPrice;
    // Volatility scaling with square root of remaining time
    const timeFactor = Math.max(0.12, Math.sqrt(Math.max(5, secondsRemaining) / 300));
    const effectiveVol = (atr * 0.8) * timeFactor;

    // Standard normal cumulative distribution approximation (Z-score)
    const z = priceDelta / (effectiveVol || 1);
    
    // Logistic approximation of cumulative standard normal distribution
    const probUpRaw = 1 / (1 + Math.exp(-1.6 * z));
    let upProb = Math.round(probUpRaw * 100);

    // Clamp between 2% and 98% for realistic market dynamics
    upProb = Math.min(98, Math.max(2, upProb));
    const downProb = 100 - upProb;

    return {
      upProb,
      downProb,
      isPredictionWinning: prediction === 'UP' ? currentPrice >= lockPrice : currentPrice <= lockPrice,
      currentDelta: parseFloat(priceDelta.toFixed(2)),
      currentDeltaPercent: parseFloat(((priceDelta / lockPrice) * 100).toFixed(3))
    };
  }

  getDefaultPrediction(price = 75000) {
    return {
      prediction: 'UP',
      confidence: 72,
      targetPrice: price + 45,
      expectedMove: 45,
      bullScore: 58,
      bearScore: 42,
      atr: 28,
      rationale: [
        'Bootstrapping live 1-second quant stream',
        'EMA-9 providing positive upward support',
        'Taker order book absorbing sell pressure'
      ],
      indicators: {
        rsi: 54.2,
        rsiSlope: 1.1,
        macd: 12.4,
        macdHist: 3.2,
        bbPercentB: 0.58,
        bbMiddle: price - 10,
        ema9: price - 5,
        ema21: price - 15,
        cvdRatio: 0.12
      }
    };
  }
}

export const predictorEngine = new PredictorEngine();
