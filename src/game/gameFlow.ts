import { CONFIG } from '../config';
import type { PlayerInput } from '../input/playerInput';
import { Race, type RaceConfig } from './race';
import type { Track } from './track';

export type Phase = 'startup' | 'register' | 'loading' | 'countdown' | 'race' | 'results';

/**
 * Game phases and transitions. Contains no DOM/rendering code so it can be
 * unit tested; the App reacts to `phase` changes.
 *
 *   startup → register → loading → countdown → race → results
 *                ↑  ↑        │          ↑                 │
 *                │  └ cancel ┘          └──── rematch ────┤
 *                └──────────── new registration ──────────┘
 */
export class GameFlow {
  phase: Phase = 'startup';
  /** Seconds since the current phase began. */
  phaseTime = 0;
  race: Race | null = null;

  private overFor = 0;
  private playerCount = 0;

  constructor(
    private track: Track,
    private readonly cfg: RaceConfig = CONFIG,
  ) {}

  get currentTrack(): Track {
    return this.track;
  }

  /** Selects another course; only possible before a race is set up. */
  setTrack(track: Track): boolean {
    if (this.phase !== 'startup' && this.phase !== 'register') return false;
    this.track = track;
    return true;
  }

  /** Camera and model are ready. */
  ready(): void {
    if (this.phase === 'startup') this.enter('register');
  }

  /** Everyone is ready: show "Laden …" before the countdown. Returns false if not possible. */
  startLoading(playerCount: number): boolean {
    if (this.phase !== 'register' || playerCount < 1) return false;
    this.playerCount = playerCount;
    this.enter('loading');
    return true;
  }

  /** A player cancelled the loading. */
  cancelLoading(): void {
    if (this.phase === 'loading') this.enter('register');
  }

  /** Keyboard shortcut: skip the loading wait. */
  skipLoading(): void {
    if (this.phase === 'loading') this.beginCountdown();
  }

  /** Same players, new race (from the results screen). */
  rematch(): boolean {
    if (this.phase !== 'results') return false;
    this.beginCountdown();
    return true;
  }

  /** Abort / finish and go back to registration. */
  toRegistration(): void {
    if (this.phase === 'startup') return;
    this.race = null;
    this.enter('register');
  }

  /** 0..1 progress of the loading wait. */
  get loadingProgress(): number {
    return this.phase === 'loading' ? Math.min(1, this.phaseTime / this.cfg.race.loadingSeconds) : 0;
  }

  /** Seconds left in the countdown, rounded up (3, 2, 1); 0 outside the countdown. */
  get countdownValue(): number {
    if (this.phase !== 'countdown') return 0;
    return Math.max(1, Math.ceil(this.cfg.race.countdownSeconds - this.phaseTime));
  }

  /**
   * Time between the end of the race and the results: at least one full
   * finish celebration of the last horse (the others had theirs already).
   */
  get resultsDelay(): number {
    const r = this.cfg.race;
    return Math.max(r.resultsDelaySeconds, r.celebrationDelaySeconds + r.celebrationCycleSeconds);
  }

  /** True during the first moment of the race, while "Los!" is shown. */
  get showGo(): boolean {
    return this.phase === 'race' && this.phaseTime < this.cfg.race.goSeconds;
  }

  update(dt: number, inputs: readonly PlayerInput[]): void {
    this.phaseTime += dt;
    if (this.phase === 'loading' && this.phaseTime >= this.cfg.race.loadingSeconds) {
      this.beginCountdown();
    } else if (this.phase === 'countdown' && this.phaseTime >= this.cfg.race.countdownSeconds) {
      this.enter('race');
    } else if (this.phase === 'race' && this.race) {
      this.race.update(dt, inputs);
      if (this.race.isOver) {
        this.overFor += dt;
        if (this.overFor >= this.resultsDelay) this.enter('results');
      }
    }
  }

  private beginCountdown(): void {
    this.race = new Race(this.track, this.playerCount, this.cfg);
    this.overFor = 0;
    this.enter('countdown');
  }

  private enter(phase: Phase): void {
    this.phase = phase;
    this.phaseTime = 0;
  }
}
