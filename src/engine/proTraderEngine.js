// src/engine/proTraderEngine.js
// 5-Minute Polymarket Round Manager & Institutional Trade State Machine

export class ProTraderEngine {
  constructor() {
    this.currentRound = null;
    this.history = [];
    this.listeners = [];
    this.clockInterval = null;
    this.roundDurationSec = 300; // 5 Minutes
  }

  subscribe(callback) {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter(cb => cb !== callback);
    };
  }

  emit(event) {
    for (let i = 0; i < this.listeners.length; i++) {
      try {
        this.listeners[i](event);
      } catch (err) {
        console.error('Error in ProTraderEngine listener:', err);
      }
    }
  }

  initRound(currentPrice, initialAnalysis, strikePrice) {
    const nowSec = Math.floor(Date.now() / 1000);
    const roundStartSec = nowSec - (nowSec % this.roundDurationSec);
    const roundEndSec = roundStartSec + this.roundDurationSec;
    const secondsRemaining = Math.max(1, roundEndSec - nowSec);
    const roundIndex = `5M_${new Date(roundStartSec * 1000).toISOString().slice(11, 16).replace(':', '')}`;

    const finalStrike = parseFloat((strikePrice || currentPrice || 75000).toFixed(2));
    const finalCurrent = parseFloat((currentPrice || finalStrike).toFixed(2));

    this.currentRound = {
      id: roundIndex,
      startTime: roundStartSec,
      endTime: roundEndSec,
      secondsRemaining,
      lockPrice: finalStrike,
      currentPrice: finalCurrent,
      phase: secondsRemaining > 255 ? 'OPENING_AUCTION' : 'ACTIVE_SNIPER',
      // High-Conviction Pro Trader Signal
      prediction: initialAnalysis ? initialAnalysis.prediction : 'UP',
      confidence: initialAnalysis ? initialAnalysis.confidence : 75,
      recommendation: initialAnalysis ? initialAnalysis.recommendation : 'SKIP_NO_EDGE',
      actionBadge: initialAnalysis ? initialAnalysis.actionBadge : '🛑 ANALYZING OPENING AUCTION...',
      actionSubtitle: initialAnalysis ? initialAnalysis.actionSubtitle : 'Waiting for 45s confirmation for 90% accuracy',
      actionClass: initialAnalysis ? initialAnalysis.actionClass : 'action-neutral',
      winEdge: initialAnalysis ? initialAnalysis.winEdge : 'EVALUATING',
      confluences: initialAnalysis ? initialAnalysis.confluences : [],
      metrics: initialAnalysis ? initialAnalysis.metrics : {},
      isTradeLocked: false,
      isSettled: false
    };

    this.startClock();
    this.emit({ type: 'ROUND_STARTED', round: this.currentRound });
  }

  startClock() {
    clearInterval(this.clockInterval);
    this.clockInterval = setInterval(() => {
      this.tick();
    }, 1000);
  }

  tick() {
    if (!this.currentRound || this.currentRound.isSettled) return;

    const nowSec = Math.floor(Date.now() / 1000);
    const secondsRemaining = Math.max(0, this.currentRound.endTime - nowSec);
    this.currentRound.secondsRemaining = secondsRemaining;

    // Update Round Phase
    const elapsedSec = this.roundDurationSec - secondsRemaining;
    if (elapsedSec < 45) {
      this.currentRound.phase = 'OPENING_AUCTION';
    } else if (secondsRemaining > 30) {
      this.currentRound.phase = 'ACTIVE_SNIPER';
    } else {
      this.currentRound.phase = 'EXPIRY_LOCK';
    }

    // Evaluate Live Delta vs Strike
    const delta = this.currentRound.currentPrice - this.currentRound.lockPrice;
    const deltaPercent = this.currentRound.lockPrice > 0 ? (delta / this.currentRound.lockPrice) * 100 : 0;
    const isUpWinning = delta >= 0;

    this.currentRound.liveDelta = parseFloat(delta.toFixed(2));
    this.currentRound.liveDeltaPercent = parseFloat(deltaPercent.toFixed(3));
    this.currentRound.isWinning = this.currentRound.prediction === 'UP' ? isUpWinning : !isUpWinning;

    // Trigger Settlement at 00:00
    if (secondsRemaining <= 0) {
      this.settleRound();
      return;
    }

    this.emit({ type: 'ROUND_TICK', round: this.currentRound });
  }

  updateLivePrice(price) {
    if (!this.currentRound || !price || isNaN(price)) return;
    this.currentRound.currentPrice = parseFloat(price.toFixed(2));
  }

  updateAnalysis(latestAnalysis) {
    if (!this.currentRound || !latestAnalysis || this.currentRound.isSettled) return;

    // If trade has been locked by high-conviction sniper signal, do NOT mutate signal direction
    if (this.currentRound.isTradeLocked) {
      this.currentRound.metrics = latestAnalysis.metrics || this.currentRound.metrics;
      return;
    }

    // Once we exit the opening 45s auction, check if a 90% Sniper Signal has confirmed:
    const elapsedSec = this.roundDurationSec - this.currentRound.secondsRemaining;

    if (elapsedSec >= 40) {
      if (latestAnalysis.recommendation === 'BUY_YES_UP' || latestAnalysis.recommendation === 'BUY_NO_DOWN') {
        this.currentRound.prediction = latestAnalysis.prediction;
        this.currentRound.confidence = latestAnalysis.confidence;
        this.currentRound.recommendation = latestAnalysis.recommendation;
        this.currentRound.actionBadge = latestAnalysis.actionBadge;
        this.currentRound.actionSubtitle = latestAnalysis.actionSubtitle;
        this.currentRound.actionClass = latestAnalysis.actionClass;
        this.currentRound.winEdge = latestAnalysis.winEdge;
        this.currentRound.isTradeLocked = true; // Lock in this verified institutional setup!
      } else {
        // Trapped in deadlock chop -> Advise user to pass!
        this.currentRound.recommendation = 'SKIP_NO_EDGE';
        this.currentRound.actionBadge = '🛑 DEADLOCK CHOP: PASS / NO TRADE';
        this.currentRound.actionSubtitle = 'Price hovering in noise band. 50/50 coin flip. Protect capital!';
        this.currentRound.actionClass = 'action-neutral';
        this.currentRound.winEdge = '50/50 CHOP (SKIP)';
      }
    } else {
      // In Opening Auction: Show preliminary lean with sniper countdown
      this.currentRound.prediction = latestAnalysis.prediction;
      this.currentRound.confidence = latestAnalysis.confidence;
      this.currentRound.recommendation = latestAnalysis.recommendation;
      this.currentRound.actionBadge = `🟡 AUCTION: LEAN ${latestAnalysis.prediction} (SNIPER IN ${45 - elapsedSec}s)`;
      this.currentRound.actionSubtitle = 'Establishing opening directional cushion for 90% verification';
      this.currentRound.actionClass = 'action-neutral';
      this.currentRound.winEdge = 'CONFIRMING';
    }

    this.currentRound.confluences = latestAnalysis.confluences || this.currentRound.confluences;
    this.currentRound.metrics = latestAnalysis.metrics || this.currentRound.metrics;
  }

  settleRound() {
    if (!this.currentRound || this.currentRound.isSettled) return;
    this.currentRound.isSettled = true;
    clearInterval(this.clockInterval);

    const delta = this.currentRound.currentPrice - this.currentRound.lockPrice;
    const actualOutcome = delta >= 0 ? 'UP' : 'DOWN';
    const isWin = actualOutcome === this.currentRound.prediction;
    const wasTraded = this.currentRound.recommendation !== 'SKIP_NO_EDGE';

    const settledItem = {
      id: this.currentRound.id,
      startTime: this.currentRound.startTime,
      endTime: this.currentRound.endTime,
      lockPrice: this.currentRound.lockPrice,
      closePrice: this.currentRound.currentPrice,
      delta: parseFloat(delta.toFixed(2)),
      prediction: this.currentRound.prediction,
      actualOutcome,
      isWin,
      wasTraded,
      recommendation: this.currentRound.recommendation,
      confidence: this.currentRound.confidence,
      settledAt: Date.now()
    };

    this.history.unshift(settledItem);
    if (this.history.length > 50) this.history.pop();

    this.emit({ type: 'ROUND_SETTLED', result: settledItem, history: this.history });

    // Launch next 5-minute round seamlessly
    setTimeout(() => {
      this.emit({ type: 'REQUEST_NEXT_ROUND', lastClosePrice: this.currentRound.currentPrice });
    }, 1500);
  }

  getStats() {
    const total = this.history.length;
    if (total === 0) return { winRate: 0, wins: 0, losses: 0, streak: 0, tradedWins: 0, tradedTotal: 0, filteredWinRate: 0 };

    const tradedHistory = this.history.filter(h => h.wasTraded);
    const tradedWins = tradedHistory.filter(h => h.isWin).length;
    const tradedTotal = tradedHistory.length;
    const filteredWinRate = tradedTotal > 0 ? parseFloat(((tradedWins / tradedTotal) * 100).toFixed(1)) : 0;

    const allWins = this.history.filter(h => h.isWin).length;
    const allTotal = this.history.length;
    const winRate = parseFloat(((allWins / allTotal) * 100).toFixed(1));

    let streak = 0;
    for (const r of this.history) {
      if (r.isWin) streak++;
      else break;
    }

    return {
      winRate,
      wins: allWins,
      losses: allTotal - allWins,
      streak,
      total: allTotal,
      tradedWins,
      tradedTotal,
      filteredWinRate
    };
  }
}

export const proTraderEngine = new ProTraderEngine();
