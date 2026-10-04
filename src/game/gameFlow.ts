import { CONFIG } from '../config';
import type { PlayerInput } from '../input/playerInput';
import { Race, type RaceConfig } from './race';
import type { Track } from './track';

export type Phase = 'loading' | 'register' | 'countdown' | 'race' | 'results';

/**
 * Game phases and transitions. Contains no DOM/rendering code so it can be
 * unit tested; the App reacts to `phase` changes.
 *
 *   loading → register → countdown → race → results
 *                ↑            ↑                  │
 *                │            └──── rematch ─────┤
 *                └────────── new registration ───┘
 */
export class GameFlow {
  phase: Phase = 'loading';
  /** Seconds since the current phase began. */
  phaseTime = 0;
  race: Race | null = null;

  private overFor = 0;
  private playerCount = 0;

  constructor(
    private readonly track: Track,
    private readonly cfg: RaceConfig = CONFIG,
  ) {}

  /** Camera and model are ready. */
  ready(): void {
    if (this.phase === 'loading') this.enter('register');
  }

  /** Start a race with the registered players. Returns false if not possible. */
  start(playerCount: number): boolean {
    if (this.phase !== 'register' || playerCount < 1) return false;
    this.playerCount = playerCount;
    this.beginCountdown();
    return true;
  }

  /** Same players, new race (from the results screen). */
  rematch(): boolean {
    if (this.phase !== 'results') return false;
    this.beginCountdown();
    return true;
  }

  /** Abort / finish and go back to registration. */
  toRegistration(): void {
    if (this.phase === 'loading') return;
    this.race = null;
    this.enter('register');
  }

  /** Seconds left in the countdown, rounded up (3, 2, 1); 0 outside the countdown. */
  get countdownValue(): number {
    if (this.phase !== 'countdown') return 0;
    return Math.max(1, Math.ceil(this.cfg.race.countdownSeconds - this.phaseTime));
  }

  update(dt: number, inputs: readonly PlayerInput[]): void {
    this.phaseTime += dt;
    if (this.phase === 'countdown' && this.phaseTime >= this.cfg.race.countdownSeconds) {
      this.enter('race');
    } else if (this.phase === 'race' && this.race) {
      this.race.update(dt, inputs);
      if (this.race.isOver) {
        this.overFor += dt;
        if (this.overFor >= this.cfg.race.resultsDelaySeconds) this.enter('results');
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
