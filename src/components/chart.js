// src/components/chart.js
// TradingView Lightweight Charts integration for BTC/USDT Candlestick Chart

import {
  createChart,
  CandlestickSeries,
  HistogramSeries,
  LineStyle
} from 'lightweight-charts';

export class ChartComponent {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    this.chart = null;
    this.candlestickSeries = null;
    this.volumeSeries = null;
    this.lockPriceLine = null;
    this.targetPriceLine = null;
    this.currentData = [];
    this.resizeObserver = null;
  }

  init() {
    if (!this.container) return;

    this.chart = createChart(this.container, {
      layout: {
        background: { color: '#0c1017' },
        textColor: '#8e9aac',
        fontSize: 12,
        fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif"
      },
      grid: {
        vertLines: { color: 'rgba(255, 255, 255, 0.04)' },
        horzLines: { color: 'rgba(255, 255, 255, 0.04)' }
      },
      crosshair: {
        mode: 1, // Magnet
        vertLine: {
          color: 'rgba(0, 212, 255, 0.4)',
          width: 1,
          style: LineStyle.Dashed
        },
        horzLine: {
          color: 'rgba(0, 212, 255, 0.4)',
          width: 1,
          style: LineStyle.Dashed
        }
      },
      rightPriceScale: {
        borderColor: 'rgba(255, 255, 255, 0.08)',
        scaleMargins: {
          top: 0.12,
          bottom: 0.22
        },
        autoScale: true
      },
      timeScale: {
        borderColor: 'rgba(255, 255, 255, 0.08)',
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 12,
        barSpacing: 8
      },
      handleScale: {
        axisPressedMouseMove: true,
        mouseWheel: true,
        pinch: true
      },
      handleScroll: {
        mouseWheel: true,
        pressedMouseMove: true,
        horzTouchDrag: true,
        vertTouchDrag: false
      }
    });

    // Add Candlestick Series (Bull: #00f090, Bear: #ff2e63)
    const candleOptions = {
      upColor: '#00f090',
      downColor: '#ff2e63',
      borderVisible: false,
      wickUpColor: '#00f090',
      wickDownColor: '#ff2e63'
    };

    if (this.chart.addSeries) {
      this.candlestickSeries = this.chart.addSeries(CandlestickSeries, candleOptions);
    } else if (this.chart.addCandlestickSeries) {
      this.candlestickSeries = this.chart.addCandlestickSeries(candleOptions);
    }

    // Add Volume Series at bottom
    const volumeOptions = {
      color: 'rgba(0, 212, 255, 0.25)',
      priceFormat: { type: 'volume' },
      priceScaleId: '', // overlay
      scaleMargins: {
        top: 0.82,
        bottom: 0
      }
    };

    if (this.chart.addSeries) {
      this.volumeSeries = this.chart.addSeries(HistogramSeries, volumeOptions);
    } else if (this.chart.addHistogramSeries) {
      this.volumeSeries = this.chart.addHistogramSeries(volumeOptions);
    }

    // Responsive auto-resize
    this.resizeObserver = new ResizeObserver((entries) => {
      if (!entries || entries.length === 0 || !this.chart) return;
      const { width, height } = entries[0].contentRect;
      this.chart.applyOptions({ width, height });
    });
    this.resizeObserver.observe(this.container);
  }

  setData(candles) {
    if (!this.candlestickSeries || !candles || candles.length === 0) return;
    this.currentData = [...candles];

    // Ensure sorted by time
    this.currentData.sort((a, b) => a.time - b.time);

    // Filter duplicate timestamps if any
    const uniqueCandles = [];
    const seen = new Set();
    for (const c of this.currentData) {
      if (!seen.has(c.time)) {
        seen.add(c.time);
        uniqueCandles.push(c);
      }
    }
    this.currentData = uniqueCandles;

    this.candlestickSeries.setData(this.currentData);

    if (this.volumeSeries) {
      const volumeData = this.currentData.map(c => ({
        time: c.time,
        value: c.volume,
        color: c.close >= c.open ? 'rgba(0, 240, 144, 0.3)' : 'rgba(255, 46, 99, 0.3)'
      }));
      this.volumeSeries.setData(volumeData);
    }

    this.chart.timeScale().scrollToRealTime();
  }

  // Update latest candle with live price or append new candle
  updateCandle(candle) {
    if (!this.candlestickSeries || !candle) return;

    this.candlestickSeries.update(candle);

    if (this.volumeSeries && candle.volume) {
      this.volumeSeries.update({
        time: candle.time,
        value: candle.volume,
        color: candle.close >= candle.open ? 'rgba(0, 240, 144, 0.3)' : 'rgba(255, 46, 99, 0.3)'
      });
    }

    // Keep internal array updated
    const last = this.currentData[this.currentData.length - 1];
    if (last && last.time === candle.time) {
      this.currentData[this.currentData.length - 1] = candle;
    } else {
      this.currentData.push(candle);
    }
  }

  // Set or update horizontal Lock (Strike) Price line
  setLockPrice(lockPrice) {
    if (!this.candlestickSeries) return;

    if (this.lockPriceLine) {
      try {
        this.candlestickSeries.removePriceLine(this.lockPriceLine);
      } catch (e) {}
      this.lockPriceLine = null;
    }

    if (lockPrice && lockPrice > 0) {
      this.lockPriceLine = this.candlestickSeries.createPriceLine({
        price: lockPrice,
        color: '#00d4ff',
        lineWidth: 2,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
        title: `STRIKE: $${lockPrice.toLocaleString('en-US', { minimumFractionDigits: 2 })}`
      });
    }
  }

  // Set or update predicted Target Price line
  setTargetPrice(targetPrice, prediction) {
    if (!this.candlestickSeries) return;

    if (this.targetPriceLine) {
      try {
        this.candlestickSeries.removePriceLine(this.targetPriceLine);
      } catch (e) {}
      this.targetPriceLine = null;
    }

    if (targetPrice && targetPrice > 0) {
      const isUp = prediction === 'UP';
      this.targetPriceLine = this.candlestickSeries.createPriceLine({
        price: targetPrice,
        color: isUp ? '#00f090' : '#ff2e63',
        lineWidth: 2,
        lineStyle: LineStyle.Dotted,
        axisLabelVisible: true,
        title: `TARGET (${prediction}): $${targetPrice.toLocaleString('en-US', { minimumFractionDigits: 2 })}`
      });
    }
  }

  destroy() {
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
    }
    if (this.chart) {
      this.chart.remove();
      this.chart = null;
    }
  }
}
