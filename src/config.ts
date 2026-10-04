/**
 * All tuning knobs of the game in one place.
 *
 * The values are deliberately a mutable object: the debug panel (Ctrl+Alt+D)
 * writes into it live and persists changes in the browser. Good values can be
 * copied back into this file via "Copy config" in the panel.
 */
export const CONFIG = {
  maxPlayers: 4,
  horseNames: ['Blitz', 'Sternchen', 'Fridolin', 'Luna'],
  playerColors: ['#ff4f81', '#3fa9f5', '#ffc93c', '#7bd34f'],

  camera: {
    width: 1280,
    height: 720,
  },

  detection: {
    /** Keypoints below this confidence are ignored. */
    minKeypointScore: 0.3,
    /** Input size for MoveNet MultiPose (multiple of 32). Larger = more accurate, slower. Needs reload. */
    multiPoseMaxDimension: 256,
  },

  tracking: {
    /** Max distance (in image widths) over which a person stays assigned to a player. */
    maxMatchDistance: 0.18,
    /** How fast a player's remembered position follows the person (0..1 per frame). */
    anchorFollow: 0.3,
    /** How long an arm must be raised to register. */
    registerHoldSeconds: 0.8,
    /** During registration: a player is removed when not seen for this long. */
    dropAfterSeconds: 3,
    /** After this time without detection the HUD shows a hint. */
    lostHintSeconds: 0.7,
  },

  steer: {
    /** Lean (shoulder vs. hip center, in shoulder widths) → steer value. */
    gain: 2.5,
    deadzone: 0.06,
    /** Smoothing per pose frame (0 = sluggish, 1 = immediate). */
    smoothing: 0.35,
  },

  gallop: {
    /** Time window for the bounce energy. */
    windowSeconds: 0.8,
    /** Bounce energy (torso lengths per second) below this = standstill. */
    energyMin: 0.25,
    /** Bounce energy for full speed. */
    energyFull: 1.1,
    /** Smoothing of the vertical position against measurement noise. */
    positionSmoothing: 0.5,
    /** How fast the drive value follows (per second). */
    responsePerSecond: 4,
  },

  jump: {
    /** Upward velocity (torso lengths/s) above which a jump is triggered. */
    upVelocityThreshold: 2.2,
    cooldownSeconds: 0.7,
  },

  horse: {
    maxSpeed: 9,
    /** The horse always trots at least this fast – nobody gets stuck. */
    minSpeed: 1.2,
    accel: 4,
    decel: 3,
    /** Sideways speed at full lean (m/s). */
    steerSpeed: 3.5,
    /** How strongly curves carry the horse outwards (factor on v²·curvature). */
    driftFactor: 0.45,
    lateralResponse: 6,
    offTrackSpeedFactor: 0.5,
    stumbleSpeedFactor: 0.35,
    stumbleSeconds: 0.8,
  },

  jumpAssist: {
    /** Jump zone: a jump triggered within this many meters before a fence is timed automatically. */
    zoneBefore: 9,
    /** Minimum half length of an assisted jump (m). */
    minHalfLength: 1.2,
    height: 1.6,
    /** Minimum speed while airborne so nobody "hangs" above a fence. */
    minAirSpeed: 3.5,
    /** Small hop outside the jump zone. */
    freeJumpVelocity: 4,
    gravity: 18,
  },

  obstacles: {
    fenceHeight: 1.0,
    coneHitRadius: 0.7,
    carrotPickRadius: 1.1,
  },

  scoring: {
    faultPenaltySeconds: 4,
    carrotBonusSeconds: 1,
  },

  race: {
    countdownSeconds: 3,
    timeoutSeconds: 150,
    /** Wait this long after the race ends before showing the results. */
    resultsDelaySeconds: 2,
  },

  render: {
    /** Resolution factor (1 = CSS pixels). Lower = faster. */
    pixelRatio: 1,
    antialias: true,
    fov: 70,
    viewDistance: 220,
    treeCount: 320,
  },

  keys: {
    debugToggle: { code: 'KeyD', ctrl: true, alt: true, shift: false },
  },
};

export type Config = typeof CONFIG;
export type SteerConfig = Config['steer'];
export type GallopConfig = Config['gallop'];
export type JumpConfig = Config['jump'];
export type TrackingConfig = Config['tracking'];
