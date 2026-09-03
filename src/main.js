// src/main.js
// Main Application Coordinator for BTC Pulse Predictor

import { dataService } from './services/dataService.js';
import { chainlinkService } from './services/chainlinkService.js';
import { predictorEngine } from './engine/predictor.js';
import { roundManager } from './engine/roundManager.js';
import { audioService } from './services/audioService.js';
import { ChartComponent } from './components/chart.js';

class App {
  constructor() {
    this.chart = null;
    this.candles1m = [];
    this.candles5m = [];
    this.candles15m = [];
    this.activeTimeframe = '1m';
    this.prevPrice = 0;
    this.latestAnalysis = null;
    
    // DOM Elements
    this.dom = {};
  }

  async init() {
    this.cacheDom();
    this.bindEvents();
    this.initClock();

    // 1. Initialize Chart
    this.chart = new ChartComponent('tv-chart-container');
    this.chart.init();

    // 2. Load Multi-Timeframe Historical Candles (1m, 5m, 15m)
    try {
      const [k1m, k5m, k15m] = await Promise.all([
        dataService.fetchHistoricalKlines('1m', 120),
        dataService.fetchHistoricalKlines('5m', 60),
        dataService.fetchHistoricalKlines('15m', 30)
      ]);
      this.candles1m = k1m || [];
      this.candles5m = k5m || [];
      this.candles15m = k15m || [];

      if (this.candles1m.length > 0) {
        this.chart.setData(this.candles1m);
        const lastCandle = this.candles1m[this.candles1m.length - 1];
        this.prevPrice = lastCandle.close;
        this.updateLivePriceDisplay(lastCandle.close);
      }
    } catch (e) {
      console.warn('Initial klines load error:', e);
    }

    // 3. Perform Initial Multi-Timeframe Quant Analysis
    const currentPrice = this.prevPrice || 75000;
    const cvdData = dataService.getCumulativeVolumeDelta(60);
    this.latestAnalysis = predictorEngine.analyzeMarket({
      candles1m: this.candles1m,
      candles5m: this.candles5m,
      candles15m: this.candles15m,
      currentPrice,
      cvdData
    });

    this.renderTraderBrain(this.latestAnalysis);

    // 4. Setup Subscriptions FIRST before initializing round
    this.setupRoundSubscriptions();
    this.setupDataSubscriptions();

    // 5. Initialize 5-Minute Round Manager
    // Use the 5m candle open price if available, otherwise currentPrice
    const candleOpen = this.candles1m.length > 0 ? this.candles1m[this.candles1m.length - 1].open : currentPrice;
    roundManager.initRound(currentPrice, this.latestAnalysis, candleOpen);

    // 6. Explicitly render the active round on screen immediately
    if (roundManager.currentRound) {
      this.renderRoundStarted(roundManager.currentRound);
    }

    // 7. Connect Binance Live Streams
    dataService.connectWebSocket();

    // 8. Initialize Chainlink Oracle & Snipe Intelligence
    chainlinkService.start(() => this.prevPrice || 75000);
    chainlinkService.subscribe((data) => this.renderChainlinkOracle(data));

    // 9. Initial History & Bankroll Render
    this.renderHistory(roundManager.history);
    this.renderBankroll(roundManager.getStats());
  }

