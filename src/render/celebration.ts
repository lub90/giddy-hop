/**
 * Timing of the finish celebration (pure math, no three.js):
 *  - the camera orbits 180° around the horse and ends up looking back along the track
 *  - the horse rears up, paddles with its front hooves, shakes its head and lands again,
 *    repeated after a pause
 */

export interface CelebrationTiming {
  /** Delay after crossing the line before the first rearing (s). */
  delay: number;
  /** Length of one rearing, from rising up to standing again (s). */
  cycle: number;
  /** Rest on all fours between two rearings (s). */
  pause: number;
}

export interface CelebrationPose {
  /** Body pitch around the hind hips (radians, positive = front up). */
  pitch: number;
  /** Front leg angle relative to the body (radians). */
  frontLegs: number;
  /** Sideways head shake (radians). */
  headShake: number;
}

export const MAX_PITCH = 0.95;
/** Duration of the camera orbit (s). */
export const ORBIT_SECONDS = 1.8;

const smooth = (x: number) => {
  const c = Math.min(1, Math.max(0, x));
  return c * c * (3 - 2 * c);
};

/** 0..1 progress of the camera orbit (eased), 1 = in front of the horse, looking back. */
export function orbitProgress(elapsed: number): number {
  return smooth(elapsed / ORBIT_SECONDS);
}

/** Time from the start of one rearing to the start of the next (s). */
const period = (timing: CelebrationTiming) => timing.cycle + timing.pause;

/** Number of rearings started since crossing the line (each one comes with a whinny). */
export function rearingsStarted(elapsed: number, timing: CelebrationTiming): number {
  const local = elapsed - timing.delay;
  return local < 0 ? 0 : Math.floor(local / period(timing)) + 1;
}

/** Pose of the horse `elapsed` seconds after crossing the finish line. */
export function celebrationPose(elapsed: number, timing: CelebrationTiming): CelebrationPose {
  const rest: CelebrationPose = { pitch: 0, frontLegs: 0, headShake: 0 };
  const local = elapsed - timing.delay;
  if (local < 0) return rest;

  const within = local % period(timing);
  if (within >= timing.cycle) return rest;
  // Phases within one rearing, as fractions of its length.
  const c = within / timing.cycle;
  const RISE = 0.2;
  const HOLD = 0.65;
  const LAND = 0.85;

  let up: number;
  if (c < RISE) up = smooth(c / RISE);
  else if (c < HOLD) up = 1;
  else if (c < LAND) up = 1 - smooth((c - HOLD) / (LAND - HOLD));
  else return rest;

  const inAir = c >= RISE * 0.5 && c < HOLD;
  return {
    pitch: up * MAX_PITCH + (c >= RISE && c < HOLD ? Math.sin(local * 9) * 0.04 : 0),
    // Front hooves paddle in the air.
    frontLegs: up * 1.1 + (inAir ? Math.sin(local * 14) * 0.55 : 0),
    // Joyful head shaking while up.
    headShake: c >= RISE && c < HOLD ? Math.sin(local * 16) * 0.4 : 0,
  };
}
