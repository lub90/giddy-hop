import { CONFIG, type TrackingConfig } from '../config';
import { distance, lerp, type Point } from '../core/math';
import { GestureAnalyzer, type GestureConfig } from '../input/gestureAnalyzer';
import { isArmRaised, type DetectedPose, type PoseFrame } from './poseTypes';

export type SlotKind = 'pose' | 'keyboard';

/** A registered player. */
export interface PlayerSlot {
  /** Running id (stays the same when slots are re-sorted). */
  readonly uid: number;
  readonly kind: SlotKind;
  /** Remembered position (normalized 0..1); slowly follows the person. */
  anchor: Point | null;
  trackId: number | undefined;
  /** Pose assigned in the current frame, null when not detected. */
  pose: DetectedPose | null;
  lastSeen: number;
  readonly gestures: GestureAnalyzer;
}

/** A not (yet) registered person with arm-raise progress. */
export interface Candidate {
  pose: DetectedPose;
  /** 0..1 – registers at 1. */
  progress: number;
}

export interface TrackerOptions {
  tracking: TrackingConfig;
  maxPlayers: number;
  gestures: GestureConfig;
}

/**
 * Assigns detected people to fixed player slots over time.
 *
 * - Registration: an unassigned person holds an arm up.
 * - Matching: by MoveNet tracker id first, otherwise by nearest remembered
 *   position. People who match no player are ignored (other kids may be in
 *   the picture).
 */
export class PlayerTracker {
  slots: PlayerSlot[] = [];
  candidates: Candidate[] = [];

  private nextUid = 1;
  private raiseSince = new Map<string, number>();

  constructor(
    private readonly opts: TrackerOptions = { tracking: CONFIG.tracking, maxPlayers: CONFIG.maxPlayers, gestures: CONFIG },
  ) {}

  get isFull(): boolean {
    return this.slots.length >= this.opts.maxPlayers;
  }

  /**
   * Processes one pose frame.
   * @param allowRegistration true during registration: adds new players and drops vanished ones.
   */
  update(frame: PoseFrame, allowRegistration: boolean): void {
    const t = frame.time;
    const unmatched = this.match(frame.poses, t);

    for (const slot of this.slots) {
      if (slot.kind === 'pose') slot.gestures.update(slot.pose, t);
    }

    this.candidates = [];
    if (!allowRegistration) {
      this.raiseSince.clear();
      return;
    }

    const seenKeys = new Set<string>();
    for (const pose of unmatched) {
      const key = candidateKey(pose);
      seenKeys.add(key);
      if (!isArmRaised(pose) || this.isFull) {
        this.raiseSince.delete(key);
        this.candidates.push({ pose, progress: 0 });
        continue;
      }
      const since = this.raiseSince.get(key) ?? t;
      this.raiseSince.set(key, since);
      const progress = Math.min(1, (t - since) / this.opts.tracking.registerHoldSeconds);
      if (progress >= 1) {
        this.raiseSince.delete(key);
        this.addPoseSlot(pose, t);
      } else {
        this.candidates.push({ pose, progress });
      }
    }
    for (const key of [...this.raiseSince.keys()]) if (!seenKeys.has(key)) this.raiseSince.delete(key);

    // Whoever walks away during registration frees their slot again.
    this.slots = this.slots.filter(
      (s) => s.kind === 'keyboard' || t - s.lastSeen <= this.opts.tracking.dropAfterSeconds,
    );
    this.sortByPosition();
  }

  /** Adds a keyboard-only player (for testing without a camera). */
  addKeyboardPlayer(): PlayerSlot | null {
    if (this.isFull) return null;
    const slot = this.createSlot('keyboard', null, undefined, Number.POSITIVE_INFINITY);
    this.slots.push(slot);
    return slot;
  }

  clear(): void {
    this.slots = [];
    this.candidates = [];
    this.raiseSince.clear();
  }

  /** Leftmost in the image = player 1 (top left on screen). Keyboard players go last. */
  sortByPosition(): void {
    this.slots.sort((a, b) => {
      if (a.anchor && b.anchor) return a.anchor.x - b.anchor.x;
      if (a.anchor) return -1;
      if (b.anchor) return 1;
      return a.uid - b.uid;
    });
  }

  /** Assigns poses to existing players and returns the remaining ones. */
  private match(poses: DetectedPose[], t: number): DetectedPose[] {
    const { maxMatchDistance, anchorFollow } = this.opts.tracking;
    const pairs: { slot: PlayerSlot; pose: DetectedPose; cost: number }[] = [];
    for (const slot of this.slots) {
      slot.pose = null;
      if (slot.kind !== 'pose' || !slot.anchor) continue;
      for (const pose of poses) {
        const sameId = slot.trackId !== undefined && pose.trackId === slot.trackId;
        const d = distance(slot.anchor, pose.center);
        // Same tracker id always wins, unless the person "teleports".
        if (sameId && d <= maxMatchDistance * 2) pairs.push({ slot, pose, cost: -1 });
        else if (d <= maxMatchDistance) pairs.push({ slot, pose, cost: d });
      }
    }
    pairs.sort((a, b) => a.cost - b.cost);

    const usedPoses = new Set<DetectedPose>();
    for (const { slot, pose } of pairs) {
      if (slot.pose || usedPoses.has(pose) || !slot.anchor) continue;
      slot.pose = pose;
      usedPoses.add(pose);
      slot.trackId = pose.trackId;
      slot.lastSeen = t;
      slot.anchor = {
        x: lerp(slot.anchor.x, pose.center.x, anchorFollow),
        y: lerp(slot.anchor.y, pose.center.y, anchorFollow),
      };
    }
    return poses.filter((p) => !usedPoses.has(p));
  }

  private addPoseSlot(pose: DetectedPose, t: number): void {
    const slot = this.createSlot('pose', { ...pose.center }, pose.trackId, t);
    slot.pose = pose;
    this.slots.push(slot);
  }

  private createSlot(kind: SlotKind, anchor: Point | null, trackId: number | undefined, lastSeen: number): PlayerSlot {
    return { uid: this.nextUid++, kind, anchor, trackId, pose: null, lastSeen, gestures: new GestureAnalyzer(this.opts.gestures) };
  }
}

function candidateKey(pose: DetectedPose): string {
  if (pose.trackId !== undefined) return `id:${pose.trackId}`;
  return `pos:${Math.round(pose.center.x * 20)}`;
}