  cacheDom() {
    this.dom = {
      livePrice: document.getElementById('live-btc-price'),
      priceChange: document.getElementById('live-price-change'),
      high24h: document.getElementById('ticker-24h-high'),
      low24h: document.getElementById('ticker-24h-low'),
      wsBadge: document.getElementById('ws-status-badge'),
      wsText: document.getElementById('ws-status-text'),
      wsLatency: document.getElementById('ws-latency'),
      audioBtn: document.getElementById('audio-toggle-btn'),
      soundIconOn: document.getElementById('sound-icon-on'),
      soundIconOff: document.getElementById('sound-icon-off'),
      utcClock: document.getElementById('live-utc-clock'),

      // Round Hero & Badges
      roundTitle: document.getElementById('round-title-id'),
      regimeBadge: document.getElementById('regime-badge'),
      mtfDot15m: document.getElementById('mtf-dot-15m'),
      mtfDot5m: document.getElementById('mtf-dot-5m'),
      mtfDot1m: document.getElementById('mtf-dot-1m'),
      radialProgress: document.getElementById('radial-progress-circle'),
      countdownDigits: document.getElementById('countdown-digits'),
      lockPrice: document.getElementById('round-lock-price'),
      editStrikeBtn: document.getElementById('edit-strike-btn'),
      strikeEditForm: document.getElementById('strike-edit-form'),
      customStrikeInput: document.getElementById('custom-strike-input'),
      applyStrikeBtn: document.getElementById('apply-strike-btn'),
      roundLivePrice: document.getElementById('round-live-price'),
      roundDelta: document.getElementById('round-price-delta'),
      predictionBanner: document.getElementById('prediction-banner'),
      predictionIcon: document.getElementById('prediction-icon'),
      predictionDir: document.getElementById('prediction-direction'),
      predictionGrade: document.getElementById('prediction-grade'),
      predictionConf: document.getElementById('prediction-confidence'),
      targetPrice: document.getElementById('prediction-target-price'),
      predictionStatusTag: document.getElementById('prediction-status-tag'),
      predictionStatusText: document.getElementById('prediction-status-text'),
      probUpText: document.getElementById('prob-up-text'),
      probDownText: document.getElementById('prob-down-text'),
      probBarFill: document.getElementById('probability-bar-fill'),

      // Trader Brain
      valRsi: document.getElementById('val-rsi'),
      barRsi: document.getElementById('bar-rsi'),
      badgeRsi: document.getElementById('badge-rsi'),
      valMacd: document.getElementById('val-macd'),
      barMacd: document.getElementById('bar-macd'),
      badgeMacd: document.getElementById('badge-macd'),
      valEma: document.getElementById('val-ema'),
      badgeEma: document.getElementById('badge-ema'),
      valAdx: document.getElementById('val-adx'),
      barAdx: document.getElementById('bar-adx'),
      badgeAdx: document.getElementById('badge-adx'),
      valVwap: document.getElementById('val-vwap'),
      barVwap: document.getElementById('bar-vwap'),
      badgeVwap: document.getElementById('badge-vwap'),
      valCvd: document.getElementById('val-cvd'),
      barCvd: document.getElementById('bar-cvd'),
      badgeCvd: document.getElementById('badge-cvd'),
      valChainlink: document.getElementById('val-chainlink'),
      barChainlink: document.getElementById('bar-chainlink'),
      badgeChainlink: document.getElementById('badge-chainlink'),
      clOraclePrice: document.getElementById('cl-oracle-price'),
      clUpdateTime: document.getElementById('cl-update-time'),
      clOracleDrift: document.getElementById('cl-oracle-drift'),
      clDriftStatus: document.getElementById('cl-drift-status'),
      clSnipeBadge: document.getElementById('cl-snipe-badge'),
      clSnipeStatus: document.getElementById('cl-snipe-status'),
      rationaleList: document.getElementById('trader-rationale-list'),

      // Bankroll
      bankrollBalance: document.getElementById('bankroll-balance'),
      bankrollWinrate: document.getElementById('bankroll-winrate'),
      bankrollStreak: document.getElementById('bankroll-streak'),
      stakeInput: document.getElementById('round-stake-input'),
      autotradeBtn: document.getElementById('autotrade-btn'),
      autotradeLabel: document.getElementById('autotrade-label'),
      resetBankrollBtn: document.getElementById('reset-bankroll-btn'),

      // History
      histTotalRounds: document.getElementById('hist-total-rounds'),
      histTotalWins: document.getElementById('hist-total-wins'),
      histTotalLosses: document.getElementById('hist-total-losses'),
      histTotalPnl: document.getElementById('hist-total-pnl'),
      historyTableBody: document.getElementById('history-table-body'),

      // Chart TF
      tfBtns: document.querySelectorAll('.tf-btn')
    };

    // Set initial audio icon state
    this.updateAudioButtonState();
  }

