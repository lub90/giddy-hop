import { midpoint, type Point } from '../core/math';

export const KEYPOINT_NAMES = [
  'nose', 'left_eye', 'right_eye', 'left_ear', 'right_ear',
  'left_shoulder', 'right_shoulder', 'left_elbow', 'right_elbow',
  'left_wrist', 'right_wrist', 'left_hip', 'right_hip',
  'left_knee', 'right_knee', 'left_ankle', 'right_ankle',
] as const;

export type KeypointName = (typeof KEYPOINT_NAMES)[number];

/** Bones for skeleton drawing. */
export const SKELETON_EDGES: ReadonlyArray<readonly [KeypointName, KeypointName]> = [
  ['left_shoulder', 'right_shoulder'], ['left_hip', 'right_hip'],
  ['left_shoulder', 'left_hip'], ['right_shoulder', 'right_hip'],
  ['left_shoulder', 'left_elbow'], ['left_elbow', 'left_wrist'],
  ['right_shoulder', 'right_elbow'], ['right_elbow', 'right_wrist'],
  ['left_hip', 'left_knee'], ['left_knee', 'left_ankle'],
  ['right_hip', 'right_knee'], ['right_knee', 'right_ankle'],
  ['nose', 'left_eye'], ['nose', 'right_eye'],
];

export interface Keypoint extends Point {
  score: number;
}

/**
 * A person detected in one camera frame.
 * Coordinates are pixels of the (mirrored) video: x to the right, y downwards.
 */
export interface DetectedPose {
  /** MoveNet tracker id (stable as long as the person is detected continuously). */
  trackId: number | undefined;
  keypoints: Partial<Record<KeypointName, Keypoint>>;
  /** Torso center normalized to 0..1 (image width/height). */
  center: Point;
}

export interface PoseFrame {
  /** Sequence number – changes only when a new result is available. */
  id: number;
  /** Capture time in seconds. */
  time: number;
  width: number;
  height: number;
  poses: DetectedPose[];
}

export const EMPTY_FRAME: PoseFrame = { id: 0, time: 0, width: 1, height: 1, poses: [] };

/** Raw format as returned by pose-detection (only the fields we need). */
export interface RawPose {
  id?: number;
  keypoints: ReadonlyArray<{ x: number; y: number; score?: number; name?: string }>;
}

/**
 * Converts a raw pose; returns null when no torso is visible.
 *
 * @param mirror flip x so the coordinates match the mirrored video the kids see
 *   (their right is on the right of the screen). Needed because MoveNet in
 *   pose-detection ignores its own `flipHorizontal` option and always returns
 *   raw camera coordinates.
 */
export function toDetectedPose(
  raw: RawPose,
  width: number,
  height: number,
  minScore: number,
  mirror = false,
): DetectedPose | null {
  const keypoints: DetectedPose['keypoints'] = {};
  for (const k of raw.keypoints) {
    const score = k.score ?? 0;
    if (!k.name || score < minScore) continue;
    keypoints[k.name as KeypointName] = { x: mirror ? width - k.x : k.x, y: k.y, score };
  }
  const shoulders = midpoint(keypoints.left_shoulder, keypoints.right_shoulder);
  const hips = midpoint(keypoints.left_hip, keypoints.right_hip);
  const torso = midpoint(shoulders ?? undefined, hips ?? undefined);
  if (!torso) return null;
  return { trackId: raw.id, keypoints, center: { x: torso.x / width, y: torso.y / height } };
}

export interface BodyMetrics {
  shoulderMid: Point;
  hipMid: Point;
  /** Vertical shoulder–hip distance in pixels (the person's scale). */
  torsoLength: number;
  shoulderWidth: number;
}

/** Torso measurements; null when shoulders or hips are missing. */
export function bodyMetrics(pose: DetectedPose): BodyMetrics | null {
  const k = pose.keypoints;
  const shoulderMid = midpoint(k.left_shoulder, k.right_shoulder);
  const hipMid = midpoint(k.left_hip, k.right_hip);
  if (!shoulderMid || !hipMid) return null;
  const torsoLength = Math.abs(hipMid.y - shoulderMid.y);
  if (torsoLength < 1) return null;
  const shoulderWidth =
    k.left_shoulder && k.right_shoulder ? Math.abs(k.left_shoulder.x - k.right_shoulder.x) : torsoLength * 0.8;
  return { shoulderMid, hipMid, torsoLength, shoulderWidth: Math.max(shoulderWidth, torsoLength * 0.3) };
}

/** Number of wrists above the nose (or, without a nose, clearly above the shoulders). */
export function raisedArmCount(pose: DetectedPose): 0 | 1 | 2 {
  const k = pose.keypoints;
  const wrists = [k.left_wrist, k.right_wrist].filter((w): w is Keypoint => !!w);
  if (wrists.length === 0) return 0;
  let limit: number | null = k.nose?.y ?? null;
  if (limit === null) {
    const m = bodyMetrics(pose);
    if (!m) return 0;
    limit = m.shoulderMid.y - m.torsoLength * 0.4;
  }
  const lim = limit;
  return wrists.filter((w) => w.y < lim).length as 0 | 1 | 2;
}

/** At least one arm raised. */
export function isArmRaised(pose: DetectedPose): boolean {
  return raisedArmCount(pose) > 0;
}
