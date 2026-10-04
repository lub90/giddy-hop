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
   * A happy whinny: "Wieh-ha".
   *
   * Built like a voice: a soft voiced tone whose vowel changes over time
   * (formant filters move) – a high, strongly fluttering "Wiiieh" held for most
   * of the time, then a lower, shorter, open "A" without flutter (see WHINNY).
   * Ends with a soft snort.
   * `pitch` varies the voice per horse (≈0.85–1.15).
   */
  whinny(pitch = 1): void {
    const r = this.ready();
    const volume = this.volume();
    if (!r || volume <= 0) return;
    const { ctx, bus } = r;
    const t0 = ctx.currentTime + 0.02;
    const dur = WHINNY.duration;
    const at = (frac: number) => t0 + frac * dur;
    /** Linear keyframes (time as fraction of the duration). */
    const keys = (param: AudioParam, points: readonly (readonly [number, number])[], scale = 1) => {
      param.setValueAtTime(points[0][1] * scale, at(points[0][0]));
      for (const [f, v] of points.slice(1)) param.linearRampToValueAtTime(v * scale, at(f));
    };

    const out = ctx.createGain();
    out.gain.value = volume;
    const soften = ctx.createBiquadFilter();
    soften.type = 'lowpass';
    keys(soften.frequency, WHINNY.brightness);
    out.connect(soften).connect(bus);

    // Loudness over the phases, with a dip for the breathy "h".
    const env = ctx.createGain();
    keys(env.gain, WHINNY.loudness);
    env.connect(out);

    // Pulsing: light trill in the "ie", strong "ha-ha-ha" in the "a".
    const pulse = ctx.createGain();
    pulse.gain.value = 1;
    const pulseLfo = ctx.createOscillator();
    keys(pulseLfo.frequency, WHINNY.pulseRate);
    const pulseDepth = ctx.createGain();
    keys(pulseDepth.gain, WHINNY.pulseDepth);
    pulseLfo.connect(pulseDepth).connect(pulse.gain);
    pulse.connect(env);

    // Voiced source: soft, voice-like harmonics (not a harsh sawtooth).
    const voice = ctx.createOscillator();
    voice.setPeriodicWave(this.voiceWave(ctx));
    keys(voice.frequency, WHINNY.pitch, pitch);
    // Trill: the pitch shakes quickly, strongest around the high point.
    const trill = ctx.createOscillator();
    trill.frequency.value = 11;
    const trillDepth = ctx.createGain();
    keys(trillDepth.gain, WHINNY.trillDepth, pitch);
    trill.connect(trillDepth).connect(voice.frequency);

    // Vowel: three formant filters that move from "W" over "ie" to "a".
    const vowel = ctx.createGain();
    vowel.gain.value = 1;
    WHINNY.formants.forEach((track, i) => {
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.Q.value = [6, 9, 10][i];
      keys(f.frequency, track, Math.sqrt(pitch));
      const g = ctx.createGain();
      g.gain.value = [1.6, 1.1, 0.5][i];
      voice.connect(f).connect(g).connect(vowel);
    });
    vowel.connect(pulse);

    // Breath: quiet throughout, loud for the "h" between "ie" and "a".
    const breath = this.noiseSource(ctx, dur);
    const breathBand = ctx.createBiquadFilter();
    breathBand.type = 'bandpass';
    breathBand.frequency.value = 1500;
    breathBand.Q.value = 0.8;
    const breathGain = ctx.createGain();
    keys(breathGain.gain, WHINNY.breath);
    breath.connect(breathBand).connect(breathGain).connect(env);

    for (const node of [voice, trill, pulseLfo, breath]) {
      node.start(t0);
      node.stop(t0 + dur + 0.05);
    }

    this.snortAt(ctx, out, t0 + dur + 0.2);
  }

  private wave: PeriodicWave | null = null;
  private waveCtx: BaseAudioContext | null = null;

  /** Glottal-like source: harmonics falling off smoothly (1/n^1.4). */
  private voiceWave(ctx: BaseAudioContext): PeriodicWave {
    if (!this.wave || this.waveCtx !== ctx) {
      const n = 40;
      const real = new Float32Array(n);
      const imag = new Float32Array(n);
      for (let k = 1; k < n; k++) imag[k] = 1 / Math.pow(k, 1.4);
      this.wave = ctx.createPeriodicWave(real, imag);
      this.waveCtx = ctx;
    }
    return this.wave;
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

type Keys = readonly (readonly [number, number])[];

/**
 * The "Wieh-ha" as keyframes [time as fraction of the duration, value],
 * modelled on real whinnies:
 *   0.00–0.62 "Wiiieh"  starts high right away (no rise), fluttering strongly, held long
 *   0.62–0.68           short breathy drop
 *   0.68–1.00 "A"       clearly lower, shorter, open vowel, no flutter
 */
export const WHINNY: {
  duration: number;
  pitch: Keys;
  formants: readonly [Keys, Keys, Keys];
  loudness: Keys;
  pulseRate: Keys;
  pulseDepth: Keys;
  trillDepth: Keys;
  breath: Keys;
  brightness: Keys;
} = {
  duration: 1.5,
  // Hz – high from the first moment, held (slightly sinking), then a clear drop for the "A".
  pitch: [[0, 560], [0.62, 520], [0.7, 360], [1, 280]],
  formants: [
    // F1: closed during "Wiiieh", wide open for the "A".
    [[0, 330], [0.62, 350], [0.7, 820], [1, 780]],
    // F2: fairly high "ie"-colour, then the middle "A" position.
    [[0, 1850], [0.62, 1950], [0.7, 1250], [1, 1150]],
    // F3
    [[0, 2600], [0.62, 2700], [0.7, 2500], [1, 2400]],
  ],
  loudness: [[0, 0], [0.03, 0.85], [0.6, 0.8], [0.65, 0.35], [0.7, 1], [0.85, 0.8], [1, 0]],
  // Flutter of the "Wiiieh" (loudness pulsing) – stops for the "A".
  pulseRate: [[0, 13], [0.62, 12], [0.65, 0], [1, 0]],
  pulseDepth: [[0, 0.4], [0.62, 0.35], [0.65, 0], [1, 0]],
  // Hz of pitch shake – strong during "Wiiieh", none in the "A".
  trillDepth: [[0, 40], [0.62, 35], [0.65, 0], [1, 0]],
  breath: [[0, 0.04], [0.62, 0.05], [0.66, 0.35], [0.7, 0.1], [1, 0.06]],
  // Hz – overall low-pass
  brightness: [[0, 3000], [0.62, 3000], [0.7, 3500], [1, 3000]],
};
