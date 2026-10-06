import type { DetectedPose } from '../pose/poseTypes';

/** A rectangle in video pixels (of the mirrored picture the children see). */
export interface CropRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Head-and-shoulders crop of one child, widened to the given aspect ratio
 * (width / height) and kept inside the video. Null when the shoulders are not
 * visible.
 *
 * Measured from the shoulder width, so it works at every camera distance:
 * from about the shoulder width above the shoulders (top of the head) to a bit
 * below them.
 */
export function portraitCrop(pose: DetectedPose, videoW: number, videoH: number, aspect: number): CropRect | null {
  const k = pose.keypoints;
  const ls = k.left_shoulder;
  const rs = k.right_shoulder;
  if (!ls || !rs) return null;
  const shoulderWidth = Math.max(Math.abs(ls.x - rs.x), videoW * 0.03);
  const shoulderY = (ls.y + rs.y) / 2;
  const cx = k.nose?.x ?? (ls.x + rs.x) / 2;

  const top = shoulderY - shoulderWidth * 1.25;
  const bottom = shoulderY + shoulderWidth * 0.45;
  let h = bottom - top;
  let w = Math.max(h * aspect, shoulderWidth * 1.8);
  h = w / aspect;
  // Never larger than the video itself.
  const fit = Math.min(1, videoW / w, videoH / h);
  w *= fit;
  h *= fit;

  const cy = (top + bottom) / 2;
  const x = clamp(cx - w / 2, 0, videoW - w);
  const y = clamp(cy - h / 2, 0, videoH - h);
  return { x, y, w, h };
}

/** Moves a crop smoothly towards the target (rate 0..1 per frame), so the picture does not jitter. */
export function followCrop(current: CropRect | null, target: CropRect, rate: number): CropRect {
  if (!current) return { ...target };
  const lerp = (a: number, b: number) => a + (b - a) * rate;
  return { x: lerp(current.x, target.x), y: lerp(current.y, target.y), w: lerp(current.w, target.w), h: lerp(current.h, target.h) };
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(Math.max(v, lo), Math.max(lo, hi));
}
