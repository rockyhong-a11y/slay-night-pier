import { IMPACT_PROFILES, makeHitSound } from './impact.js';

/** Small, self-contained arcade soundtrack. Audio begins only after a user gesture. */
export class AudioEngine {
  constructor() {
    this.context = null;
    this.master = null;
    this.muted = false;
    this.playing = false;
    this.beat = 0;
    this.nextBeat = 0;
    this.timer = null;
    this.hitBuffer = null;
  }

  unlock() {
    const AudioContext = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!AudioContext) return;
    if (!this.context) {
      this.context = new AudioContext();
      this.master = this.context.createGain();
      this.master.gain.value = this.muted ? 0 : 0.38;
      this.master.connect(this.context.destination);
    }
    if (this.context.state === 'suspended') this.context.resume().catch(() => {});
  }

  setMuted(muted) {
    this.muted = Boolean(muted);
    if (this.master && this.context) {
      this.master.gain.setTargetAtTime(this.muted ? 0 : 0.38, this.context.currentTime, 0.04);
    }
    return this.muted;
  }

  start() {
    this.unlock();
    if (!this.context || this.playing) return;
    this.playing = true;
    this.beat = 0;
    this.nextBeat = this.context.currentTime + 0.1;
    this.timer = setInterval(() => this.schedule(), 90);
  }

  stop() {
    this.playing = false;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  schedule() {
    if (!this.context || !this.playing || this.context.state !== 'running') return;
    while (this.nextBeat < this.context.currentTime + 0.25) {
      const i = this.beat % 32;
      const bass = [55, 55, 65.406, 55, 73.416, 65.406, 49, 49][Math.floor(i / 4)];
      if (i % 2 === 0) this.tone(bass, 0.19, 'triangle', 0.085, this.nextBeat);
      if (i % 4 === 0) this.tone(95, 0.12, 'sine', 0.12, this.nextBeat, 30);
      if (i % 4 === 2) this.noise(0.11, 0.034, this.nextBeat, 1800);
      this.noise(0.025, 0.015, this.nextBeat, 7000);
      if ([3, 7, 11, 15, 19, 23, 26, 30].includes(i)) {
        this.tone([220, 261.626, 293.665, 329.628][Math.floor(i / 8)], 0.2, 'sine', 0.025, this.nextBeat);
      }
      this.beat++;
      this.nextBeat += 60 / 108 / 2;
    }
  }

  tone(frequency, duration, shape = 'sine', volume = 0.15, at, endFrequency) {
    if (!this.context || !this.master) return;
    const now = at ?? this.context.currentTime;
    const osc = this.context.createOscillator();
    const envelope = this.context.createGain();
    osc.type = shape;
    osc.frequency.setValueAtTime(frequency, now);
    if (endFrequency) osc.frequency.exponentialRampToValueAtTime(endFrequency, now + duration);
    envelope.gain.setValueAtTime(0.001, now);
    envelope.gain.exponentialRampToValueAtTime(Math.max(0.001, volume), now + 0.008);
    envelope.gain.exponentialRampToValueAtTime(0.001, now + duration);
    osc.connect(envelope);
    envelope.connect(this.master);
    osc.start(now);
    osc.stop(now + duration + 0.02);
    osc.onended = () => { osc.disconnect(); envelope.disconnect(); };
  }

  noise(duration = 0.1, volume = 0.07, at, cutoff = 1000) {
    if (!this.context || !this.master) return;
    const now = at ?? this.context.currentTime;
    const buffer = this.context.createBuffer(1, Math.ceil(this.context.sampleRate * duration), this.context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    const source = this.context.createBufferSource();
    const filter = this.context.createBiquadFilter();
    const gain = this.context.createGain();
    source.buffer = buffer;
    filter.type = 'highpass';
    filter.frequency.value = cutoff;
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    source.start(now);
    source.onended = () => { source.disconnect(); filter.disconnect(); gain.disconnect(); };
  }

  hit(kind = 'light', at, gainScale = 1) {
    if (!this.context || !this.master) return;
    if (!this.hitBuffer) {
      const samples = makeHitSound(this.context.sampleRate);
      this.hitBuffer = this.context.createBuffer(1, samples.length, this.context.sampleRate);
      this.hitBuffer.getChannelData(0).set(samples);
    }
    const profile = IMPACT_PROFILES[kind] || IMPACT_PROFILES.light;
    const source = this.context.createBufferSource(), gain = this.context.createGain();
    source.buffer = this.hitBuffer;
    source.playbackRate.value = profile.rate;
    gain.gain.value = profile.gain * gainScale;
    source.connect(gain); gain.connect(this.master);
    source.start(at ?? this.context.currentTime);
    source.onended = () => { source.disconnect(); gain.disconnect(); };
  }

  sfx(name) {
    this.unlock();
    if (!this.context) return;
    const now = this.context.currentTime;
    if (name === 'swing') {
      this.noise(0.1, 0.035, now, 1600);
    } else if (name === 'punch' || name === 'kick' || name === 'hurt') {
      this.hit('light', now);
    } else if (name === 'launcher') {
      this.hit('heavy', now);
    } else if (name === 'charge') {
      this.tone(220, 0.2, 'sine', 0.1, now, 880);
      this.tone(660, 0.13, 'triangle', 0.07, now + 0.12);
    } else if (name === 'guard') {
      this.noise(.055, .012, now, 900);
    } else if (name === 'parry') {
      this.hit('guard', now);
    } else if (name === 'chainImpact') {
      this.hit('ground', now, .8);
    } else if (name === 'slam') {
      this.hit('ground', now);
    } else if (name === 'grab') {
      this.noise(.07, .035, now, 800);
    } else if (name === 'special') {
      this.tone(120, 0.42, 'sawtooth', 0.065, now, 650);
      this.tone(360, 0.25, 'sine', 0.09, now + 0.15, 1200);
    } else if (name === 'tag') {
      this.tone(440, 0.12, 'sine', 0.12, now);
      this.tone(660, 0.17, 'sine', 0.1, now + 0.075);
    } else if (name === 'clear' || name === 'victory') {
      [220, 293.665, 329.628, 440].forEach((f, i) => this.tone(f, 0.35, 'triangle', 0.12, now + i * 0.12));
    } else if (name === 'jump') {
      this.tone(140, 0.14, 'triangle', 0.07, now, 460);
    } else if (name === 'miss') {
      this.noise(0.07, 0.025, now, 2400);
    }
  }

  destroy() {
    this.stop();
    if (this.context) this.context.close().catch(() => {});
    this.context = null;
    this.master = null;
    this.hitBuffer = null;
  }
}
