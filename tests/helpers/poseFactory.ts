import { toDetectedPose, type DetectedPose, type PoseFrame, type RawPose } from '../../src/pose/poseTypes';

export const FRAME_W = 1280;
export const FRAME_H = 720;
/** Pose frames per second used in the simulations (realistic for MoveNet MultiPose on a laptop). */
export const POSE_FPS = 25;

export interface PersonSpec {
  /** Horizontal body center in pixels. */
  x: number;
  /** Hip height in pixels (image y, downwards). */
  hipY?: number;
  /** Shoulder–hip distance in pixels (≈ how close the child stands). */
  torso?: number;
  /** Sideways shoulder shift relative to the hips in pixels (positive = leaning right). */
  lean?: number;
  /** Extra vertical shoulder offset in pixels (simulates rocking towards the camera). */
  shoulderDrop?: number;
  arm?: 'none' | 'left' | 'right';
  trackId?: number;
}

/** Builds a synthetic MoveNet-like pose for a child standing upright facing the camera. */
export function makePose(spec: PersonSpec): DetectedPose {
  const torso = spec.torso ?? 120;
  const hipY = spec.hipY ?? 450;
  const lean = spec.lean ?? 0;
  const shY = hipY - torso + (spec.shoulderDrop ?? 0);
  const sw = torso * 0.75;
  const x = spec.x;
  const wristUpY = shY - torso;
  const kp = (name: string, px: number, py: number) => ({ name, x: px, y: py, score: 0.9 });
  const raw: RawPose = {
    id: spec.trackId,
    keypoints: [
      kp('nose', x + lean, shY - torso * 0.35),
      kp('left_shoulder', x + lean - sw / 2, shY),
      kp('right_shoulder', x + lean + sw / 2, shY),
      kp('left_hip', x - sw * 0.35, hipY),
      kp('right_hip', x + sw * 0.35, hipY),
      kp('left_wrist', x - sw * 0.7, spec.arm === 'left' ? wristUpY : hipY - 10),
      kp('right_wrist', x + sw * 0.7, spec.arm === 'right' ? wristUpY : hipY - 10),
      kp('left_knee', x - sw * 0.3, hipY + torso * 0.8),
      kp('right_knee', x + sw * 0.3, hipY + torso * 0.8),
    ],
  };
  const pose = toDetectedPose(raw, FRAME_W, FRAME_H, 0.3);
  if (!pose) throw new Error('synthetic pose has no torso');
  return pose;
}

let frameId = 0;
export function makeFrame(time: number, poses: DetectedPose[]): PoseFrame {
  return { id: ++frameId, time, width: FRAME_W, height: FRAME_H, poses };
}

/** Runs `fn` for every pose frame in [from, from + seconds). */
export function simulate(seconds: number, fn: (t: number, step: number) => void, from = 0): number {
  const n = Math.round(seconds * POSE_FPS);
  for (let i = 0; i < n; i++) fn(from + i / POSE_FPS, i);
  return from + n / POSE_FPS;
}
