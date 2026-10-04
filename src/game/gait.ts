export type Gait = 'walk' | 'trot' | 'gallop';

export interface GaitThresholds {
  /** Speed fraction (of maxSpeed) from which the horse trots. */
  trot: number;
  /** Speed fraction from which the horse gallops. */
  gallop: number;
}

/** Gait for a speed fraction 0..1 (speed / maxSpeed). */
export function gaitOf(fraction: number, t: GaitThresholds): Gait {
  if (fraction >= t.gallop) return 'gallop';
  if (fraction >= t.trot) return 'trot';
  return 'walk';
}
