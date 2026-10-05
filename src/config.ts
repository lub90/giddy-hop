/**
 * All tuning knobs of the game in one place.
 *
 * The values are deliberately a mutable object: the debug panel (Ctrl+Alt+D)
 * writes into it live and persists changes in the browser. Good values can be
 * copied back into this file via "Copy config" in the panel.
 */
export const CONFIG = {
  maxPlayers: 4,
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
    /** How long an arm (or both arms) must be held up for a gesture: register, ready, back. */
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
    fullLeanDegrees: 26,
    /**
     * Shape of the response curve: steer = (tilt / fullLean) ^ exponent.
     * 1 = linear, 2 = small tilts count very little (6° → 5 %, 12° → 21 %, 18° → 48 %).
     */
    curveExponent: 2,
    /** Smoothing per pose frame (0 = sluggish, 1 = immediate). */
    smoothing: 0.45,
  },

  gallop: {
    // Speed is driven by the bounce cadence (cycles per second), not by how big the bounce is.
    /** Up/down movement smaller than this (torso lengths) is always treated as noise. */
    minAmplitude: 0.03,
    /** Additionally ignore wiggles smaller than this fraction of the player's own recent bounce size. */
    adaptiveHysteresis: 0.35,
    /** Number of recent half cycles whose median gives the cadence (more = steadier, slower to react). */
    halfCyclesAveraged: 6,
    /** Cadence (Hz) at which the horse starts to speed up. */
    cadenceMin: 0.6,
    /** Cadence (Hz) for full speed. */
    cadenceFull: 2.2,
    /** Smoothing of the vertical position against measurement noise. */
    positionSmoothing: 0.5,
    /** How fast the drive value follows the cadence (per second). Lower = steadier. */
    responsePerSecond: 1.8,
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
    /** Knocking down a jump or hitting a cone: speed right after the impact (factor). */
    faultImpactFactor: 0.15,
    /** …then the horse stands still this long before it can run again (s). */
    faultStopSeconds: 1.2,
    /** Carrot turbo: speed factor on top of the normal speed – also above the maximum. */
    boostFactor: 1.3,
    /** Carrot turbo duration (s). */
    boostSeconds: 2.5,
    /** Extra acceleration while the turbo kicks in (factor on accel). */
    boostAccelFactor: 2.5,
  },

  jumpAssist: {
    /**
     * Jump zone: a jump within this many meters before an obstacle is remembered,
     * and the horse takes off by itself at the right spot.
     */
    zoneBefore: 9,
    /**
     * The speed at the moment of a jump is held through the flight and this long
     * after landing – children stop bouncing to jump and need a moment to start again (s).
     */
    holdAfterLandingSeconds: 1.2,
    /** Flight time of a jump over an obstacle (s). */
    airTime: 0.8,
    height: 1.6,
    /** Minimum horizontal speed in the air (m/s). */
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

  // Carrots (turbo) and faults (stop) already act during the race, so by default
  // the ranking is the plain finish time – what the kids saw is what counts.
  // Set these to add hidden time penalties/bonuses on top.
  scoring: {
    faultPenaltySeconds: 0,
    carrotBonusSeconds: 0,
  },

  race: {
    /** "Laden …" wait after everyone is ready (s). */
    loadingSeconds: 10,
    countdownSeconds: 3,
    /** How long "Los!" is shown at the start of the race (s). */
    goSeconds: 1,
    timeoutSeconds: 150,
    /** Wait at least this long after the race ends before showing the results. */
    resultsDelaySeconds: 2,
    /** Finish celebration: delay after crossing the line before the horse rears (s). */
    celebrationDelaySeconds: 1.2,
    /** Finish celebration: one rearing (s). Results wait until the last horse finished one. */
    celebrationCycleSeconds: 2.6,
    /** Finish celebration: rest between two rearings (s). */
    celebrationPauseSeconds: 3,
  },

  audio: {
    /** Volume of the sound effects (0 = off … 1). */
    volume: 0.5,
    /** Hoofbeats relative to the other sounds (0 = off … 1). */
    hoofVolume: 3,
    /** Whinny and snort of the finish celebration relative to the other sounds. */
    whinnyVolume: 0.25,
  },

  hud: {
    /** Speed fractions (of horse.maxSpeed) where the gauge switches Schritt → Trab → Galopp. */
    gaitThresholds: { trot: 0.3, gallop: 0.65 },
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
