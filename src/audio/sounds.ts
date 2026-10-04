/**
 * Synthesized sound effects (Web Audio API, no sound files).
 *
 * Browsers only allow audio after a user interaction; call `unlock()` from a
 * key press or click (the App does this on every key/pointer event).
 * All sounds go through a compressor, so several horses at once never distort.
 */
export class Sounds {
  private ctx: BaseAudioContext | null = null;
  private bus: AudioNode | null = null;
  private noise: AudioBuffer | null = null;

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
      if (!this.ctx) this.useContext(new AudioContext());
      const ctx = this.ctx;
      if (ctx instanceof AudioContext && ctx.state === 'suspended') void ctx.resume();
    } catch {
      this.ctx = null; // No audio available – the game works silently.
    }
  }

  /** Uses the given context (also an OfflineAudioContext, e.g. to render sounds for analysis). */
  useContext(ctx: BaseAudioContext): void {
    this.ctx = ctx;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.knee.value = 10;
    comp.ratio.value = 4;
    comp.connect(ctx.destination);
    this.bus = comp;
  }

  /** Context ready to play right now, or null. */
  private ready(): { ctx: BaseAudioContext; bus: AudioNode } | null {
    const { ctx, bus } = this;
    if (!ctx || !bus) return null;
    if (ctx instanceof AudioContext && ctx.state !== 'running') return null;
    return { ctx, bus };
  }

  /**
   * A happy whinny. Like a real one it has two voices at once – a low, nasal
   * main voice and a quieter high one – plus breath noise, and it pulses
   * ("hi-hi-hi-hi") while it falls in pitch. Ends with a soft snort.
   * `pitch` varies the voice per horse (≈0.85–1.15).
   */
  whinny(pitch = 1): void {
    const r = this.ready();
    const volume = this.volume();
    if (!r || volume <= 0) return;
    const { ctx, bus } = r;
    const t0 = ctx.currentTime + 0.02;
    const dur = 1.6;

    const out = ctx.createGain();
    out.gain.value = volume * 0.9;
    const soften = ctx.createBiquadFilter();
    soften.type = 'lowpass';
    soften.frequency.value = 2400;
    out.connect(soften).connect(bus);

    // Overall loudness: quick attack, hold, long fade.
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t0);
    env.gain.exponentialRampToValueAtTime(1, t0 + 0.07);
    env.gain.setValueAtTime(1, t0 + dur * 0.45);
    env.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    env.connect(out);

    // Pulsing loudness: the whinny's "hi-hi-hi-hi", slowing down and getting deeper towards the end.
    const pulse = ctx.createGain();
    pulse.gain.value = 0.6;
    const pulseLfo = ctx.createOscillator();
    pulseLfo.frequency.setValueAtTime(11, t0);
    pulseLfo.frequency.linearRampToValueAtTime(6.5, t0 + dur);
    const pulseDepth = ctx.createGain();
    pulseDepth.gain.setValueAtTime(0.15, t0);
    pulseDepth.gain.linearRampToValueAtTime(0.45, t0 + dur);
    pulseLfo.connect(pulseDepth).connect(pulse.gain);
    pulse.connect(env);

    // Low main voice through the formants of a horse's nasal tract.
    const low = ctx.createOscillator();
    low.type = 'sawtooth';
    low.frequency.setValueAtTime(470 * pitch, t0);
    low.frequency.linearRampToValueAtTime(560 * pitch, t0 + 0.12);
    low.frequency.exponentialRampToValueAtTime(420 * pitch, t0 + dur * 0.55);
    low.frequency.exponentialRampToValueAtTime(290 * pitch, t0 + dur);
    const vibrato = ctx.createOscillator();
    vibrato.frequency.value = 6;
    const vibratoDepth = ctx.createGain();
    vibratoDepth.gain.value = 9 * pitch;
    vibrato.connect(vibratoDepth).connect(low.frequency);
    const lowMix = ctx.createGain();
    lowMix.gain.value = 0.55;
    for (const [freq, q, gain] of [
      [750, 4, 1],
      [1300, 5, 0.55],
      [2500, 6, 0.08],
    ] as const) {
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = freq * pitch;
      f.Q.value = q;
      const g = ctx.createGain();
      g.gain.value = gain;
      low.connect(f).connect(g).connect(lowMix);
    }
    lowMix.connect(pulse);

    // Quieter high voice on top (horses whinny with two pitches at once).
    const high = ctx.createOscillator();
    high.type = 'triangle';
    high.frequency.setValueAtTime(1050 * pitch, t0);
    high.frequency.linearRampToValueAtTime(1250 * pitch, t0 + 0.12);
    high.frequency.exponentialRampToValueAtTime(820 * pitch, t0 + dur * 0.7);
    const highGain = ctx.createGain();
    highGain.gain.setValueAtTime(0.12, t0);
    highGain.gain.exponentialRampToValueAtTime(0.001, t0 + dur * 0.75);
    high.connect(highGain).connect(pulse);

    // Breath: soft noise gives the sound its raspy, alive character.
    const breath = this.noiseSource(ctx, dur);
    const breathBand = ctx.createBiquadFilter();
    breathBand.type = 'bandpass';
    breathBand.frequency.value = 1100;
    breathBand.Q.value = 0.7;
    const breathGain = ctx.createGain();
    breathGain.gain.value = 0.14;
    breath.connect(breathBand).connect(breathGain).connect(pulse);

    for (const node of [low, vibrato, high, pulseLfo, breath]) {
      node.start(t0);
      node.stop(t0 + dur + 0.05);
    }

    this.snortAt(ctx, out, t0 + dur + 0.15);
  }

  /** A soft snort on its own (e.g. for testing in the debug panel). */
  snort(): void {
    const r = this.ready();
    const volume = this.volume();
    if (!r || volume <= 0) return;
    const out = r.ctx.createGain();
    out.gain.value = volume * 0.9;
    out.connect(r.bus);
    this.snortAt(r.ctx, out, r.ctx.currentTime + 0.02);
  }

  /**
   * One hoof hitting the ground: a deep thump with a short, dull knock on top.
   * Even duller on grass than on sand.
   * @param intensity 0..1 (speed), @param pan -1 = left … 1 = right
   */
  hoof(intensity: number, pan: number, surface: 'sand' | 'grass', accent = false): void {
    const r = this.ready();
    const volume = this.volume() * this.hoofVolume();
    if (!r || volume <= 0 || intensity <= 0) return;
    const { ctx, bus } = r;
    const t = ctx.currentTime + 0.005;
    const gain = volume * (0.45 + 0.55 * Math.min(1, intensity)) * (accent ? 1.25 : 1);

    const out = ctx.createGain();
    out.gain.value = gain;
    const panner = ctx.createStereoPanner();
    panner.pan.value = Math.max(-1, Math.min(1, pan));
    out.connect(panner).connect(bus);

    // Deep thump: low sine with a pitch drop – the body of the hoofbeat.
    const thump = ctx.createOscillator();
    thump.frequency.setValueAtTime(surface === 'grass' ? 80 : 95, t);
    thump.frequency.exponentialRampToValueAtTime(42, t + 0.12);
    const thumpEnv = ctx.createGain();
    thumpEnv.gain.setValueAtTime(1.4, t);
    thumpEnv.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
    thump.connect(thumpEnv).connect(out);
    thump.start(t);
    thump.stop(t + 0.15);

    // Knock: short, dull noise burst (sand: clearer, grass: muffled).
    const noise = this.noiseSource(ctx, 0.08);
    noise.playbackRate.value = 0.85 + Math.random() * 0.3;
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = surface === 'grass' ? 420 : 850;
    band.Q.value = 1.1;
    const knockEnv = ctx.createGain();
    knockEnv.gain.setValueAtTime(surface === 'grass' ? 0.45 : 0.7, t);
    knockEnv.gain.exponentialRampToValueAtTime(0.001, t + 0.07);
    noise.connect(band).connect(knockEnv).connect(out);
    noise.start(t);
    noise.stop(t + 0.09);
  }

  /**
   * Snort: air blown out through the nostrils with fluttering lips ("brrr") –
   * soft attack, about 0.7 s, low and muffled.
   */
  private snortAt(ctx: BaseAudioContext, out: AudioNode, t: number): void {
    const dur = 0.85;
    const air = this.noiseSource(ctx, dur);
    // Two low-pass stages: a soft, muffled "pfff" instead of a sharp crack.
    const low = ctx.createBiquadFilter();
    low.type = 'lowpass';
    low.frequency.setValueAtTime(650, t);
    low.frequency.linearRampToValueAtTime(320, t + dur);
    const low2 = ctx.createBiquadFilter();
    low2.type = 'lowpass';
    low2.frequency.value = 800;
    const body = ctx.createBiquadFilter();
    body.type = 'peaking';
    body.frequency.value = 220;
    body.gain.value = 6;

    // Lip flutter: fast, fading tremolo.
    const flutter = ctx.createGain();
    flutter.gain.value = 0.6;
    const flutterLfo = ctx.createOscillator();
    flutterLfo.frequency.setValueAtTime(34, t);
    flutterLfo.frequency.linearRampToValueAtTime(24, t + dur);
    const flutterDepth = ctx.createGain();
    flutterDepth.gain.value = 0.4;
    flutterLfo.connect(flutterDepth).connect(flutter.gain);

    // Quieter than the whinny, soft attack, long breathy fade.
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(0.55, t + 0.12);
    env.gain.setValueAtTime(0.55, t + dur * 0.45);
    env.gain.linearRampToValueAtTime(0.0001, t + dur);

    air.connect(low).connect(low2).connect(body).connect(flutter).connect(env).connect(out);
    for (const node of [air, flutterLfo]) {
      node.start(t);
      node.stop(t + dur + 0.05);
    }
  }

  /** White noise source of at least `seconds` length (buffer is shared). */
  private noiseSource(ctx: BaseAudioContext, seconds: number): AudioBufferSourceNode {
    const needed = Math.ceil(ctx.sampleRate * seconds);
    if (!this.noise || this.noise.length < needed || this.noise.sampleRate !== ctx.sampleRate) {
      const len = Math.max(needed, Math.ceil(ctx.sampleRate * 2));
      this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    }
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    return src;
  }
}