  bindEvents() {
    // Audio Toggle
    this.dom.audioBtn.addEventListener('click', () => {
      const isMuted = audioService.toggleMute();
      this.updateAudioButtonState();
      if (!isMuted) audioService.playTick();
    });

    // Auto Trade Toggle
    this.dom.autotradeBtn.addEventListener('click', () => {
      const enabled = roundManager.toggleAutoTrade();
      this.dom.autotradeBtn.classList.toggle('active', enabled);
      this.dom.autotradeBtn.classList.toggle('inactive', !enabled);
      this.dom.autotradeLabel.textContent = enabled ? 'ON' : 'OFF';
      audioService.playTick();
    });

    // Stake Input
    this.dom.stakeInput.addEventListener('change', (e) => {
      roundManager.setStake(e.target.value);
    });

    // Reset Bankroll
    this.dom.resetBankrollBtn.addEventListener('click', () => {
      roundManager.resetBankroll();
      this.renderBankroll(roundManager.getStats());
      this.renderHistory(roundManager.history);
      audioService.playTick();
    });

    // Price to Beat (Strike) Manual Sync & Edit
    if (this.dom.editStrikeBtn) {
      this.dom.editStrikeBtn.addEventListener('click', () => {
        this.dom.strikeEditForm.classList.toggle('hidden');
        if (!this.dom.strikeEditForm.classList.contains('hidden')) {
          this.dom.customStrikeInput.value = roundManager.currentRound ? roundManager.currentRound.lockPrice : '';
          this.dom.customStrikeInput.focus();
        }
      });
    }

    if (this.dom.applyStrikeBtn) {
      this.dom.applyStrikeBtn.addEventListener('click', () => {
        const val = parseFloat(this.dom.customStrikeInput.value);
        if (!isNaN(val) && val > 0) {
          roundManager.setLockPrice(val);
          this.dom.lockPrice.textContent = `$${val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
          this.dom.strikeEditForm.classList.add('hidden');
          audioService.playTick();
        }
      });
    }

    if (this.dom.customStrikeInput) {
      this.dom.customStrikeInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          this.dom.applyStrikeBtn.click();
        }
      });
    }

    // Timeframe selector
    this.dom.tfBtns.forEach(btn => {
      btn.addEventListener('click', async () => {
        this.dom.tfBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const tf = btn.getAttribute('data-tf');
        this.activeTimeframe = tf;
        const klines = await dataService.fetchHistoricalKlines(tf, 100);
        if (klines && klines.length > 0) {
          this.chart.setData(klines);
        }
      });
    });
  }

  updateAudioButtonState() {
    const isMuted = audioService.isMuted;
    this.dom.audioBtn.classList.toggle('muted', isMuted);
    if (isMuted) {
      this.dom.soundIconOn.classList.add('hidden');
      this.dom.soundIconOff.classList.remove('hidden');
    } else {
      this.dom.soundIconOn.classList.remove('hidden');
      this.dom.soundIconOff.classList.add('hidden');
    }
  }

  initClock() {
    const update = () => {
      const now = new Date();
      this.dom.utcClock.textContent = now.toUTCString().split(' ')[4] + ' UTC';
    };
    update();
    setInterval(update, 1000);
  }

  setupDataSubscriptions() {
    // Tick Trades
    dataService.subscribe('tick', (trade) => {
      const price = trade.price;
      this.updateLivePriceDisplay(price);

      // Update current candle on chart in real-time
      if (this.candles1m.length > 0) {
        const lastCandle = this.candles1m[this.candles1m.length - 1];
        lastCandle.close = price;
        lastCandle.high = Math.max(lastCandle.high, price);
        lastCandle.low = Math.min(lastCandle.low, price);
        lastCandle.volume += trade.quantity;
        this.chart.updateCandle(lastCandle);
      }

      // Notify round manager with live price
      roundManager.tick(price);
    });

    // 1-Minute Kline Updates
    dataService.subscribe('kline1m', (candle) => {
      if (this.candles1m.length === 0) {
        this.candles1m.push(candle);
      } else {
        const last = this.candles1m[this.candles1m.length - 1];
        if (last.time === candle.time) {
          this.candles1m[this.candles1m.length - 1] = candle;
        } else {
          this.candles1m.push(candle);
          if (this.candles1m.length > 150) this.candles1m.shift();
        }
      }

      this.chart.updateCandle(candle);

      // Run Quant Analysis every 1m bar or on substantial updates
      const cvdData = dataService.getCumulativeVolumeDelta(60);
      const lockPrice = roundManager.currentRound ? roundManager.currentRound.lockPrice : null;
      this.latestAnalysis = predictorEngine.analyzeMarket({
        candles1m: this.candles1m,
        candles5m: this.candles5m,
        candles15m: this.candles15m,
        currentPrice: candle.close,
        cvdData,
        lockPrice
      });

      roundManager.updatePrediction(this.latestAnalysis);
      this.renderTraderBrain(this.latestAnalysis);
    });

    // 5-Minute Kline Updates
    dataService.subscribe('kline5m', (candle) => {
      if (this.candles5m.length === 0) {
        this.candles5m.push(candle);
      } else {
        const last = this.candles5m[this.candles5m.length - 1];
        if (last.time === candle.time) {
          this.candles5m[this.candles5m.length - 1] = candle;
        } else {
          this.candles5m.push(candle);
          if (this.candles5m.length > 80) this.candles5m.shift();
        }
      }
    });

    // 15-Minute Kline Updates
    dataService.subscribe('kline15m', (candle) => {
      if (this.candles15m.length === 0) {
        this.candles15m.push(candle);
      } else {
        const last = this.candles15m[this.candles15m.length - 1];
        if (last.time === candle.time) {
          this.candles15m[this.candles15m.length - 1] = candle;
        } else {
          this.candles15m.push(candle);
          if (this.candles15m.length > 50) this.candles15m.shift();
        }
      }
    });

    // 24H Ticker Updates
    dataService.subscribe('ticker', (ticker) => {
      this.dom.high24h.textContent = `$${ticker.high24h.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
      this.dom.low24h.textContent = `$${ticker.low24h.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;

      const isPos = ticker.changePercent >= 0;
      this.dom.priceChange.textContent = `${isPos ? '+' : ''}${ticker.changePercent.toFixed(2)}%`;
      this.dom.priceChange.className = `change-pill ${isPos ? 'positive' : 'negative'}`;
    });

    // WebSocket Status
    dataService.subscribe('status', ({ status, latency }) => {
      if (status === 'CONNECTED') {
        this.dom.wsBadge.className = 'status-indicator-pill live';
        this.dom.wsText.textContent = 'LIVE';
        this.dom.wsLatency.textContent = `${latency}ms`;
      } else {
        this.dom.wsBadge.className = 'status-indicator-pill disconnected';
        this.dom.wsText.textContent = status;
        this.dom.wsLatency.textContent = '--';
      }
    });
  }

  updateLivePriceDisplay(price) {
    const formatted = `$${price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    this.dom.livePrice.textContent = formatted;

    if (this.prevPrice) {
      if (price > this.prevPrice) {
        this.dom.livePrice.classList.add('price-flash-up');
        this.dom.livePrice.classList.remove('price-flash-down');
      } else if (price < this.prevPrice) {
        this.dom.livePrice.classList.add('price-flash-down');
        this.dom.livePrice.classList.remove('price-flash-up');
      }

      setTimeout(() => {
        this.dom.livePrice.classList.remove('price-flash-up', 'price-flash-down');
      }, 400);
    }
    this.prevPrice = price;
  }

  setupRoundSubscriptions() {
    roundManager.subscribe((event) => {
      if (event.type === 'ROUND_STARTED' || event.type === 'ROUND_UPDATED') {
        this.renderRoundStarted(event.round);
      } else if (event.type === 'TICK') {
        this.renderRoundTick(event.round);
      } else if (event.type === 'ROUND_SETTLED') {
        this.renderRoundSettled(event.result, event.history);
      } else if (event.type === 'REQUEST_NEXT_ROUND') {
        // Formulate fresh prediction for the new 5m round
        const currentPrice = event.lastClosePrice || dataService.currentPrice;
        const cvdData = dataService.getCumulativeVolumeDelta(60);
        this.latestAnalysis = predictorEngine.analyzeMarket({
          candles1m: this.candles1m,
          candles5m: this.candles5m,
          candles15m: this.candles15m,
          currentPrice,
          cvdData,
          lockPrice: currentPrice
        });
        roundManager.initRound(currentPrice, this.latestAnalysis, currentPrice);
      }
    });
  }

  renderRoundStarted(round) {
    this.dom.roundTitle.textContent = `ROUND #${round.id}`;
    this.dom.lockPrice.textContent = `$${round.lockPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    this.dom.roundLivePrice.textContent = `$${round.currentPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    // Prediction Banner
    const isUp = round.prediction === 'UP';
    this.dom.predictionBanner.className = `prediction-banner ${isUp ? 'banner-up' : 'banner-down'}`;
    this.dom.predictionIcon.textContent = isUp ? '▲' : '▼';
    this.dom.predictionDir.textContent = isUp ? 'UP (CALL)' : 'DOWN (PUT)';
    this.dom.predictionConf.textContent = `${round.confidence}%`;
    this.dom.targetPrice.textContent = `$${round.targetPrice.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;

    // Set chart lines
    this.chart.setLockPrice(round.lockPrice);
    this.chart.setTargetPrice(round.targetPrice, round.prediction);
  }

  renderRoundTick(round) {
    if (!round) return;

    // Self-healing: if round lock price, title, or target is placeholder, fill it immediately
    if (this.dom.lockPrice.textContent.includes('--') || 
        this.dom.roundTitle.textContent.includes('-----') ||
        this.dom.predictionConf.textContent.includes('--')) {
      this.renderRoundStarted(round);
    }

    // 1. Countdown Time & Radial Ring
    const mins = Math.floor(round.secondsRemaining / 60);
    const secs = round.secondsRemaining % 60;
    this.dom.countdownDigits.textContent = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

    // Circumference = 2 * PI * 62 ≈ 390
    const circumference = 390;
    const progress = round.secondsRemaining / 300;
    const offset = circumference * (1 - progress);
    this.dom.radialProgress.style.strokeDashoffset = offset;

    // Ring Warning Color
    if (round.secondsRemaining <= 30) {
      this.dom.radialProgress.setAttribute('class', 'radial-fg-circle danger');
    } else if (round.secondsRemaining <= 60) {
      this.dom.radialProgress.setAttribute('class', 'radial-fg-circle warning');
    } else {
      this.dom.radialProgress.setAttribute('class', 'radial-fg-circle');
    }

    // 2. Price comparator
    this.dom.roundLivePrice.textContent = `$${round.currentPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    const delta = round.liveProb.currentDelta;
    const deltaPercent = round.liveProb.currentDeltaPercent;
    const isPositive = delta >= 0;

    this.dom.roundDelta.textContent = `${isPositive ? '+' : ''}$${delta.toFixed(2)} (${isPositive ? '+' : ''}${deltaPercent.toFixed(3)}%)`;
    this.dom.roundDelta.className = `delta-badge ${isPositive ? 'positive' : 'negative'}`;

    // 3. Prediction status (Winning vs Losing)
    const isWinning = round.liveProb.isPredictionWinning;
    this.dom.predictionStatusTag.className = `prediction-status-pill ${isWinning ? 'winning' : 'losing'}`;
    this.dom.predictionStatusText.textContent = isWinning ? 'ON TRACK' : 'TESTING BOUNDS';

    // Synchronize Banner with active Round Prediction
    const isPredUp = round.prediction === 'UP';
    this.dom.predictionDir.textContent = isPredUp ? 'UP (CALL)' : 'DOWN (PUT)';
    this.dom.predictionIcon.textContent = isPredUp ? '▲' : '▼';
    this.dom.predictionBanner.className = `prediction-banner ${isPredUp ? 'banner-up' : 'banner-down'}`;
    this.dom.predictionGrade.textContent = round.grade || 'GRADE A (CONVICTION)';
    this.dom.predictionGrade.className = `conviction-grade-pill ${round.gradeColor || 'grade-a'}`;
    this.dom.predictionConf.textContent = `${round.confidence || 75}%`;

    // 4. Probability Meter
    this.dom.probUpText.textContent = `${round.liveProb.upProb}%`;
    this.dom.probDownText.textContent = `${round.liveProb.downProb}%`;
    this.dom.probBarFill.style.width = `${round.liveProb.upProb}%`;

    // 5. Chainlink Oracle Snipe Integration
    if (round.liveProb && round.liveProb.chainlinkSnipe && this.dom.clSnipeBadge) {
      const snipe = round.liveProb.chainlinkSnipe;
      if (snipe.isSnipeActive) {
        const isUp = snipe.snipeDirection === 'UP';
        this.dom.clSnipeBadge.className = isUp ? 'snipe-badge active' : 'snipe-badge active-bear';
        this.dom.clSnipeStatus.textContent = `🔥 ACTIVE: ${snipe.snipeDirection} (${snipe.snipeConfidence}%)`;
        this.dom.predictionGrade.textContent = 'GRADE A+ (CHAINLINK SNIPE)';
        this.dom.predictionGrade.className = 'conviction-grade-pill grade-a-plus';
        this.dom.predictionConf.textContent = `${snipe.snipeConfidence}%`;
        this.dom.predictionDir.textContent = isUp ? 'UP (CALL)' : 'DOWN (PUT)';
        this.dom.predictionIcon.textContent = isUp ? '▲' : '▼';
        this.dom.predictionBanner.className = `prediction-banner ${isUp ? 'banner-up' : 'banner-down'}`;
      } else if (round.secondsRemaining <= 65) {
        this.dom.clSnipeBadge.className = 'snipe-badge waiting';
        this.dom.clSnipeStatus.textContent = `EVALUATING (T-${round.secondsRemaining}s)`;
      } else {
        this.dom.clSnipeBadge.className = 'snipe-badge waiting';
        const minsLeft = Math.floor(round.secondsRemaining / 60);
        const secsLeft = round.secondsRemaining % 60;
        this.dom.clSnipeStatus.textContent = `UNLOCKS AT T-60s (${minsLeft}m ${secsLeft}s)`;
      }
    }
  }

  renderChainlinkOracle(data) {
    if (!data) return;
    if (this.dom.clOraclePrice) {
      this.dom.clOraclePrice.textContent = `$${data.chainlinkPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
    if (this.dom.clUpdateTime) {
      this.dom.clUpdateTime.textContent = `${data.oracleHeartbeatSec}s AGO (${data.lastUpdated})`;
    }
    if (this.dom.clOracleDrift) {
      const isLead = data.drift > 0;
      const isLag = data.drift < 0;
      this.dom.clOracleDrift.textContent = `${isLead ? '+' : ''}$${data.drift.toFixed(2)} (${isLead ? '+' : ''}${data.driftBps} bps)`;
      this.dom.clOracleDrift.className = `drift-val ${isLead ? 'bull' : (isLag ? 'bear' : 'neutral')}`;

      if (Math.abs(data.drift) >= 5) {
        this.dom.clDriftStatus.textContent = isLead ? 'BINANCE LEADING 🟢' : 'ORACLE LAGGING 🔴';
        this.dom.clDriftStatus.className = `drift-status ${isLead ? 'lead' : 'lag'}`;
      } else {
        this.dom.clDriftStatus.textContent = 'IN SYNC ⚖️';
        this.dom.clDriftStatus.className = 'drift-status sync';
      }
    }

    if (this.dom.valChainlink) {
      this.dom.valChainlink.textContent = `$${data.chainlinkPrice.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
      this.dom.badgeChainlink.textContent = data.drift > 0 ? 'BULL DRIFT' : (data.drift < 0 ? 'BEAR DRIFT' : 'SYNCED');
      this.dom.badgeChainlink.className = `ind-badge ${data.drift > 0 ? 'bull' : (data.drift < 0 ? 'bear' : 'neutral')}`;
    }
  }

  renderRoundSettled(result, history) {
    this.renderHistory(history);
    this.renderBankroll(roundManager.getStats());
  }

  renderTraderBrain(analysis) {
    if (!analysis) return;

    // RSI
    const rsi = analysis.indicators.rsi;
    this.dom.valRsi.textContent = rsi.toFixed(1);
    this.dom.barRsi.style.width = `${Math.min(100, Math.max(0, rsi))}%`;
    if (rsi < 35) {
      this.dom.badgeRsi.className = 'ind-badge bull';
      this.dom.badgeRsi.textContent = 'OVERSOLD';
      this.dom.barRsi.className = 'pill-bar-fill bull';
    } else if (rsi > 65) {
      this.dom.badgeRsi.className = 'ind-badge bear';
      this.dom.badgeRsi.textContent = 'OVERBOUGHT';
      this.dom.barRsi.className = 'pill-bar-fill bear';
    } else {
      this.dom.badgeRsi.className = 'ind-badge neutral';
      this.dom.badgeRsi.textContent = 'NEUTRAL';
      this.dom.barRsi.className = 'pill-bar-fill';
    }

    // MACD
    const hist = analysis.indicators.macdHist;
    this.dom.valMacd.textContent = `${hist >= 0 ? '+' : ''}${hist.toFixed(2)}`;
    const macdPct = Math.min(100, Math.max(0, 50 + hist * 3));
    this.dom.barMacd.style.width = `${macdPct}%`;
    if (hist > 0) {
      this.dom.badgeMacd.className = 'ind-badge bull';
      this.dom.badgeMacd.textContent = 'BULLISH';
      this.dom.barMacd.className = 'pill-bar-fill bull';
    } else {
      this.dom.badgeMacd.className = 'ind-badge bear';
      this.dom.badgeMacd.textContent = 'BEARISH';
      this.dom.barMacd.className = 'pill-bar-fill bear';
    }

    // EMA
    const ema9 = analysis.indicators.ema9;
    const ema21 = analysis.indicators.ema21;
    const isEmaBull = ema9 >= ema21;
    this.dom.valEma.textContent = isEmaBull ? '9 > 21 BULL' : '9 < 21 BEAR';
    this.dom.badgeEma.className = `ind-badge ${isEmaBull ? 'bull' : 'bear'}`;
    this.dom.badgeEma.textContent = isEmaBull ? 'UPTREND' : 'DOWNTREND';

    // CVD
    const cvdRatio = analysis.indicators.cvdRatio;
    this.dom.valCvd.textContent = `${cvdRatio >= 0 ? '+' : ''}${(cvdRatio * 100).toFixed(0)}% DELTA`;
    const cvdPct = Math.min(100, Math.max(0, 50 + cvdRatio * 50));
    this.dom.barCvd.style.width = `${cvdPct}%`;
    if (cvdRatio > 0.05) {
      this.dom.badgeCvd.className = 'ind-badge bull';
      this.dom.badgeCvd.textContent = 'BUY PRESSURE';
      this.dom.barCvd.className = 'pill-bar-fill bull';
    } else if (cvdRatio < -0.05) {
      this.dom.badgeCvd.className = 'ind-badge bear';
      this.dom.badgeCvd.textContent = 'SELL PRESSURE';
      this.dom.barCvd.className = 'pill-bar-fill bear';
    } else {
      this.dom.badgeCvd.className = 'ind-badge neutral';
      this.dom.badgeCvd.textContent = 'BALANCED';
      this.dom.barCvd.className = 'pill-bar-fill';
    }

    // Rationale list
    if (analysis.rationale && analysis.rationale.length > 0) {
      this.dom.rationaleList.innerHTML = analysis.rationale
        .map(text => `<li>${text}</li>`)
        .join('');
    }
  }

  renderBankroll(stats) {
    this.dom.bankrollBalance.textContent = `$${stats.bankroll.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    this.dom.bankrollWinrate.textContent = `${stats.winRate}%`;
    this.dom.bankrollStreak.textContent = `🔥 ${stats.streak} Wins`;

    this.dom.autotradeBtn.classList.toggle('active', roundManager.autoTradeEnabled);
    this.dom.autotradeBtn.classList.toggle('inactive', !roundManager.autoTradeEnabled);
    this.dom.autotradeLabel.textContent = roundManager.autoTradeEnabled ? 'ON' : 'OFF';
  }

  renderHistory(history) {
    const stats = roundManager.getStats();
    this.dom.histTotalRounds.textContent = stats.total;
    this.dom.histTotalWins.textContent = stats.wins;
    this.dom.histTotalLosses.textContent = stats.losses;
    
    const pnlVal = stats.totalPnl;
    const isPositive = pnlVal >= 0;
    this.dom.histTotalPnl.textContent = `${isPositive ? '+' : ''}$${Math.abs(pnlVal).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    this.dom.histTotalPnl.parentElement.className = `summary-pill pnl-pill ${isPositive ? 'win-pill' : 'loss-pill'}`;

    if (!history || history.length === 0) {
      this.dom.historyTableBody.innerHTML = '<tr><td colspan="9" style="text-align:center; padding: 20px;">No rounds recorded yet</td></tr>';
      return;
    }

    this.dom.historyTableBody.innerHTML = history.slice(0, 15).map(r => {
      const isWin = r.isWin;
      const isUp = r.prediction === 'UP';
      const actualIsUp = r.actualOutcome === 'UP';
      const deltaPos = r.delta >= 0;
      const dateStr = new Date(r.endTime * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

      return `
        <tr>
          <td class="round-id-cell">#${r.id}</td>
          <td>${dateStr}</td>
          <td>$${r.lockPrice.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
          <td>$${r.closePrice.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
          <td class="${deltaPos ? 'dir-cell up' : 'dir-cell down'}">${deltaPos ? '+' : ''}$${r.delta.toFixed(2)}</td>
          <td class="dir-cell ${isUp ? 'up' : 'down'}">${isUp ? '▲ UP' : '▼ DOWN'}</td>
          <td class="dir-cell ${actualIsUp ? 'up' : 'down'}">${actualIsUp ? '▲ UP' : '▼ DOWN'}</td>
          <td>
            <span class="pill-outcome ${isWin ? 'win' : 'loss'}">${isWin ? 'WON' : 'LOST'}</span>
          </td>
          <td class="pnl-cell ${isWin ? 'win' : 'loss'}">${isWin ? '+' : ''}$${r.pnl.toFixed(2)}</td>
        </tr>
      `;
    }).join('');
  }
}

// Bootstrap on DOM Ready
document.addEventListener('DOMContentLoaded', () => {
  const app = new App();
  app.init();
});
