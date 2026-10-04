/**
 * Synthesized sound effects (Web Audio API, no sound files).
 *
 * Browsers only allow audio after a user interaction; call `unlock()` from a
 * key press or click (the App does this on every key/pointer event).
 */
export class Sounds {
  private ctx: AudioContext | null = null;

  /**
   * @param volume master volume, @param hoofVolume relative volume of the hoofbeats –
   *   both read on every sound, so changes in the debug panel apply immediately.
   */
  constructor(
    private readonly volume: () => number,
    private readonly hoofVolume: () => number = () => 1,
  ) {}

  /** Creates/resumes the audio context; must run inside a user gesture. */
  unlock(): void {
    try {
      this.ctx ??= new AudioContext();
      if (this.ctx.state === 'suspended') void this.ctx.resume();
    } catch {
      this.ctx = null; // No audio available – the game works silently.
    }
  }

  /**
   * A happy whinny: a falling, strongly vibrating tone through a nasal filter,
   * ending with a short snort. `pitch` varies the voice per horse (≈0.8–1.2).
   */
  whinny(pitch = 1): void {
    const ctx = this.ctx;
    const volume = this.volume();
    if (!ctx || ctx.state !== 'running' || volume <= 0) return;
    const t0 = ctx.currentTime + 0.02;
    const dur = 1.3;

    const out = ctx.createGain();
    out.gain.value = volume;
    out.connect(ctx.destination);

    // Voice: sawtooth whose frequency rises briefly, then falls.
    const voice = ctx.createOscillator();
    voice.type = 'sawtooth';
    const f = voice.frequency;
    f.setValueAtTime(700 * pitch, t0);
    f.linearRampToValueAtTime(1150 * pitch, t0 + 0.12);
    f.exponentialRampToValueAtTime(520 * pitch, t0 + dur * 0.75);
    f.exponentialRampToValueAtTime(380 * pitch, t0 + dur);

    // Vibrato = the characteristic "trill" of a whinny.
    const lfo = ctx.createOscillator();
    lfo.frequency.setValueAtTime(18, t0);
    lfo.frequency.linearRampToValueAtTime(11, t0 + dur);
    const lfoDepth = ctx.createGain();
    lfoDepth.gain.setValueAtTime(70 * pitch, t0);
    lfoDepth.gain.linearRampToValueAtTime(140 * pitch, t0 + dur);
    lfo.connect(lfoDepth).connect(f);

    // Nasal formant.
    const formant = ctx.createBiquadFilter();
    formant.type = 'bandpass';
    formant.frequency.value = 1500 * pitch;
    formant.Q.value = 2.5;
    const soften = ctx.createBiquadFilter();
    soften.type = 'lowpass';
    soften.frequency.value = 3200;

    const env = ctx.createGain();
    env.gain.setValueAtTime(0, t0);
    env.gain.linearRampToValueAtTime(0.9, t0 + 0.05);
    env.gain.setValueAtTime(0.9, t0 + dur * 0.6);
    env.gain.exponentialRampToValueAtTime(0.001, t0 + dur);

    voice.connect(formant).connect(soften).connect(env).connect(out);
    voice.start(t0);
    lfo.start(t0);
    voice.stop(t0 + dur + 0.05);
    lfo.stop(t0 + dur + 0.05);

    this.snort(ctx, out, t0 + dur + 0.05);
  }

  /**
   * One hoof hitting the ground: a short knock (filtered noise) with a dull
   * thump below. Softer and duller on grass than on sand.
   * @param intensity 0..1 (speed), @param pan -1 = left … 1 = right
   */
  hoof(intensity: number, pan: number, surface: 'sand' | 'grass', accent = false): void {
    const ctx = this.ctx;
    const volume = this.volume() * this.hoofVolume();
    if (!ctx || ctx.state !== 'running' || volume <= 0 || intensity <= 0) return;
    const t = ctx.currentTime + 0.005;
    const gain = volume * (0.35 + 0.65 * intensity) * (accent ? 1.2 : 1);

    const out = ctx.createGain();
    out.gain.value = gain;
    const panner = ctx.createStereoPanner();
    panner.pan.value = Math.max(-1, Math.min(1, pan));
    out.connect(panner).connect(ctx.destination);

    // Knock: very short noise burst through a band-pass.
    const len = Math.floor(ctx.sampleRate * 0.06);
    const buffer = this.noiseBuffer(ctx, len);
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    noise.playbackRate.value = 0.85 + Math.random() * 0.3;
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = surface === 'grass' ? 700 : 1600;
    band.Q.value = 1.4;
    const knockEnv = ctx.createGain();
    knockEnv.gain.setValueAtTime(surface === 'grass' ? 0.5 : 0.9, t);
    knockEnv.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
    noise.connect(band).connect(knockEnv).connect(out);
    noise.start(t);

    // Thump: low sine with a quick pitch drop.
    const thump = ctx.createOscillator();
    thump.frequency.setValueAtTime(140, t);
    thump.frequency.exponentialRampToValueAtTime(60, t + 0.08);
    const thumpEnv = ctx.createGain();
    thumpEnv.gain.setValueAtTime(0.8, t);
    thumpEnv.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
    thump.connect(thumpEnv).connect(out);
    thump.start(t);
    thump.stop(t + 0.1);
  }

  private noise: AudioBuffer | null = null;

  /** Reused white-noise buffer (creating one per hoofbeat would be wasteful). */
  private noiseBuffer(ctx: AudioContext, minLength: number): AudioBuffer {
    if (!this.noise || this.noise.length < minLength) {
      const len = Math.max(minLength, Math.floor(ctx.sampleRate * 0.3));
      this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    }
    return this.noise;
  }

  /** Short breathy noise burst. */
  private snort(ctx: AudioContext, out: AudioNode, t: number): void {
    const len = Math.floor(ctx.sampleRate * 0.25);
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 900;
    filter.Q.value = 1.2;
    const env = ctx.createGain();
    env.gain.value = 0.6;
    noise.connect(filter).connect(env).connect(out);
    noise.start(t);
  }
}
