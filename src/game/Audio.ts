import type { WeaponId, Rarity } from './types';

/**
 * Everything here is synthesised at runtime - no asset files. Levels are kept
 * deliberately restrained: the old build's long sawtooth round-stinger and
 * loud per-kill chirps were fatiguing, so tones are shorter, softer, and
 * mostly sine/triangle rather than saw.
 */
export class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private muted = false;
  private volume = 0.6;
  private lastPointsAt = 0;

  setMuted(muted: boolean) {
    this.muted = muted;
    this.applyGain();
  }

  setVolume(volume: number) {
    this.volume = Math.max(0, Math.min(1, volume));
    this.applyGain();
  }

  private applyGain() {
    if (this.master) this.master.gain.value = this.muted ? 0 : this.volume * 0.22;
  }

  /** Must be called from within a user-gesture handler (browser autoplay policy). */
  unlock() {
    if (!this.ctx) {
      const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      const shelf = this.ctx.createBiquadFilter();
      shelf.type = 'lowpass';
      shelf.frequency.value = 9000;
      this.master.connect(shelf);
      shelf.connect(this.ctx.destination);
      this.applyGain();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  private tone(freq: number, duration: number, opts: { type?: OscillatorType; peak?: number; freqEnd?: number; delay?: number } = {}) {
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master || this.muted) return;
    const t0 = ctx.currentTime + (opts.delay ?? 0);
    const osc = ctx.createOscillator();
    osc.type = opts.type ?? 'triangle';
    osc.frequency.setValueAtTime(freq, t0);
    if (opts.freqEnd !== undefined) osc.frequency.exponentialRampToValueAtTime(Math.max(1, opts.freqEnd), t0 + duration);
    const gain = ctx.createGain();
    const peak = opts.peak ?? 0.4;
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(peak, t0 + Math.min(0.012, duration * 0.25));
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    osc.connect(gain);
    gain.connect(master);
    osc.start(t0);
    osc.stop(t0 + duration + 0.02);
  }

  private noise(duration: number, opts: { peak?: number; filterFreq?: number; filterType?: BiquadFilterType; delay?: number } = {}) {
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master || this.muted) return;
    const t0 = ctx.currentTime + (opts.delay ?? 0);
    const bufferSize = Math.max(1, Math.floor(ctx.sampleRate * duration));
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const gain = ctx.createGain();
    const peak = opts.peak ?? 0.28;
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
        this.noise(0.045, { peak: 0.2, filterFreq: 2200 });
        this.tone(210, 0.05, { type: 'square', peak: 0.14, freqEnd: 110 });
        break;
      case 'riot_shotgun':
        this.noise(0.11, { peak: 0.3, filterFreq: 1300 });
        this.tone(88, 0.12, { type: 'triangle', peak: 0.22, freqEnd: 46 });
        break;
      case 'auto_smg':
        this.noise(0.024, { peak: 0.13, filterFreq: 3000 });
        this.tone(300, 0.03, { type: 'square', peak: 0.09, freqEnd: 200 });
        break;
      case 'cryo_rifle':
        this.tone(760, 0.08, { type: 'sine', peak: 0.18, freqEnd: 1500 });
        break;
      case 'flamethrower':
        this.noise(0.06, { peak: 0.11, filterFreq: 800 });
        break;
      case 'arc_caster':
        this.tone(880, 0.045, { type: 'triangle', peak: 0.17 });
        this.tone(1400, 0.045, { type: 'triangle', peak: 0.12, delay: 0.035 });
        break;
      case 'rail_spike':
        this.tone(150, 0.24, { type: 'triangle', peak: 0.26, freqEnd: 48 });
        this.noise(0.12, { peak: 0.24, filterFreq: 1800 });
        break;
    }
  }

  chargeStart() {
    this.tone(200, 0.7, { type: 'sine', peak: 0.09, freqEnd: 480 });
  }

  hit() {
    this.noise(0.03, { peak: 0.09, filterFreq: 3200 });
  }

  kill() {
    this.tone(170, 0.09, { type: 'triangle', peak: 0.13, freqEnd: 70 });
  }

  /** Rate-limited: a big wave used to produce a machine-gun of chirps. */
  points() {
    const now = this.ctx?.currentTime ?? 0;
    if (now - this.lastPointsAt < 0.09) return;
    this.lastPointsAt = now;
    this.tone(660, 0.05, { type: 'sine', peak: 0.11 });
    this.tone(880, 0.06, { type: 'sine', peak: 0.09, delay: 0.045 });
  }

  rarityFanfare(rarity: Rarity) {
    if (rarity === 'epic' || rarity === 'legendary') {
      [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.14, { type: 'sine', peak: 0.16, delay: i * 0.075 }));
    } else if (rarity === 'rare') {
      this.tone(523, 0.11, { type: 'sine', peak: 0.14 });
      this.tone(784, 0.12, { type: 'sine', peak: 0.12, delay: 0.07 });
    } else {
      this.tone(440, 0.09, { type: 'sine', peak: 0.1 });
    }
  }

  /** Short two-note motif instead of the old long descending saw drone. */
  roundStart() {
    this.tone(392, 0.16, { type: 'sine', peak: 0.13 });
    this.tone(294, 0.22, { type: 'sine', peak: 0.12, delay: 0.14 });
  }

  dash() {
    this.noise(0.09, { peak: 0.1, filterFreq: 2000, filterType: 'highpass' });
  }

  reload() {
    this.tone(480, 0.025, { type: 'square', peak: 0.07 });
    this.tone(620, 0.025, { type: 'square', peak: 0.07, delay: 0.13 });
  }

  doorOpen() {
    this.tone(110, 0.5, { type: 'triangle', peak: 0.14, freqEnd: 55 });
    this.noise(0.28, { peak: 0.09, filterFreq: 700 });
  }

  melee() {
    this.noise(0.05, { peak: 0.18, filterFreq: 1400 });
    this.tone(120, 0.06, { type: 'triangle', peak: 0.13, freqEnd: 60 });
  }

  damageTaken() {
    this.noise(0.07, { peak: 0.16, filterFreq: 900, filterType: 'bandpass' });
    this.tone(140, 0.09, { type: 'sine', peak: 0.12, freqEnd: 90 });
  }

  abilityUse() {
    this.tone(330, 0.22, { type: 'sine', peak: 0.15, freqEnd: 660 });
  }

  ultimateUse() {
    [262, 392, 523, 784].forEach((f, i) => this.tone(f, 0.2, { type: 'sine', peak: 0.17, delay: i * 0.06 }));
  }

  explosion() {
    this.noise(0.3, { peak: 0.26, filterFreq: 480 });
    this.tone(72, 0.3, { type: 'triangle', peak: 0.2, freqEnd: 32 });
  }

  revive() {
    [392, 523, 659].forEach((f, i) => this.tone(f, 0.18, { type: 'sine', peak: 0.16, delay: i * 0.08 }));
  }

  downed() {
    this.tone(300, 0.5, { type: 'sine', peak: 0.18, freqEnd: 90 });
  }

  bossRoar() {
    this.tone(70, 0.5, { type: 'triangle', peak: 0.2, freqEnd: 34 });
    this.noise(0.4, { peak: 0.14, filterFreq: 320 });
  }
}
