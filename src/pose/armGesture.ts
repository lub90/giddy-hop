/** A completed arm gesture: one arm or both arms held up long enough. */
export type ArmAction = 'one' | 'both';

/**
 * Turns the number of raised arms per frame into discrete actions.
 *
 * - An action fires once the same arm count (1 or 2) has been held for `hold` seconds.
 * - Raising the second arm shortly after the first restarts the timer, so
 *   "both arms" never fires a "one arm" action on the way up.
 * - After an action the arms must be lowered completely before the next one
 *   can fire, so one long raise never counts twice.
 */
export class ArmGestureDetector {
  /** Arm count currently being held (0 when idle or waiting for release). */
  holding: 0 | 1 | 2 = 0;
  /** Progress of the current hold, 0..1 (for UI rings). */
  progress = 0;

  private since = 0;

  /** @param needsRelease start blocked until the arms are lowered (e.g. right after registering). */
  constructor(private needsRelease = false) {}

  update(arms: 0 | 1 | 2, t: number, hold: number): ArmAction | null {
    if (arms === 0) {
      this.needsRelease = false;
      this.holding = 0;
      this.progress = 0;
      return null;
    }
    if (this.needsRelease) {
      this.holding = 0;
      this.progress = 0;
      return null;
    }
    if (arms !== this.holding) {
      this.holding = arms;
      this.since = t;
    }
    this.progress = Math.min(1, (t - this.since) / hold);
    if (this.progress < 1) return null;

    this.needsRelease = true;
    this.holding = 0;
    this.progress = 0;
    return arms === 2 ? 'both' : 'one';
  }
}
