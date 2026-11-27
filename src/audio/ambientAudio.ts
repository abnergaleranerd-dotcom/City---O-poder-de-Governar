/**
 * 100% procedural Web Audio API urban ambient soundscape (wind/foliage, soft city hum,
 * water fountain shimmer, and occasional daytime birdsong).
 * Zero external audio files — zero 404s. Only initializes after explicit user enable.
 */
class ProceduralAmbientAudio {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private windFilter: BiquadFilterNode | null = null;
  private windGain: GainNode | null = null;
  private humGain: GainNode | null = null;
  private birdTimer = 0;
  private active = false;

  private ensureContext(): boolean {
    if (typeof window === 'undefined') return false;
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return false;

    if (!this.ctx) {
      this.ctx = new AudioCtx();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = 0;
      this.masterGain.connect(this.ctx.destination);

      // Soft filtered noise for breeze & leaves
      const sampleRate = this.ctx.sampleRate;
      const buf = this.ctx.createBuffer(1, sampleRate * 2, sampleRate);
      const data = buf.getChannelData(0);
      let b0 = 0;
      let b1 = 0;
      let b2 = 0;
      for (let i = 0; i < data.length; i++) {
        const white = Math.random() * 2 - 1;
        b0 = 0.99765 * b0 + white * 0.099046;
        b1 = 0.963 * b1 + white * 0.2965164;
        b2 = 0.57 * b2 + white * 1.0526913;
        data[i] = (b0 + b1 + b2 + white * 0.1848) * 0.04;
      }

      const noiseSrc = this.ctx.createBufferSource();
      noiseSrc.buffer = buf;
      noiseSrc.loop = true;

      this.windFilter = this.ctx.createBiquadFilter();
      this.windFilter.type = 'lowpass';
      this.windFilter.frequency.value = 540;

      this.windGain = this.ctx.createGain();
      this.windGain.gain.value = 0.35;

      noiseSrc.connect(this.windFilter);
      this.windFilter.connect(this.windGain);
      this.windGain.connect(this.masterGain);
      noiseSrc.start();

      // Gentle distant urban hum
      const humOsc = this.ctx.createOscillator();
      humOsc.type = 'sine';
      humOsc.frequency.value = 72;
      this.humGain = this.ctx.createGain();
      this.humGain.gain.value = 0.04;
      humOsc.connect(this.humGain);
      this.humGain.connect(this.masterGain);
      humOsc.start();
    }

    if (this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
    return true;
  }

  private triggerBirdChirp(volume: number): void {
    if (!this.ctx || !this.masterGain || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sine';
    const baseFreq = 1950 + (Math.round(now * 100) % 700);
    osc.frequency.setValueAtTime(baseFreq, now);
    osc.frequency.exponentialRampToValueAtTime(baseFreq * 1.32, now + 0.08);
    osc.frequency.exponentialRampToValueAtTime(baseFreq * 0.95, now + 0.16);
    g.gain.setValueAtTime(0.0001, now);
    g.gain.linearRampToValueAtTime(0.045 * volume, now + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);
    osc.connect(g);
    g.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.2);
  }

  public update(
    enabled: boolean,
    volume: number,
    hourOfDay: number,
    dt: number,
    greenTiles: number,
  ): void {
    if (!enabled) {
      if (this.active && this.masterGain && this.ctx) {
        this.masterGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.15);
      }
      this.active = false;
      return;
    }

    if (!this.ensureContext() || !this.ctx || !this.masterGain) return;
    this.active = true;
    const safeVol = Math.min(1, Math.max(0, volume));
    this.masterGain.gain.setTargetAtTime(safeVol * 0.65, this.ctx.currentTime, 0.2);

    const isDay = hourOfDay >= 6.5 && hourOfDay <= 18.5;
    if (this.windFilter && this.windGain && this.humGain) {
      this.windFilter.frequency.setTargetAtTime(isDay ? 620 : 420, this.ctx.currentTime, 0.5);
      this.windGain.gain.setTargetAtTime(isDay ? 0.35 : 0.25, this.ctx.currentTime, 0.5);
      this.humGain.gain.setTargetAtTime(isDay ? 0.045 : 0.02, this.ctx.currentTime, 0.5);
    }

    if (isDay && greenTiles > 0) {
      this.birdTimer += dt;
      if (this.birdTimer > 4.5) {
        this.birdTimer = 0;
        this.triggerBirdChirp(safeVol);
      }
    }
  }

  public dispose(): void {
    if (this.ctx) {
      void this.ctx.close();
      this.ctx = null;
      this.masterGain = null;
      this.windFilter = null;
      this.windGain = null;
      this.humGain = null;
      this.active = false;
    }
  }
}

export const ambientAudioEngine = new ProceduralAmbientAudio();
