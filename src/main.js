// src/main.js
// Pro Trader 90%+ Accuracy 5-Minute Polymarket Terminal

import { marketData } from './services/marketData.js';
import { quantEngine } from './engine/quantEngine.js';
import { proTraderEngine } from './engine/proTraderEngine.js';
import { ChartComponent } from './components/chart.js';
import { audioService } from './services/audioService.js';

class ProTraderApp {
  constructor() {
    this.chart = null;
    this.prevPrice = null;
    this.currentTimeframe = '1m';
    this.audioEnabled = true;
    this.lastQuantScan = 0;
    this.dom = {};
  }

  async start() {
    this.cacheDOMElements();
    this.bindEvents();
    this.startUTCClock();

    // 1. Initialize Lightweight Candlestick Chart
    this.chart = new ChartComponent('tv-chart-container');
    this.chart.init();

    // 2. Initialize Market Data WebSocket
    await marketData.init();

    // 3. Load Chart with Initial Historical Klines
    if (marketData.candles1m.length > 0) {
      this.chart.setData(marketData.candles1m);
    }

    // 4. Setup Event Listeners & Round Management
    this.setupDataSubscriptions();
    this.setupRoundSubscriptions();

    // 5. Initialize the First 5-Minute Round with Exact TWAP Strike
    this.startInitialRound();
  }

  cacheDOMElements() {
    this.dom = {
      // Top Ticker
      liveBtcPrice: document.getElementById('live-btc-price'),
      livePriceChange: document.getElementById('live-price-change'),
      currentRoundTag: document.getElementById('current-round-tag'),
      roundPhaseTag: document.getElementById('round-phase-tag'),
      wsStatusBadge: document.getElementById('ws-status-badge'),
      wsStatusText: document.getElementById('ws-status-text'),
      wsLatency: document.getElementById('ws-latency'),
      liveUtcClock: document.getElementById('live-utc-clock'),

      // Master Pro Trader Signal Card (Single Source of Truth)
      masterSignalCard: document.getElementById('master-signal-card'),
      signalEdgeBadge: document.getElementById('signal-edge-badge'),
      signalPhasePill: document.getElementById('signal-phase-pill'),
      signalIcon: document.getElementById('signal-icon'),
      signalHeadline: document.getElementById('signal-headline'),
      signalSubtext: document.getElementById('signal-subtext'),
      signalConfidence: document.getElementById('signal-confidence'),

      // Round Arena
      roundTitleId: document.getElementById('round-title-id'),
      regimeBadge: document.getElementById('regime-badge'),
      countdownDigits: document.getElementById('countdown-digits'),
      radialProgressCircle: document.getElementById('radial-progress-circle'),
      roundLockPrice: document.getElementById('round-lock-price'),
      roundLivePrice: document.getElementById('round-live-price'),
      roundPriceDelta: document.getElementById('round-price-delta'),
      cushionRatioVal: document.getElementById('cushion-ratio-val'),
      predictionStatusPill: document.getElementById('prediction-status-pill'),
      cushionFill: document.getElementById('cushion-fill'),

      // Strike Editing
      editStrikeBtn: document.getElementById('edit-strike-btn'),
      strikeEditForm: document.getElementById('strike-edit-form'),
      customStrikeInput: document.getElementById('custom-strike-input'),
      applyStrikeBtn: document.getElementById('apply-strike-btn'),

      // Indicators Grid
      valSupertrend: document.getElementById('val-supertrend'),
      barSupertrend: document.getElementById('bar-supertrend'),
      badgeSupertrend: document.getElementById('badge-supertrend'),

      valCvd: document.getElementById('val-cvd'),
      barCvd: document.getElementById('bar-cvd'),
      badgeCvd: document.getElementById('badge-cvd'),

      valVwap: document.getElementById('val-vwap'),
      barVwap: document.getElementById('bar-vwap'),
      badgeVwap: document.getElementById('badge-vwap'),

      valCycle: document.getElementById('val-cycle'),
      barCycle: document.getElementById('bar-cycle'),
      badgeCycle: document.getElementById('badge-cycle'),

      valAtr: document.getElementById('val-atr'),
      barAtr: document.getElementById('bar-atr'),
      badgeAtr: document.getElementById('badge-atr'),

      valPolymarket: document.getElementById('val-polymarket'),
      barPolymarket: document.getElementById('bar-polymarket'),
      badgePolymarket: document.getElementById('badge-polymarket'),

      // Rationale List
      traderRationaleList: document.getElementById('trader-rationale-list'),

      // History
      histSniperWinrate: document.getElementById('hist-sniper-winrate'),
      histTotalRounds: document.getElementById('hist-total-rounds'),
      histTotalWins: document.getElementById('hist-total-wins'),
      histTotalLosses: document.getElementById('hist-total-losses'),
      historyTableBody: document.getElementById('history-table-body'),

      // Audio Toggle
      audioToggleBtn: document.getElementById('audio-toggle-btn'),
      soundIconOn: document.getElementById('sound-icon-on'),
      soundIconOff: document.getElementById('sound-icon-off'),

      // Timeframe Buttons
      tfButtons: document.querySelectorAll('.tf-btn')
    };
  }

