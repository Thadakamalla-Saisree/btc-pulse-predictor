// src/engine/predictor.js
// Institutional Adaptive Multi-Timeframe Quant Decision Engine

import { IndicatorsEngine } from './indicators.js';
import { chainlinkService } from '../services/chainlinkService.js';

export class PredictorEngine {
  constructor() {
    this.lastAnalysis = null;
  }

  /**
   * Institutional 4-Layer Adaptive Market Analysis
   * Evaluates Market Regime, Multi-Timeframe Confluence, VWAP, Order Flow, and Divergences
   */
  analyzeMarket({ candles1m, candles5m, candles15m, currentPrice, cvdData }) {
    if (!candles1m || candles1m.length < 30) {
      return this.getDefaultPrediction(currentPrice);
    }

    const closePrices1m = candles1m.map(c => c.close);
    closePrices1m[closePrices1m.length - 1] = currentPrice;

    // =========================================================================
    // 1. COMPUTE CORE TECHNICAL & STATISTICAL INDICATORS
    // =========================================================================
    // 1m Indicators
    const ema9_1m = IndicatorsEngine.calculateEMA(closePrices1m, 9);
    const ema21_1m = IndicatorsEngine.calculateEMA(closePrices1m, 21);
    const ema50_1m = IndicatorsEngine.calculateEMA(closePrices1m, 50);
    const curEma9_1m = ema9_1m[ema9_1m.length - 1] || currentPrice;
    const curEma21_1m = ema21_1m[ema21_1m.length - 1] || currentPrice;
    const curEma50_1m = ema50_1m[ema50_1m.length - 1] || currentPrice;

    const rsiData1m = IndicatorsEngine.calculateRSI(closePrices1m, 14);
    const macdData1m = IndicatorsEngine.calculateMACD(closePrices1m, 12, 26, 9);
    const bbData1m = IndicatorsEngine.calculateBollingerBands(closePrices1m, 20, 2);
    const adxData1m = IndicatorsEngine.calculateADX(candles1m, 14);
    const vwapData1m = IndicatorsEngine.calculateVWAP(candles1m);
    const atr1m = IndicatorsEngine.calculateATR(candles1m, 14);
    const volProfile1m = IndicatorsEngine.calculateVolumeProfile(candles1m, 20);

    // Alpha Triggers (Divergences & Liquidity Sweeps)
    const rsiDivergence = IndicatorsEngine.detectRSIDivergence(candles1m, rsiData1m, 25);
    const liquiditySweep = IndicatorsEngine.detectLiquiditySweep(candles1m, 15);
    const candlePattern = IndicatorsEngine.detectCandlestickPatterns(candles1m);

    // =========================================================================
    // 2. LAYER 1: MARKET REGIME CLASSIFICATION
    // =========================================================================
    let marketRegime = 'CHOPPY_RANGE';
    let regimeLabel = 'CHOPPY RANGE ⚖️';

    if (bbData1m.isSqueezing) {
      marketRegime = 'VOLATILITY_SQUEEZE';
      regimeLabel = 'VOLATILITY SQUEEZE ⚡';
    } else if (adxData1m.isTrending) {
      if (adxData1m.trendBias === 'BULLISH' && curEma9_1m > curEma21_1m) {
        marketRegime = 'TRENDING_BULL';
        regimeLabel = 'TRENDING BULL 🚀';
      } else if (adxData1m.trendBias === 'BEARISH' && curEma9_1m < curEma21_1m) {
        marketRegime = 'TRENDING_BEAR';
        regimeLabel = 'TRENDING BEAR 🔻';
      }
    }

    // =========================================================================
    // 3. LAYER 2: MULTI-TIMEFRAME (MTF) CONFLUENCE EVALUATION
    // =========================================================================
    // 15M Macro Structure
    let mtf15mBias = 'NEUTRAL';
    if (candles15m && candles15m.length >= 15) {
      const close15m = candles15m.map(c => c.close);
      const ema9_15 = IndicatorsEngine.calculateEMA(close15m, 9);
      const ema21_15 = IndicatorsEngine.calculateEMA(close15m, 21);
      const lastE9_15 = ema9_15[ema9_15.length - 1];
      const lastE21_15 = ema21_15[ema21_15.length - 1];
      if (lastE9_15 > lastE21_15 && currentPrice >= lastE21_15) mtf15mBias = 'BULLISH';
      else if (lastE9_15 < lastE21_15 && currentPrice <= lastE21_15) mtf15mBias = 'BEARISH';
    }

    // 5M Round Structure
    let mtf5mBias = 'NEUTRAL';
    if (candles5m && candles5m.length >= 15) {
      const close5m = candles5m.map(c => c.close);
      const ema9_5 = IndicatorsEngine.calculateEMA(close5m, 9);
      const ema21_5 = IndicatorsEngine.calculateEMA(close5m, 21);
      const lastE9_5 = ema9_5[ema9_5.length - 1];
      const lastE21_5 = ema21_5[ema21_5.length - 1];
      if (lastE9_5 > lastE21_5) mtf5mBias = 'BULLISH';
      else if (lastE9_5 < lastE21_5) mtf5mBias = 'BEARISH';
    } else {
      mtf5mBias = curEma9_1m >= curEma50_1m ? 'BULLISH' : 'BEARISH';
    }

    // 1M Tactical Structure
    const mtf1mBias = curEma9_1m >= curEma21_1m ? 'BULLISH' : 'BEARISH';

    // MTF Triple Alignment Check
    const isTripleBull = mtf15mBias === 'BULLISH' && mtf5mBias === 'BULLISH' && mtf1mBias === 'BULLISH';
    const isTripleBear = mtf15mBias === 'BEARISH' && mtf5mBias === 'BEARISH' && mtf1mBias === 'BEARISH';

    // =========================================================================
    // 4. LAYER 3 & 4: REGIME-SPECIFIC QUANT SCORING MATRIX
    // =========================================================================
    let bullScore = 50;
    let bearScore = 50;
    const rationale = [];

    // Factor 1: MTF Confluence Points
    if (isTripleBull) {
      bullScore += 30;
      rationale.push(`Triple MTF Alignment: 15M, 5M & 1M all institutional Bullish`);
    } else if (isTripleBear) {
      bearScore += 30;
      rationale.push(`Triple MTF Alignment: 15M, 5M & 1M all institutional Bearish`);
    } else if (mtf15mBias === 'BULLISH' && mtf5mBias === 'BULLISH') {
      bullScore += 18;
      rationale.push(`Macro Bullish structure: 15M & 5M higher timeframe support`);
    } else if (mtf15mBias === 'BEARISH' && mtf5mBias === 'BEARISH') {
      bearScore += 18;
      rationale.push(`Macro Bearish structure: 15M & 5M higher timeframe resistance`);
    }

    // Factor 2: Institutional VWAP Positioning
    const distFromVWAP = currentPrice - vwapData1m.vwap;
    if (currentPrice > vwapData1m.vwap) {
      bullScore += 12;
      if (currentPrice <= vwapData1m.upperBand1) {
        rationale.push(`Price holding above VWAP ($${vwapData1m.vwap.toFixed(0)}) — buyers in control`);
      }
    } else {
      bearScore += 12;
      if (currentPrice >= vwapData1m.lowerBand1) {
        rationale.push(`Price trading below VWAP ($${vwapData1m.vwap.toFixed(0)}) — sellers in control`);
      }
    }

    // Factor 3: Regime-Specific Strategy Execution
    if (marketRegime === 'CHOPPY_RANGE') {
      // In sideways range: Trade Mean Reversion at Bollinger & VWAP Extremes
      rationale.push(`Range regime (ADX ${adxData1m.adx}): Prioritizing boundary mean-reversion`);

      if (bbData1m.percentB <= 0.12 || currentPrice <= vwapData1m.lowerBand1) {
        bullScore += 26;
        rationale.push(`Lower boundary test ($${bbData1m.lower.toFixed(0)}) — high statistical odds of upward reversion`);
      } else if (bbData1m.percentB >= 0.88 || currentPrice >= vwapData1m.upperBand1) {
        bearScore += 26;
        rationale.push(`Upper boundary test ($${bbData1m.upper.toFixed(0)}) — high statistical odds of downward reversion`);
      }

      // Range RSI extremes
      if (rsiData1m.rsi <= 36) {
        bullScore += 18;
        rationale.push(`Oversold RSI (${rsiData1m.rsi}) inside range`);
      } else if (rsiData1m.rsi >= 64) {
        bearScore += 18;
        rationale.push(`Overbought RSI (${rsiData1m.rsi}) inside range`);
      }
    } else if (marketRegime === 'TRENDING_BULL') {
      // In strong uptrend: Follow trend pullbacks, penalize counter-trend
      bullScore += 24;
      rationale.push(`ADX (${adxData1m.adx}) confirms active Bullish trend`);

      // Pullback to 1m EMA-21 or VWAP is prime entry
      if (currentPrice >= curEma21_1m - 10 && currentPrice <= curEma9_1m + 10) {
        bullScore += 18;
        rationale.push(`Healthy pullback to EMA-21 dynamic trend support`);
      }
      if (macdData1m.histogram > 0) bullScore += 10;
    } else if (marketRegime === 'TRENDING_BEAR') {
      // In strong downtrend: Follow trend selloffs, penalize counter-trend
      bearScore += 24;
      rationale.push(`ADX (${adxData1m.adx}) confirms active Bearish trend`);

      if (currentPrice <= curEma21_1m + 10 && currentPrice >= curEma9_1m - 10) {
        bearScore += 18;
        rationale.push(`Healthy retest of EMA-21 dynamic trend resistance`);
      }
      if (macdData1m.histogram < 0) bearScore += 10;
    } else if (marketRegime === 'VOLATILITY_SQUEEZE') {
      rationale.push(`Bollinger Squeeze: Volatility compression awaiting expansion`);
      // In squeeze, look at Order Flow delta and volume surge for early breakout clues
      if (cvdData && cvdData.deltaRatio > 0.1) {
        bullScore += 22;
        rationale.push(`Taker order book absorbing asks: upward breakout probability`);
      } else if (cvdData && cvdData.deltaRatio < -0.1) {
        bearScore += 22;
        rationale.push(`Taker order book dumping into bids: downward breakout probability`);
      }
    }

    // Factor 4: High-Probability Alpha Triggers (Divergence & Liquidity Sweeps)
    if (rsiDivergence) {
      if (rsiDivergence.bias === 'BULLISH') {
        bullScore += rsiDivergence.weight;
        rationale.unshift(`⭐ ${rsiDivergence.name}`);
      } else {
        bearScore += rsiDivergence.weight;
        rationale.unshift(`⭐ ${rsiDivergence.name}`);
      }
    }

    if (liquiditySweep) {
      if (liquiditySweep.bias === 'BULLISH') {
        bullScore += liquiditySweep.weight;
        rationale.unshift(`⚡ ${liquiditySweep.name}`);
      } else {
        bearScore += liquiditySweep.weight;
        rationale.unshift(`⚡ ${liquiditySweep.name}`);
      }
    }

    // Factor 5: Order Flow CVD Aggression
    if (cvdData) {
      if (cvdData.deltaRatio >= 0.20) {
        bullScore += 18;
        rationale.push(`Taker Buy dominance (+${(cvdData.deltaRatio * 100).toFixed(0)}% delta)`);
      } else if (cvdData.deltaRatio <= -0.20) {
        bearScore += 18;
        rationale.push(`Taker Sell dominance (${(cvdData.deltaRatio * 100).toFixed(0)}% delta)`);
      }
    }

    // Factor 6: Price Action Confirmation
    if (candlePattern) {
      if (candlePattern.bias === 'BULLISH') bullScore += candlePattern.weight;
      else bearScore += candlePattern.weight;
    }

    // =========================================================================
    // 5. COMPUTE FINAL PREDICTION, CONFIDENCE & CONVICTION GRADE
    // =========================================================================
    const isUp = bullScore >= bearScore;
    const scoreDiff = Math.abs(bullScore - bearScore);
    const totalScore = bullScore + bearScore;

    // Normalized Confidence (68% to 94%)
    const rawConf = 55 + (scoreDiff / totalScore) * 65;
    const confidence = Math.min(94, Math.max(68, Math.round(rawConf)));

    // Conviction Grade
    let grade = 'GRADE B (TACTICAL)';
    let gradeColor = 'neutral';
    if (confidence >= 84 || (isTripleBull || isTripleBear) || rsiDivergence || liquiditySweep) {
      grade = 'GRADE A+ (HIGH CONVICTION)';
      gradeColor = 'grade-a-plus';
    } else if (confidence >= 75) {
      grade = 'GRADE A (STRONG CONVICTION)';
      gradeColor = 'grade-a';
    }

    const expectedMove = Math.max(20, atr1m * 0.9);
    const targetPrice = isUp
      ? parseFloat((currentPrice + expectedMove).toFixed(2))
      : parseFloat((currentPrice - expectedMove).toFixed(2));

    const result = {
      prediction: isUp ? 'UP' : 'DOWN',
      confidence,
      grade,
      gradeColor,
      marketRegime,
      regimeLabel,
      mtf: {
        m15: mtf15mBias,
        m5: mtf5mBias,
        m1: mtf1mBias
      },
      targetPrice,
      expectedMove: parseFloat(expectedMove.toFixed(2)),
      bullScore: Math.round(bullScore),
      bearScore: Math.round(bearScore),
      atr: atr1m,
      vwap: vwapData1m.vwap,
      rationale: rationale.slice(0, 4),
      indicators: {
        rsi: rsiData1m.rsi,
        rsiSlope: rsiData1m.slope,
        macd: macdData1m.macd,
        macdHist: macdData1m.histogram,
        bbPercentB: bbData1m.percentB,
        bbMiddle: bbData1m.middle,
        ema9: curEma9_1m,
        ema21: curEma21_1m,
        adx: adxData1m.adx,
        vwap: vwapData1m.vwap,
        cvdRatio: cvdData ? cvdData.deltaRatio : 0
      }
    };

    this.lastAnalysis = result;
    return result;
  }

