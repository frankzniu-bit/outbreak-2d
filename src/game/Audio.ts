import type { WeaponId } from './types';
import type { Rarity } from './types';

export class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;

  /** Must be called from within a user-gesture handler (browser autoplay policy). */
  unlock() {
    if (!this.ctx) {
      const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.32;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  private tone(freq: number, duration: number, opts: { type?: OscillatorType; peak?: number; freqEnd?: number; delay?: number } = {}) {
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master) return;
    const t0 = ctx.currentTime + (opts.delay ?? 0);
    const osc = ctx.createOscillator();
    osc.type = opts.type ?? 'square';
    osc.frequency.setValueAtTime(freq, t0);
    if (opts.freqEnd !== undefined) osc.frequency.exponentialRampToValueAtTime(Math.max(1, opts.freqEnd), t0 + duration);
    const gain = ctx.createGain();
    const peak = opts.peak ?? 0.5;
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(peak, t0 + Math.min(0.01, duration * 0.2));
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    osc.connect(gain);
    gain.connect(master);
    osc.start(t0);
    osc.stop(t0 + duration + 0.02);
  }

  private noise(duration: number, opts: { peak?: number; filterFreq?: number; filterType?: BiquadFilterType; delay?: number } = {}) {
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master) return;
    const t0 = ctx.currentTime + (opts.delay ?? 0);
    const bufferSize = Math.max(1, Math.floor(ctx.sampleRate * duration));
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const gain = ctx.createGain();
    const peak = opts.peak ?? 0.35;
    gain.gain.setValueAtTime(peak, t0);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    let node: AudioNode = src;
    if (opts.filterFreq) {
      const filter = ctx.createBiquadFilter();
      filter.type = opts.filterType ?? 'lowpass';
      filter.frequency.value = opts.filterFreq;
      src.connect(filter);
      node = filter;
    }
    node.connect(gain);
    gain.connect(master);
    src.start(t0);
    src.stop(t0 + duration + 0.02);
  }

  shot(weaponId: WeaponId) {
    switch (weaponId) {
      case 'sidewinder':
        this.noise(0.05, { peak: 0.3, filterFreq: 2400 });
        this.tone(220, 0.06, { type: 'square', peak: 0.25, freqEnd: 110 });
        break;
      case 'riot_shotgun':
        this.noise(0.14, { peak: 0.45, filterFreq: 1400 });
        this.tone(90, 0.14, { type: 'sawtooth', peak: 0.35, freqEnd: 45 });
        break;
      case 'auto_smg':
        this.noise(0.03, { peak: 0.22, filterFreq: 3200 });
        this.tone(320, 0.04, { type: 'square', peak: 0.18, freqEnd: 200 });
        break;
      case 'cryo_rifle':
        this.tone(800, 0.09, { type: 'sine', peak: 0.3, freqEnd: 1700 });
        this.noise(0.05, { peak: 0.12, filterFreq: 5000 });
        break;
      case 'flamethrower':
        this.noise(0.07, { peak: 0.2, filterFreq: 900, filterType: 'lowpass' });
        break;
      case 'arc_caster':
        this.tone(900, 0.05, { type: 'sawtooth', peak: 0.28 });
        this.tone(1500, 0.05, { type: 'sawtooth', peak: 0.22, delay: 0.04 });
        break;
      case 'rail_spike':
        this.tone(140, 0.3, { type: 'sawtooth', peak: 0.4, freqEnd: 40 });
        this.noise(0.15, { peak: 0.4, filterFreq: 2000 });
        break;
    }
  }

  chargeStart() {
    this.tone(180, 0.85, { type: 'sine', peak: 0.15, freqEnd: 520 });
  }

  hit() {
    this.noise(0.04, { peak: 0.15, filterFreq: 3500 });
  }

  kill() {
    this.tone(180, 0.12, { type: 'square', peak: 0.22, freqEnd: 60 });
  }

  points() {
    this.tone(523, 0.07, { type: 'triangle', peak: 0.22 });
    this.tone(784, 0.09, { type: 'triangle', peak: 0.22, delay: 0.06 });
  }

  rarityFanfare(rarity: Rarity) {
    if (rarity === 'epic' || rarity === 'legendary') {
      const notes = [392, 523, 659, 880];
      notes.forEach((f, i) => this.tone(f, 0.16, { type: 'triangle', peak: 0.28, delay: i * 0.09 }));
    } else if (rarity === 'rare') {
      this.tone(440, 0.12, { type: 'triangle', peak: 0.24 });
      this.tone(660, 0.14, { type: 'triangle', peak: 0.24, delay: 0.08 });
    } else {
      this.tone(330, 0.1, { type: 'triangle', peak: 0.18 });
    }
  }

  roundStart() {
    this.tone(150, 1.1, { type: 'sawtooth', peak: 0.16, freqEnd: 70 });
  }

  dash() {
    this.noise(0.12, { peak: 0.18, filterFreq: 1800, filterType: 'highpass' });
  }

  reload() {
    this.tone(500, 0.03, { type: 'square', peak: 0.12 });
    this.tone(650, 0.03, { type: 'square', peak: 0.12, delay: 0.15 });
  }

  doorOpen() {
    this.tone(80, 0.9, { type: 'sawtooth', peak: 0.25, freqEnd: 40 });
    this.noise(0.4, { peak: 0.15, filterFreq: 600 });
  }

  melee() {
    this.noise(0.06, { peak: 0.3, filterFreq: 1200 });
    this.tone(100, 0.08, { type: 'square', peak: 0.2, freqEnd: 50 });
  }

  damageTaken() {
    this.noise(0.09, { peak: 0.25, filterFreq: 1000, filterType: 'bandpass' });
  }

  abilityUse() {
    this.tone(300, 0.3, { type: 'sine', peak: 0.25, freqEnd: 700 });
  }

  ultimateUse() {
    const notes = [220, 330, 440, 660];
    notes.forEach((f, i) => this.tone(f, 0.22, { type: 'sawtooth', peak: 0.3, delay: i * 0.07 }));
  }

  explosion() {
    this.noise(0.35, { peak: 0.4, filterFreq: 500 });
    this.tone(70, 0.35, { type: 'sawtooth', peak: 0.3, freqEnd: 30 });
  }

  lowHealthBeep() {
    this.tone(880, 0.08, { type: 'square', peak: 0.18 });
  }

  bossRoar() {
    this.tone(60, 0.6, { type: 'sawtooth', peak: 0.3, freqEnd: 30 });
    this.noise(0.5, { peak: 0.2, filterFreq: 300 });
  }
}
