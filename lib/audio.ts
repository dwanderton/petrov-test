// All sounds are synthesized with Web Audio — no asset files.
// The context can only start after a user gesture; unlock() is called from
// the first pointerdown/keydown and is a no-op afterwards.

class MadAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  private muted = false;
  private lastBoom = 0;

  unlock() {
    if (typeof window === "undefined") return;
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 1;
      this.master.connect(this.ctx.destination);
      this.startAmbient();
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
  }

  get isMuted() {
    return this.muted;
  }

  setMuted(m: boolean) {
    this.muted = m;
    if (this.ctx && this.master) {
      this.master.gain.setTargetAtTime(m ? 0 : 1, this.ctx.currentTime, 0.05);
    }
  }

  private noise(): AudioBuffer {
    const ctx = this.ctx!;
    if (this.noiseBuf) return this.noiseBuf;
    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      // brown noise: integrate white, keep bounded
      const white = Math.random() * 2 - 1;
      last = (last + 0.02 * white) / 1.02;
      data[i] = last * 3.5;
    }
    this.noiseBuf = buf;
    return buf;
  }

  private startAmbient() {
    const ctx = this.ctx!;
    const amb = ctx.createGain();
    amb.gain.value = 0;
    amb.connect(this.master!);
    // fade in over 4s
    amb.gain.setTargetAtTime(1, ctx.currentTime, 2);

    // wind: looped brown noise through a slow-breathing lowpass
    const src = ctx.createBufferSource();
    src.buffer = this.noise();
    src.loop = true;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 220;
    const windGain = ctx.createGain();
    windGain.gain.value = 0.035;
    src.connect(lp).connect(windGain).connect(amb);
    src.start();
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.06;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.015;
    lfo.connect(lfoGain).connect(windGain.gain);
    lfo.start();

    // war-room drone: two detuned lows + a sub
    for (const [freq, vol] of [
      [55, 0.02],
      [55.7, 0.02],
      [36.5, 0.016],
    ] as const) {
      const osc = ctx.createOscillator();
      osc.type = freq < 40 ? "triangle" : "sine";
      osc.frequency.value = freq;
      const g = ctx.createGain();
      g.gain.value = vol;
      osc.connect(g).connect(amb);
      osc.start();
    }
  }

  private env(vol: number, attack: number, decay: number): GainNode | null {
    const ctx = this.ctx;
    if (!ctx || !this.master) return null;
    const g = ctx.createGain();
    const t = ctx.currentTime;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(vol, 0.0001), t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    g.connect(this.master);
    return g;
  }

  // soft sonar blip: a peaceful turn resolved
  ping() {
    const ctx = this.ctx;
    const g = this.env(0.05, 0.01, 0.7);
    if (!ctx || !g) return;
    const osc = ctx.createOscillator();
    osc.frequency.value = 660;
    osc.connect(g);
    osc.start();
    osc.stop(ctx.currentTime + 0.8);
  }

  // arming the manual launch button
  armBeep() {
    const ctx = this.ctx;
    const g = this.env(0.05, 0.005, 0.12);
    if (!ctx || !g) return;
    const osc = ctx.createOscillator();
    osc.type = "square";
    osc.frequency.value = 1180;
    osc.connect(g);
    osc.start();
    osc.stop(ctx.currentTime + 0.15);
  }

  // confirming the launch: two falling commit beeps, heavier than the arm
  confirmBeep() {
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    for (let i = 0; i < 2; i++) {
      const t = ctx.currentTime + i * 0.16;
      const osc = ctx.createOscillator();
      osc.type = "square";
      osc.frequency.setValueAtTime(i === 0 ? 980 : 720, t);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.07, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.13);
      osc.connect(g).connect(this.master);
      osc.start(t);
      osc.stop(t + 0.15);
    }
  }

  // attack warning: three rising klaxon pulses
  alarm() {
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    for (let i = 0; i < 3; i++) {
      const t = ctx.currentTime + i * 0.45;
      const osc = ctx.createOscillator();
      osc.type = "square";
      osc.frequency.setValueAtTime(620, t);
      osc.frequency.linearRampToValueAtTime(940, t + 0.3);
      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = 900;
      bp.Q.value = 2;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.09, t + 0.03);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
      osc.connect(bp).connect(g).connect(this.master);
      osc.start(t);
      osc.stop(t + 0.45);
    }
  }

  // collective missile roar for the whole strike window
  strike(durationMs: number) {
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    const t = ctx.currentTime;
    const dur = Math.min(durationMs / 1000, 25);
    const src = ctx.createBufferSource();
    src.buffer = this.noise();
    src.loop = true;
    src.playbackRate.value = 1.6;
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.setValueAtTime(300, t);
    bp.frequency.linearRampToValueAtTime(900, t + dur * 0.6);
    bp.Q.value = 0.8;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.06, t + 1.6);
    g.gain.setValueAtTime(0.06, t + dur - 1.5);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(bp).connect(g).connect(this.master);
    src.start(t);
    src.stop(t + dur + 0.1);
  }

  // one warhead landing; throttled so 70 rings don't turn to mush
  boom() {
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    const nowMs = performance.now();
    if (nowMs - this.lastBoom < 110) return;
    this.lastBoom = nowMs;
    const t = ctx.currentTime;
    const vol = 0.16 + Math.random() * 0.1;

    const src = ctx.createBufferSource();
    src.buffer = this.noise();
    src.playbackRate.value = 0.7 + Math.random() * 0.4;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.setValueAtTime(180, t);
    lp.frequency.exponentialRampToValueAtTime(50, t + 0.9);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.1);
    src.connect(lp).connect(g).connect(this.master);
    src.start(t);
    src.stop(t + 1.2);

    const thump = ctx.createOscillator();
    thump.frequency.setValueAtTime(58, t);
    thump.frequency.exponentialRampToValueAtTime(27, t + 0.5);
    const tg = ctx.createGain();
    tg.gain.setValueAtTime(0.0001, t);
    tg.gain.exponentialRampToValueAtTime(vol * 0.9, t + 0.015);
    tg.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
    thump.connect(tg).connect(this.master);
    thump.start(t);
    thump.stop(t + 0.7);
  }
}

export const audio = new MadAudio();
