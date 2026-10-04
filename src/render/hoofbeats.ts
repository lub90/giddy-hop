/**
 * When do hooves hit the ground? Pure timing, based on the horse's gait phase
 * (one stride = 2π, see Horse.gaitPhase).
 *
 *  - gallop: three-beat "ta-ta-tamm", then a moment of suspension
 *  - slower: four even beats (walk / trot)
 */

const TWO_PI = Math.PI * 2;

/** Footfall positions within one stride (0..1). */
export const GALLOP_BEATS = [0, 0.13, 0.26];
export const WALK_BEATS = [0, 0.25, 0.5, 0.75];

/** Below this speed fraction the horse walks/trots (even beats), above it gallops. */
export const GALLOP_FROM = 0.45;

/**
 * Number of footfalls between two gait phases (the phase only grows).
 * Returns the indices of the beats that were passed.
 */
export function beatsBetween(prevPhase: number, phase: number, beats: readonly number[]): number[] {
  if (phase <= prevPhase) return [];
  const hits: number[] = [];
  const firstStride = Math.floor(prevPhase / TWO_PI);
  const lastStride = Math.floor(phase / TWO_PI);
  for (let stride = firstStride; stride <= lastStride; stride++) {
    beats.forEach((b, i) => {
      const at = (stride + b) * TWO_PI;
      if (at > prevPhase && at <= phase) hits.push(i);
    });
  }
  return hits;
}
