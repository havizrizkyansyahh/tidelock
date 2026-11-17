// Every sound in TIDELOCK is synthesised here, on the fly: no audio files, no network. The engine
// drone runs under everything, thrust follows speed, and each event is a short shaped burst.
export class Sound {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.droneGain = null;
    this.thrustGain = null;
    this.alarmGain = null;
    this.muted = false;
    this.started = false;
  }

  /** Browsers only allow audio after a gesture; call this from the first click or key. */
  ensure() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.55;
    this.master.connect(ctx.destination);

    // Engine drone: two detuned saws behind a low pass, breathing slowly.
    this.droneGain = ctx.createGain();
    this.droneGain.gain.value = 0.055;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 260;
    this.droneGain.connect(filter).connect(this.master);
    for (const [freq, gain] of [[55, 0.5], [82.5, 0.3], [110, 0.14]]) {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = freq;
      const g = ctx.createGain();
      g.gain.value = gain;
      osc.connect(g).connect(this.droneGain);
      osc.start();
    }
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.09;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 90;
    lfo.connect(lfoGain).connect(filter.frequency);
    lfo.start();

    // Thrust: filtered noise, silent until the stick is down.
    const noise = this.noiseSource();
    const thrustFilter = ctx.createBiquadFilter();
    thrustFilter.type = 'bandpass';
    thrustFilter.frequency.value = 380;
    thrustFilter.Q.value = 0.7;
    this.thrustGain = ctx.createGain();
    this.thrustGain.gain.value = 0;
    noise.connect(thrustFilter).connect(this.thrustGain).connect(this.master);
    noise.start();

    // Air alarm: a triangle that only sounds when the tank is low.
    const alarm = ctx.createOscillator();
    alarm.type = 'triangle';
    alarm.frequency.value = 660;
    this.alarmGain = ctx.createGain();
    this.alarmGain.gain.value = 0;
    alarm.connect(this.alarmGain).connect(this.master);
    alarm.start();
    this.started = true;
  }

  noiseSource() {
    const ctx = this.ctx;
    const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 2), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    return src;
  }

  tone({ freq = 440, to = null, type = 'sine', gain = 0.2, attack = 0.005, decay = 0.25 }) {
    if (!this.ctx || this.muted) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    if (to !== null) osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), now + decay);
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(gain, now + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, now + attack + decay);
    osc.connect(g).connect(this.master);
    osc.start(now);
    osc.stop(now + attack + decay + 0.02);
  }

  burst({ freq = 900, q = 1, gain = 0.3, decay = 0.18 }) {
    if (!this.ctx || this.muted) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const src = this.noiseSource();
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = freq;
    filter.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + decay);
    src.connect(filter).connect(g).connect(this.master);
    src.start(now);
    src.stop(now + decay + 0.02);
  }

  setThrust(level) {
    if (!this.thrustGain) return;
    const target = this.muted ? 0 : Math.min(0.22, Math.max(0, level) * 0.22);
    this.thrustGain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.08);
  }

  setAlarm(active) {
    if (!this.alarmGain) return;
    const target = active && !this.muted ? 0.05 : 0;
    this.alarmGain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.2);
  }

  ping() {
    this.tone({ freq: 880, to: 220, type: 'sine', gain: 0.26, decay: 0.55 });
  }

  pickup(combo = 1) {
    const base = 520 + Math.min(4, combo) * 90;
    this.tone({ freq: base, to: base * 1.5, type: 'sine', gain: 0.16, decay: 0.12 });
  }

  hit() {
    this.burst({ freq: 220, q: 0.8, gain: 0.4, decay: 0.3 });
    this.tone({ freq: 90, to: 55, type: 'triangle', gain: 0.22, decay: 0.35 });
  }

  bite() {
    this.burst({ freq: 620, q: 2, gain: 0.22, decay: 0.1 });
  }

  beacon() {
    this.tone({ freq: 523, type: 'sine', gain: 0.14, decay: 0.5 });
    setTimeout(() => this.tone({ freq: 659, type: 'sine', gain: 0.12, decay: 0.6 }), 120);
  }

  end(surfaced) {
    const notes = surfaced ? [392, 523, 659] : [330, 262, 196];
    notes.forEach((freq, i) => setTimeout(() => this.tone({ freq, type: 'triangle', gain: 0.16, decay: 0.7 }), i * 160));
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.55;
    return this.muted;
  }
}