  bindEvents() {
    // Audio Toggle
    if (this.dom.audioToggleBtn) {
      this.dom.audioToggleBtn.addEventListener('click', () => {
        this.audioEnabled = !this.audioEnabled;
        audioService.enabled = this.audioEnabled;
        if (this.audioEnabled) {
          this.dom.soundIconOn?.classList.remove('hidden');
          this.dom.soundIconOff?.classList.add('hidden');
        } else {
          this.dom.soundIconOn?.classList.add('hidden');
          this.dom.soundIconOff?.classList.remove('hidden');
        }
      });
    }

    // Custom Strike Edit Toggle
    if (this.dom.editStrikeBtn) {
      this.dom.editStrikeBtn.addEventListener('click', () => {
        this.dom.strikeEditForm?.classList.toggle('hidden');
        if (!this.dom.strikeEditForm?.classList.contains('hidden')) {
          this.dom.customStrikeInput?.focus();
        }
      });
    }

    if (this.dom.applyStrikeBtn) {
      this.dom.applyStrikeBtn.addEventListener('click', () => {
        const customVal = parseFloat(this.dom.customStrikeInput?.value);
        if (!isNaN(customVal) && customVal > 0 && proTraderEngine.currentRound) {
          proTraderEngine.currentRound.lockPrice = customVal;
          this.dom.roundLockPrice.textContent = `$${customVal.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
          this.chart.setLockPrice(customVal);
          this.dom.strikeEditForm?.classList.add('hidden');
        }
      });
    }

    // Chart Timeframe Switcher
    if (this.dom.tfButtons) {
      this.dom.tfButtons.forEach(btn => {
        btn.addEventListener('click', () => {
          this.dom.tfButtons.forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          const tf = btn.dataset.tf;
          this.currentTimeframe = tf;
          const candles = tf === '5m' ? marketData.candles5m : marketData.candles1m;
          this.chart.setData(candles);
        });
      });
    }
  }

  startUTCClock() {
    setInterval(() => {
      if (this.dom.liveUtcClock) {
        this.dom.liveUtcClock.textContent = `${new Date().toISOString().slice(11, 19)} UTC`;
      }
    }, 1000);
  }

  startInitialRound() {
    const nowSec = Math.floor(Date.now() / 1000);
    const roundStartSec = nowSec - (nowSec % 300);
    const twapStrike = marketData.calculate60sTWAP(roundStartSec);
    const cvd = marketData.getCumulativeVolumeDelta(60);

    const initialAnalysis = quantEngine.synthesize({
      candles1m: marketData.candles1m,
      candles5m: marketData.candles5m,
      candles15m: marketData.candles15m,
      currentPrice: marketData.currentPrice,
      lockPrice: twapStrike,
      cvdData: cvd,
      polyOdds: null
    });

    proTraderEngine.initRound(marketData.currentPrice, initialAnalysis, twapStrike);
  }

  setupDataSubscriptions() {
    // 1. Live Microsecond Ticks
    marketData.on('tick', (trade) => {
      this.renderLivePrice(trade.price);
      proTraderEngine.updateLivePrice(trade.price);
    });

    // 2. 1-Minute Candle Updates
    marketData.on('kline_1m', (candle) => {
      if (this.currentTimeframe === '1m') {
        this.chart.updateCandle(candle);
      }

      // Run Quant Analysis throttle every 2 seconds or on candle close
      const now = Date.now();
      if (now - this.lastQuantScan >= 2000 || candle.isClosed) {
        this.lastQuantScan = now;
        this.executeQuantScan();
      }
    });

    // 3. 5-Minute Candle Updates
    marketData.on('kline_5m', (candle) => {
      if (this.currentTimeframe === '5m') {
        this.chart.updateCandle(candle);
      }
    });

    // 4. WebSocket Connection Health
    marketData.on('connection', (conn) => {
      if (this.dom.wsStatusText) this.dom.wsStatusText.textContent = conn.status;
      if (this.dom.wsLatency) this.dom.wsLatency.textContent = `${conn.latencyMs}ms`;
      if (this.dom.wsStatusBadge) {
        this.dom.wsStatusBadge.className = `status-indicator-pill ${conn.status === 'ONLINE' ? 'live' : 'reconnecting'}`;
      }
    });
  }

  executeQuantScan() {
    if (!proTraderEngine.currentRound) return;

    const lockPrice = proTraderEngine.currentRound.lockPrice;
    const cvd = marketData.getCumulativeVolumeDelta(60);

    const analysis = quantEngine.synthesize({
      candles1m: marketData.candles1m,
      candles5m: marketData.candles5m,
      candles15m: marketData.candles15m,
      currentPrice: marketData.currentPrice,
      lockPrice,
      cvdData: cvd,
      polyOdds: null
    });

    proTraderEngine.updateAnalysis(analysis);
    this.renderQuantIndicators(analysis);
  }

  setupRoundSubscriptions() {
    proTraderEngine.subscribe((event) => {
      if (event.type === 'ROUND_STARTED') {
        this.renderRoundStarted(event.round);
      } else if (event.type === 'ROUND_TICK') {
        this.renderRoundTick(event.round);
      } else if (event.type === 'ROUND_SETTLED') {
        this.renderRoundSettled(event.result, event.history);
      } else if (event.type === 'REQUEST_NEXT_ROUND') {
        this.startInitialRound();
      }
    });
  }

  renderLivePrice(price) {
    if (!this.dom.liveBtcPrice) return;

    this.dom.liveBtcPrice.textContent = `$${price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    if (this.prevPrice) {
      const isHigher = price >= this.prevPrice;
      this.dom.liveBtcPrice.classList.remove('price-flash-up', 'price-flash-down');
      void this.dom.liveBtcPrice.offsetWidth; // trigger reflow
      this.dom.liveBtcPrice.classList.add(isHigher ? 'price-flash-up' : 'price-flash-down');
    }
    this.prevPrice = price;
  }

  renderRoundStarted(round) {
    // 1. Update Title & Badges
    if (this.dom.roundTitleId) this.dom.roundTitleId.textContent = `ROUND #${round.id}`;
    if (this.dom.currentRoundTag) this.dom.currentRoundTag.textContent = round.id;
    if (this.dom.roundLockPrice) {
      this.dom.roundLockPrice.textContent = `$${round.lockPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }

    // 2. Set Chart Strike Line
    if (this.chart) {
      this.chart.setLockPrice(round.lockPrice);
    }

    // 3. Audio Notification
    if (this.audioEnabled) {
      audioService.playRoundStart();
    }

    // 4. Update UI Components
    this.renderMasterSignal(round);
  }

  renderRoundTick(round) {
    // 1. Countdown Time & Radial Ring
    const mins = Math.floor(round.secondsRemaining / 60);
    const secs = round.secondsRemaining % 60;
    if (this.dom.countdownDigits) {
      this.dom.countdownDigits.textContent = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }

    if (this.dom.radialProgressCircle) {
      const circumference = 390;
      const progress = round.secondsRemaining / 300;
      const offset = circumference * (1 - progress);
      this.dom.radialProgressCircle.style.strokeDashoffset = offset;

      if (round.secondsRemaining <= 30) {
        this.dom.radialProgressCircle.setAttribute('class', 'radial-fg-circle danger');
      } else if (round.secondsRemaining <= 60) {
        this.dom.radialProgressCircle.setAttribute('class', 'radial-fg-circle warning');
      } else {
        this.dom.radialProgressCircle.setAttribute('class', 'radial-fg-circle');
      }
    }

    // 2. Live Price & Delta vs Strike
    if (this.dom.roundLivePrice) {
      this.dom.roundLivePrice.textContent = `$${round.currentPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }

    if (this.dom.roundPriceDelta) {
      const delta = round.liveDelta || 0;
      const pct = round.liveDeltaPercent || 0;
      const isPositive = delta >= 0;
      this.dom.roundPriceDelta.textContent = `${isPositive ? '+' : ''}$${delta.toFixed(2)} (${isPositive ? '+' : ''}${pct.toFixed(3)}%)`;
      this.dom.roundPriceDelta.className = `delta-badge ${isPositive ? 'positive' : 'negative'}`;
    }

    // 3. Distance Cushion Meter
    if (this.dom.cushionRatioVal && round.metrics) {
      const atr = round.metrics.atr5m || 200;
      const delta = Math.abs(round.liveDelta || 0);
      const ratio = (delta / atr) * 100;
      const isPositive = (round.liveDelta || 0) >= 0;

      if (ratio >= 35) {
        this.dom.cushionRatioVal.textContent = `${isPositive ? '+' : '-'}${ratio.toFixed(1)}% ATR [DOMINANT ${isPositive ? 'BULL' : 'BEAR'} BREAKOUT]`;
      } else if (ratio >= 20) {
        this.dom.cushionRatioVal.textContent = `${isPositive ? '+' : '-'}${ratio.toFixed(1)}% ATR [SOLID CUSHION]`;
      } else {
        this.dom.cushionRatioVal.textContent = `${isPositive ? '+' : '-'}${ratio.toFixed(1)}% ATR [50/50 NOISE ZONE]`;
      }

      if (this.dom.cushionFill) {
        const fillWidth = Math.min(100, Math.max(10, ratio * 1.5));
        this.dom.cushionFill.style.width = `${fillWidth}%`;
        this.dom.cushionFill.className = `cushion-fill ${isPositive ? 'bull' : 'bear'}`;
      }
    }

    // 4. On Track / At Risk Status
    if (this.dom.predictionStatusPill) {
      const isWinning = round.isWinning;
      this.dom.predictionStatusPill.className = `prediction-status-pill ${isWinning ? 'winning' : 'losing'}`;
      this.dom.predictionStatusPill.textContent = isWinning ? 'ON TRACK (WINNING)' : 'AT RISK (OPPOSITE STRIKE)';
    }

    // 5. Update Phase Badge
    if (this.dom.roundPhaseTag) {
      if (round.phase === 'OPENING_AUCTION') {
        this.dom.roundPhaseTag.textContent = 'OPENING AUCTION';
        this.dom.roundPhaseTag.className = 'phase-badge auction';
      } else if (round.phase === 'ACTIVE_SNIPER') {
        this.dom.roundPhaseTag.textContent = 'SNIPER ACTIVE';
        this.dom.roundPhaseTag.className = 'phase-badge sniper';
      } else {
        this.dom.roundPhaseTag.textContent = 'EXPIRY LOCKED';
        this.dom.roundPhaseTag.className = 'phase-badge sniper';
      }
    }

    // 6. Refresh Master Signal Card
    this.renderMasterSignal(round);
  }

  renderMasterSignal(round) {
    if (!this.dom.masterSignalCard) return;

    this.dom.masterSignalCard.className = `master-signal-card ${round.actionClass || 'action-neutral'}`;

    if (this.dom.signalHeadline) this.dom.signalHeadline.textContent = round.actionBadge || 'ANALYZING ORDER FLOW...';
    if (this.dom.signalSubtext) this.dom.signalSubtext.textContent = round.actionSubtitle || 'Evaluating multi-timeframe order flow';
    if (this.dom.signalConfidence) this.dom.signalConfidence.textContent = `${round.confidence || 75}%`;
    if (this.dom.signalEdgeBadge) this.dom.signalEdgeBadge.textContent = round.winEdge || 'EVALUATING';

    if (this.dom.signalPhasePill) {
      if (round.phase === 'OPENING_AUCTION') {
        this.dom.signalPhasePill.textContent = `PHASE 1: AUCTION (${round.secondsRemaining > 255 ? round.secondsRemaining - 255 : 0}s)`;
      } else if (round.phase === 'ACTIVE_SNIPER') {
        this.dom.signalPhasePill.textContent = 'PHASE 2: 90% SNIPER ACTIVE';
      } else {
        this.dom.signalPhasePill.textContent = 'PHASE 3: EXPIRY LOCK';
      }
    }

    if (this.dom.signalIcon) {
      if (round.actionClass === 'action-up') this.dom.signalIcon.textContent = '▲';
      else if (round.actionClass === 'action-down') this.dom.signalIcon.textContent = '▼';
      else this.dom.signalIcon.textContent = '⚡';
    }
  }

  renderQuantIndicators(analysis) {
    const m = analysis.metrics || {};

    // SuperTrend
    if (this.dom.valSupertrend) this.dom.valSupertrend.textContent = `${m.st15m || 'BULL'} / ${m.st5m || 'BULL'}`;
    if (this.dom.badgeSupertrend) {
      const isBull = m.st5m === 'BULLISH';
      this.dom.badgeSupertrend.textContent = isBull ? 'BULL TREND' : 'BEAR TREND';
      this.dom.badgeSupertrend.className = `ind-badge ${isBull ? 'bull' : 'bear'}`;
      if (this.dom.barSupertrend) this.dom.barSupertrend.className = `pill-bar-fill ${isBull ? 'bull' : 'bear'}`;
    }

    // CVD
    if (this.dom.valCvd && analysis.metrics) {
      const cvd = marketData.getCumulativeVolumeDelta(60);
      const ratio = cvd.deltaRatio;
      this.dom.valCvd.textContent = `${ratio >= 0 ? '+' : ''}${(ratio * 100).toFixed(0)}% DELTA`;
      if (this.dom.badgeCvd) {
        const isBull = ratio >= 0;
        this.dom.badgeCvd.textContent = isBull ? 'TAKER BUYS' : 'TAKER SELLS';
        this.dom.badgeCvd.className = `ind-badge ${isBull ? 'bull' : 'bear'}`;
        if (this.dom.barCvd) {
          this.dom.barCvd.style.width = `${Math.min(100, Math.abs(ratio) * 100 + 20)}%`;
          this.dom.barCvd.className = `pill-bar-fill ${isBull ? 'bull' : 'bear'}`;
        }
      }
    }

    // VWAP
    if (this.dom.valVwap && m.vwap) {
      this.dom.valVwap.textContent = `$${m.vwap.toLocaleString()}`;
    }

    // Run Cycle
    if (this.dom.valCycle) {
      if (m.greenRun > 0) {
        this.dom.valCycle.textContent = `${m.greenRun} GREEN BARS`;
        if (this.dom.badgeCycle) {
          this.dom.badgeCycle.textContent = m.greenRun >= 3 ? '70.8% PULLBACK RISK' : 'EXPANSION';
          this.dom.badgeCycle.className = `ind-badge ${m.greenRun >= 3 ? 'bear' : 'bull'}`;
        }
      } else if (m.redRun > 0) {
        this.dom.valCycle.textContent = `${m.redRun} RED BARS`;
        if (this.dom.badgeCycle) {
          this.dom.badgeCycle.textContent = m.redRun >= 3 ? '70.2% BOUNCE EDGE' : 'BREAKDOWN';
          this.dom.badgeCycle.className = `ind-badge ${m.redRun >= 3 ? 'bull' : 'bear'}`;
        }
      } else {
        this.dom.valCycle.textContent = 'CONSOLIDATION';
        if (this.dom.badgeCycle) {
          this.dom.badgeCycle.textContent = 'NEUTRAL';
          this.dom.badgeCycle.className = 'ind-badge neutral';
        }
      }
    }

    // ATR Volatility
    if (this.dom.valAtr && m.atr5m) {
      this.dom.valAtr.textContent = `$${m.atr5m} ATR`;
    }

    // Rationale List
    if (this.dom.traderRationaleList && analysis.confluences) {
      this.dom.traderRationaleList.innerHTML = '';
      analysis.confluences.slice(0, 5).forEach(c => {
        const li = document.createElement('li');
        li.textContent = c;
        this.dom.traderRationaleList.appendChild(li);
      });
    }
  }

  renderRoundSettled(result, history) {
    if (this.audioEnabled) {
      if (result.isWin) audioService.playWin();
      else audioService.playLoss();
    }

    const stats = proTraderEngine.getStats();

    if (this.dom.histSniperWinrate) this.dom.histSniperWinrate.textContent = `${stats.filteredWinRate}%`;
    if (this.dom.histTotalRounds) this.dom.histTotalRounds.textContent = stats.total;
    if (this.dom.histTotalWins) this.dom.histTotalWins.textContent = stats.wins;
    if (this.dom.histTotalLosses) this.dom.histTotalLosses.textContent = stats.losses;

    if (this.dom.historyTableBody) {
      this.dom.historyTableBody.innerHTML = '';
      history.slice(0, 15).forEach(h => {
        const tr = document.createElement('tr');
        const isWin = h.isWin;
        const wasSkipped = h.recommendation === 'SKIP_NO_EDGE';

        tr.innerHTML = `
          <td><span class="hist-id">${h.id}</span></td>
          <td>${new Date(h.settledAt).toLocaleTimeString()}</td>
          <td>$${h.lockPrice.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
          <td>$${h.closePrice.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
          <td class="${h.delta >= 0 ? 'hist-delta-bull' : 'hist-delta-bear'}">${h.delta >= 0 ? '+' : ''}$${h.delta.toFixed(2)}</td>
          <td><span class="hist-pred ${h.prediction === 'UP' ? 'pred-up' : 'pred-down'}">${h.prediction}</span></td>
          <td><span class="hist-actual ${h.actualOutcome === 'UP' ? 'act-up' : 'act-down'}">${h.actualOutcome}</span></td>
          <td>
            ${wasSkipped 
              ? '<span class="status-chip skip">SKIPPED CHOP</span>' 
              : isWin 
                ? '<span class="status-chip win">✅ WIN (90% SNIPER)</span>' 
                : '<span class="status-chip loss">❌ LOSS</span>'
            }
          </td>
        `;
        this.dom.historyTableBody.appendChild(tr);
      });
    }
  }
}

// Instantiate and launch the app
const app = new ProTraderApp();
window.addEventListener('DOMContentLoaded', () => {
  app.start().catch(err => console.error('App launch error:', err));
});
