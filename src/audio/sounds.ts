import { localSampleUrls } from './localSamples';

/**
 * Sound effects (Web Audio API). Synthesized by default; the whinny uses an own
 * recording instead when one is placed in local-assets/ (see localSamples.ts).
 *
 * Browsers only allow audio after a user interaction; call `unlock()` from a
 * key press or click (the App does this on every key/pointer event).
 * All sounds go through a compressor, so several horses at once never distort.
 */
export class Sounds {
  private ctx: BaseAudioContext | null = null;
  private bus: AudioNode | null = null;
  private noise: AudioBuffer | null = null;
  /** Decoded own whinny recordings (empty = use the synthesis). */
  private whinnySamples: AudioBuffer[] = [];

  /**
   * @param volume master volume, @param hoofVolume / @param whinnyVolume relative volume of the
   *   hoofbeats and of the whinny + snort –
   *   all read on every sound, so changes in the debug panel apply immediately.
   * @param whinnyUrls own whinny recordings (default: local-assets/whinny*)
   */
  constructor(
    private readonly volume: () => number,
    private readonly hoofVolume: () => number = () => 1,
    private readonly whinnyVolume: () => number = () => 1,
    private readonly whinnyUrls: readonly string[] = localSampleUrls('whinny'),
  ) {}

  /** True when an own whinny recording is used instead of the synthesis. */
  get usesRecordedWhinny(): boolean {
    return this.whinnySamples.length > 0;
  }

  /** Decodes the own recordings for this context (failures fall back to the synthesis). */
  private async loadSamples(ctx: BaseAudioContext): Promise<void> {
    const decoded = await Promise.all(
      this.whinnyUrls.map(async (url) => {
        try {
          const data = await (await fetch(url)).arrayBuffer();
          return await ctx.decodeAudioData(data);
        } catch (err) {
          console.warn('Could not load whinny recording', url, err);
          return null;
        }
      }),
    );
    if (this.ctx === ctx) this.whinnySamples = decoded.filter((b): b is AudioBuffer => b !== null);
  }

