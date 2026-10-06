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
 * - Changes of the arm count shorter than `flicker` seconds are ignored, so a
 *   wrist missed by the pose model for a frame or two does not restart the hold.
 */
export class ArmGestureDetector {
  /** Arm count currently being held (0 when idle or waiting for release). */
  holding: 0 | 1 | 2 = 0;
  /** Progress of the current hold, 0..1 (for UI rings). */
  progress = 0;

  private since = 0;
  /** Arm count after flicker filtering, and since when it holds. */
  private stable: 0 | 1 | 2 = 0;
  private stableSince = 0;
  /** Since when (and until when) the raw count differs from `stable`; null = it does not. */
  private differentSince: number | null = null;
  private lastDifferent = 0;

  /**
   * @param needsRelease start with the arms up, blocked until they are lowered
   *   (e.g. right after registering).
   */
  constructor(private needsRelease = false) {
    if (needsRelease) this.stable = 1;
  }

  update(raw: 0 | 1 | 2, t: number, hold: number, flicker = 0): ArmAction | null {
    const arms = this.filter(raw, t, flicker);
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
      // Counted from when the new arm count actually started.
      this.since = Math.min(t, this.stableSince);
    }
    this.progress = Math.min(1, (t - this.since) / hold);
    if (this.progress < 1) return null;

    this.needsRelease = true;
    this.holding = 0;
    this.progress = 0;
    return arms === 2 ? 'both' : 'one';
  }

  /**
   * The arm count, ignoring changes that last shorter than `flicker` seconds.
   * A new count is taken over once it differs from the old one for `flicker`
   * seconds; frames of the old count in between are bridged if they are short.
   */
  private filter(raw: 0 | 1 | 2, t: number, flicker: number): 0 | 1 | 2 {
    if (raw === this.stable) return raw;
    if (this.differentSince === null || t - this.lastDifferent > flicker) this.differentSince = t;
    this.lastDifferent = t;
    if (t - this.differentSince >= flicker) {
      this.stable = raw;
      this.stableSince = this.differentSince;
      this.differentSince = null;
    }
    return this.stable;
  }
}
