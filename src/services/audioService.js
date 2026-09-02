// src/services/audioService.js
// Web Audio API synthesizer for futuristic trader sound effects

class AudioService {
  constructor() {
    this.ctx = null;
    this.isMuted = typeof localStorage !== 'undefined' ? localStorage.getItem('btc_pulse_muted') === 'true' : false;
  }

  initContext() {
    if (typeof window === 'undefined') return;
    if (!this.ctx) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (AudioContext) {
        this.ctx = new AudioContext();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  toggleMute() {
    this.isMuted = !this.isMuted;
    localStorage.setItem('btc_pulse_muted', this.isMuted);
    return this.isMuted;
  }

  playTone(freq, type = 'sine', duration = 0.2, gainValue = 0.1, delay = 0) {
    if (this.isMuted) return;
    try {
      this.initContext();
      if (!this.ctx) return;

      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      const startTime = this.ctx.currentTime + delay;
      osc.type = type;
      osc.frequency.setValueAtTime(freq, startTime);

      gain.gain.setValueAtTime(0.001, startTime);
      gain.gain.exponentialRampToValueAtTime(gainValue, startTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(startTime);
      osc.stop(startTime + duration);
    } catch (e) {
      console.warn('Audio play error', e);
    }
  }

  playRoundStart() {
    // Upbeat futuristic ascending chime
    this.playTone(440, 'triangle', 0.18, 0.08, 0);
    this.playTone(554.37, 'triangle', 0.18, 0.09, 0.08);
    this.playTone(659.25, 'sine', 0.35, 0.12, 0.16);
  }

  playWin() {
    // Triumphant cyber chord
    this.playTone(523.25, 'sine', 0.25, 0.1, 0);
    this.playTone(659.25, 'sine', 0.25, 0.1, 0.08);
    this.playTone(783.99, 'sine', 0.3, 0.12, 0.16);
    this.playTone(1046.50, 'sine', 0.5, 0.15, 0.25);
  }

  playLoss() {
    // Subtle low tone
    this.playTone(330, 'sine', 0.2, 0.08, 0);
    this.playTone(261.63, 'sine', 0.35, 0.08, 0.12);
  }

  playTick() {
    // High-tech radar blip
    this.playTone(1200, 'sine', 0.04, 0.02, 0);
  }

  playCountdownWarning() {
    // Warning pulse for last 5 seconds
    this.playTone(880, 'sine', 0.08, 0.05, 0);
  }
}

export const audioService = new AudioService();