  /** Plays one of the own recordings; `pitch` slightly varies the voice per horse. */
  private playRecordedWhinny(ctx: BaseAudioContext, bus: AudioNode, volume: number, pitch: number): void {
    const buffer = this.whinnySamples[Math.floor(Math.random() * this.whinnySamples.length)];
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    // Small pitch differences only, so the recording stays natural.
    src.playbackRate.value = 1 + (pitch - 1) * 0.5;
    const gain = ctx.createGain();
    gain.gain.value = volume;
    src.connect(gain).connect(bus);
    src.start(ctx.currentTime + 0.02);
  }

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
    this.whinnySamples = [];
    if (this.whinnyUrls.length > 0) void this.loadSamples(ctx);
  }

  /** Context ready to play right now, or null. */
  private ready(): { ctx: BaseAudioContext; bus: AudioNode } | null {
    const { ctx, bus } = this;
    if (!ctx || !bus) return null;
    if (ctx instanceof AudioContext && ctx.state !== 'running') return null;
    return { ctx, bus };
  }

  /**
   * A happy whinny, modelled on measurements of real whinnies
   * (see WHINNY for the numbers):
   *  - a bright high voice around 1 kHz whose 2nd harmonic is the loudest,
   *    fluttering slowly (~7.5 Hz) in loudness and pitch, falling at the end
   *  - in the middle a second, lower voice joins (horses whinny with two
   *    pitches at once)
   *  - a low, rough "huh" (~180 Hz) at the end
   *  - breathy high noise throughout
   * Ends with a soft snort. `pitch` varies the voice per horse (≈0.85–1.15).
   */
  whinny(pitch = 1): void {
    const r = this.ready();
    const volume = this.volume() * this.whinnyVolume();
    if (!r || volume <= 0) return;
    const { ctx, bus } = r;
    if (this.whinnySamples.length > 0) {
      this.playRecordedWhinny(ctx, bus, volume, pitch);
      return;
    }
    const t0 = ctx.currentTime + 0.02;
    const dur = WHINNY.duration;
    const at = (frac: number) => t0 + frac * dur;
    /** Linear keyframes (time as fraction of the duration). */
    const keys = (param: AudioParam, points: Keys, scale = 1) => {
      param.setValueAtTime(points[0][1] * scale, at(points[0][0]));
      for (const [f, v] of points.slice(1)) param.linearRampToValueAtTime(v * scale, at(f));
    };

    const out = ctx.createGain();
    out.gain.value = volume;
    const top = ctx.createBiquadFilter();
    top.type = 'lowpass';
    top.frequency.value = 7000;
    out.connect(top).connect(bus);

    // One shared flutter (~7.5 Hz) drives loudness and pitch, like in real whinnies.
    const flutter = ctx.createOscillator();
    flutter.frequency.value = WHINNY.flutterRate;
    const flutterAm = ctx.createGain();
    keys(flutterAm.gain, WHINNY.flutterDepth);
    const pulse = ctx.createGain();
    pulse.gain.value = 1;
    flutter.connect(flutterAm).connect(pulse.gain);
    pulse.connect(out);

    // High voice with the measured harmonic balance.
    const high = ctx.createOscillator();
    high.setPeriodicWave(this.whinnyWave(ctx));
    keys(high.frequency, WHINNY.highPitch, pitch);
    const flutterFm = ctx.createGain();
    keys(flutterFm.gain, WHINNY.flutterPitchHz, pitch);
    flutter.connect(flutterFm).connect(high.frequency);
    const highGain = ctx.createGain();
    keys(highGain.gain, WHINNY.highLoudness);
    high.connect(highGain).connect(pulse);

    // Roughness: irregular pitch jitter (real horse voices are far from clean tones).
    const jitterSrc = this.noiseSource(ctx, dur);
    jitterSrc.playbackRate.value = 0.5;
    const jitterSmooth = ctx.createBiquadFilter();
    jitterSmooth.type = 'lowpass';
    jitterSmooth.frequency.value = 45;
    const jitter = ctx.createGain();
    jitter.gain.value = WHINNY.jitterHz * pitch;
    jitterSrc.connect(jitterSmooth).connect(jitter).connect(high.frequency);

    // Second, lower voice in the middle (biphonation).
    const second = ctx.createOscillator();
    second.setPeriodicWave(this.whinnyWave(ctx));
    keys(second.frequency, WHINNY.highPitch, pitch * WHINNY.secondVoiceRatio);
    flutter.connect(flutterFm).connect(second.frequency);
    jitter.connect(second.frequency);
    const secondGain = ctx.createGain();
    keys(secondGain.gain, WHINNY.secondLoudness);
    second.connect(secondGain).connect(pulse);

    // Low, rough "huh" at the end.
    const low = ctx.createOscillator();
    low.type = 'sawtooth';
    keys(low.frequency, WHINNY.lowPitch, pitch);
    const lowFilter = ctx.createBiquadFilter();
    lowFilter.type = 'lowpass';
    lowFilter.frequency.value = 900;
    const lowGain = ctx.createGain();
    keys(lowGain.gain, WHINNY.lowLoudness);
    low.connect(lowFilter).connect(lowGain).connect(out);

    // Breathy high noise.
    const breath = this.noiseSource(ctx, dur);
    const breathBand = ctx.createBiquadFilter();
    breathBand.type = 'bandpass';
    breathBand.frequency.value = 3200;
    breathBand.Q.value = 0.6;
    const breathGain = ctx.createGain();
    keys(breathGain.gain, WHINNY.breath);
    breath.connect(breathBand).connect(breathGain).connect(pulse);

    for (const node of [flutter, high, second, low, breath, jitterSrc]) {
      node.start(t0);
      node.stop(t0 + dur + 0.05);
    }

    this.snortAt(ctx, out, t0 + dur + 0.2);
  }

  private wave: PeriodicWave | null = null;
  private waveCtx: BaseAudioContext | null = null;

  /** Harmonic balance measured in real whinnies: the 2nd harmonic is the loudest. */
  private whinnyWave(ctx: BaseAudioContext): PeriodicWave {
    if (!this.wave || this.waveCtx !== ctx) {
      const harmonics = WHINNY.harmonics;
      const real = new Float32Array(harmonics.length + 1);
      const imag = new Float32Array(harmonics.length + 1);
      harmonics.forEach((a, i) => (imag[i + 1] = a));
      this.wave = ctx.createPeriodicWave(real, imag);
      this.waveCtx = ctx;
    }
    return this.wave;
  }

  /** A soft snort on its own (e.g. for testing in the debug panel). */
  snort(): void {
    const r = this.ready();
    const volume = this.volume() * this.whinnyVolume();
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
 * Whinny parameters, derived from measuring real whinnies (7 recordings):
 * main voice ~900–1040 Hz with the 2nd harmonic (~1.9–2 kHz) loudest, slow strong
 * flutter (6–9 Hz, 50–85 % loudness swing), a second voice at ~2/3 of the pitch in
 * the middle, the pitch falling to ~600 Hz at the end, and a quieter low rough
 * part around 160–220 Hz. Keyframes are [time as fraction of the duration, value].
 */
export const WHINNY: {
  duration: number;
  harmonics: readonly number[];
  highPitch: Keys;
  highLoudness: Keys;
  secondVoiceRatio: number;
  secondLoudness: Keys;
  lowPitch: Keys;
  lowLoudness: Keys;
  flutterRate: number;
  flutterDepth: Keys;
  flutterPitchHz: Keys;
  jitterHz: number;
  breath: Keys;
} = {
  duration: 1.8,
  // Amplitudes of harmonics 1, 2, 3, … of the voices.
  harmonics: [0.55, 1, 0.55, 0.32, 0.18, 0.1, 0.06, 0.03],
  // Hz – reaches ~1 kHz quickly, holds, falls towards the end.
  highPitch: [[0, 930], [0.1, 1000], [0.55, 1000], [0.75, 820], [0.9, 660], [1, 600]],
  highLoudness: [[0, 0], [0.18, 0.75], [0.3, 0.75], [0.6, 0.7], [0.8, 0.35], [1, 0]],
  secondVoiceRatio: 0.68,
  secondLoudness: [[0, 0], [0.22, 0], [0.32, 0.25], [0.6, 0.25], [0.7, 0]],
  // Hz – the low rough "huh" at the end.
  lowPitch: [[0, 210], [1, 165]],
  lowLoudness: [[0, 0], [0.62, 0], [0.75, 0.18], [0.9, 0.15], [1, 0]],
  flutterRate: 6.5,
  // Loudness swing of the flutter (0..1).
  flutterDepth: [[0, 0.25], [0.2, 0.85], [0.7, 0.85], [0.85, 0.45], [1, 0.2]],
  // Hz of pitch swing with the flutter.
  flutterPitchHz: [[0, 10], [0.2, 35], [0.7, 35], [1, 10]],
  // Hz of irregular pitch jitter (roughness).
  jitterHz: 130,
  breath: [[0, 0], [0.15, 0.3], [0.7, 0.3], [1, 0.05]],
};
