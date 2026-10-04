/** Jump in progress. */
export type Airborne =
  /**
   * Jump over an obstacle: a parabola over a fixed flight time with constant
   * horizontal speed, timed so the obstacle is passed mid-flight. Always clears it.
   */
  | { kind: 'assisted'; elapsed: number; duration: number; speed: number; obstacleId: number }
  /** Hop without an obstacle: plain ballistic physics. */
  | { kind: 'free'; vy: number };

/** Simulation state of one horse (no rendering concerns). */
export class Horse {
  /** Distance along the track (m). */
  s = 0;
  /** Sideways offset from the center line (m, positive = right). */
  lateral = 0;
  /** Forward speed (m/s). */
  speed = 0;
  lateralVelocity = 0;
  /** Height above ground while jumping (m). */
  height = 0;
  air: Airborne | null = null;
  /**
   * Obstacle id of a jump requested in the jump zone: the horse keeps galloping
   * and takes off by itself at the right distance in front of it.
   */
  pendingJump: number | null = null;
  /** Pressed against the rails (slows the horse down). */
  touchingRail = false;
  /** Remaining stand-still time after a fault (s). */
  stumble = 0;
  /** Remaining carrot turbo time (s). */
  boost = 0;
  /** Running gait phase (radians) for the animation. */
  gaitPhase = 0;

  carrots = 0;
  faults = 0;
  finished = false;
  finishTime: number | null = null;

  constructor(lateral = 0) {
    this.lateral = lateral;
  }

  get airborne(): boolean {
    return this.air !== null;
  }
}
