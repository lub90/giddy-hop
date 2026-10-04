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
    // Steering uses the sideways tilt angle of the upper body (shoulder center vs.
    // hip center). An angle is independent of body size and camera distance, so
    // kids and adults steer the same way.
    /** Tilt at which steering reaches full lock (degrees). */
    fullLeanDegrees: 28,
    /**
     * Shape of the response curve: steer = (tilt / fullLean) ^ exponent.
     * 1 = linear, 2 = small tilts count very little (6° → 5 %, 14° → 25 %, 20° → 51 %).
     */
    curveExponent: 2,
    /** Smoothing per pose frame (0 = sluggish, 1 = immediate). */
    smoothing: 0.35,
  },

  gallop: {
    // Speed is driven by the bounce cadence (cycles per second), not by how big the bounce is.
    /** Up/down movement smaller than this (torso lengths) is treated as noise. */
    minAmplitude: 0.03,
    /** Cadence (Hz) at which the horse starts to speed up. */
    cadenceMin: 0.6,
    /** Cadence (Hz) for full speed. */
    cadenceFull: 2.4,
    /** Smoothing of the vertical position against measurement noise. */
    positionSmoothing: 0.5,
    /** How fast the drive value follows the cadence (per second). Lower = smoother. */
    responsePerSecond: 3,
  },

  jump: {
    /** Hips and shoulders must rise this far above the standing height (torso lengths). */
    minRise: 0.35,
    /** The standing height is the lowest body position within this time window (s). */
    windowSeconds: 0.5,
    /** Number of consecutive pose frames above `minRise` needed (filters single-frame glitches). */
    confirmFrames: 2,
    cooldownSeconds: 0.8,
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
    /** Speed factor on the grass between sand and rails. The whole sand track is full speed. */
    offTrackSpeedFactor: 0.5,
    /** Speed factor while scraping along the rails. */
    railSpeedFactor: 0.35,
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
    /** Jump outside the jump zone (no fence): plain physics, ~0.85 m high. */
    freeJumpVelocity: 5.5,
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
