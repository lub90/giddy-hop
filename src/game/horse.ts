/** Jump in progress. */
export type Airborne =
  /** Jump started inside a jump zone: follows a parabola over distance, guaranteed to clear the fence. */
  | { kind: 'assisted'; from: number; to: number; obstacleId: number }
  /** Small hop outside a jump zone: plain ballistic physics. */
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
  /** Remaining stumble time after hitting an obstacle (s). */
  stumble = 0;
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
