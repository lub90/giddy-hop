import type { Horse } from '../game/horse';
import { beatsBetween, GALLOP_BEATS, GALLOP_FROM, WALK_BEATS } from '../render/hoofbeats';
import type { Sounds } from './sounds';

/** Turns the horses' gait into hoofbeat sounds – faster and louder the faster they run. */
export class HoofbeatPlayer {
  private prevPhase: number[] = [];

  constructor(private readonly sounds: Sounds) {}

  /** Call when a new race starts. */
  reset(): void {
    this.prevPhase = [];
  }

  /**
   * @param pans stereo position per player (-1 left … 1 right), from the viewport layout
   * @param onGrass per player: currently on the grass strip (duller sound)
   */
  update(horses: readonly Horse[], maxSpeed: number, pans: readonly number[], onGrass: readonly boolean[]): void {
    horses.forEach((h, i) => {
      const prev = this.prevPhase[i] ?? h.gaitPhase;
      this.prevPhase[i] = h.gaitPhase;
      // No hoofbeats in the air or while (almost) standing.
      if (h.airborne || h.speed < 0.3) return;
      const fraction = Math.min(1.3, h.speed / maxSpeed);
      const gallop = fraction >= GALLOP_FROM;
      for (const beat of beatsBetween(prev, h.gaitPhase, gallop ? GALLOP_BEATS : WALK_BEATS)) {
        // The last beat of the gallop's "ta-ta-tamm" is the strongest.
        this.sounds.hoof(fraction, pans[i] ?? 0, onGrass[i] ? 'grass' : 'sand', gallop && beat === GALLOP_BEATS.length - 1);
      }
    });
  }
}