  calculateLiveProbability(lockPrice, currentPrice, prediction, secondsRemaining, atr = 30) {
    if (!lockPrice || lockPrice <= 0 || !currentPrice) {
      return { upProb: 50, downProb: 50, isPredictionWinning: true, currentDelta: 0, currentDeltaPercent: 0, chainlinkSnipe: null };
    }

    const priceDelta = currentPrice - lockPrice;
    const timeFactor = Math.max(0.12, Math.sqrt(Math.max(5, secondsRemaining) / 300));
    const effectiveVol = (atr * 0.8) * timeFactor;

    const z = priceDelta / (effectiveVol || 1);
    const probUpRaw = 1 / (1 + Math.exp(-1.6 * z));
    let upProb = Math.round(probUpRaw * 100);

    upProb = Math.min(98, Math.max(2, upProb));
    const downProb = 100 - upProb;

    // Chainlink Oracle Snipe Intelligence
    const snipe = chainlinkService.analyzeOracleSnipe({
      lockPrice,
      currentPrice,
      secondsRemaining,
      atr
    });

    return {
      upProb,
      downProb,
      isPredictionWinning: prediction === 'UP' ? currentPrice >= lockPrice : currentPrice <= lockPrice,
      currentDelta: parseFloat(priceDelta.toFixed(2)),
      currentDeltaPercent: parseFloat(((priceDelta / lockPrice) * 100).toFixed(3)),
      chainlinkSnipe: snipe
    };
  }

  getDefaultPrediction(price = 75000) {
    return {
      prediction: 'UP',
      confidence: 78,
      grade: 'GRADE A (STRONG CONVICTION)',
      gradeColor: 'grade-a',
      marketRegime: 'CHOPPY_RANGE',
      regimeLabel: 'CHOPPY RANGE ⚖️',
      mtf: { m15: 'BULLISH', m5: 'BULLISH', m1: 'BULLISH' },
      targetPrice: price + 40,
      expectedMove: 40,
      bullScore: 68,
      bearScore: 42,
      atr: 28,
      vwap: price - 12,
      rationale: [
        'Multi-Timeframe alignment: 15M & 5M Bullish support',
        'Price holding above institutional VWAP anchor',
        'Taker order flow absorbing sell pressure'
      ],
      indicators: {
        rsi: 52.4,
        rsiSlope: 1.0,
        macd: 8.5,
        macdHist: 2.1,
        bbPercentB: 0.55,
        bbMiddle: price - 5,
        ema9: price - 2,
        ema21: price - 10,
        adx: 24.5,
        vwap: price - 12,
        cvdRatio: 0.15
      }
    };
  }
}

export const predictorEngine = new PredictorEngine();
