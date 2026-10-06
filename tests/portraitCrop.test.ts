import { describe, expect, it } from 'vitest';
import { followCrop, portraitCrop } from '../src/ui/portraitCrop';
import { FRAME_H, FRAME_W, makePose } from './helpers/poseFactory';

describe('Rider portrait crop', () => {
  const shoulders = (pose: ReturnType<typeof makePose>) => pose.keypoints.left_shoulder!;

  it('frames head and shoulders of the child in the requested aspect ratio', () => {
    const pose = makePose({ x: 400, torso: 120 });
    const crop = portraitCrop(pose, FRAME_W, FRAME_H, 4 / 3)!;
    expect(crop.w / crop.h).toBeCloseTo(4 / 3, 5);
    // Contains the head (nose) and the shoulders, horizontally centered on the child.
    const nose = pose.keypoints.nose!;
    expect(nose.y).toBeGreaterThan(crop.y);
    expect(shoulders(pose).y).toBeLessThan(crop.y + crop.h);
    expect(crop.x + crop.w / 2).toBeCloseTo(nose.x, 0);
    // A close-up, not the whole picture.
    expect(crop.h).toBeLessThan(FRAME_H * 0.6);
  });

  it('scales with the distance to the camera', () => {
    const near = portraitCrop(makePose({ x: 640, torso: 200, hipY: 600 }), FRAME_W, FRAME_H, 1)!;
    const far = portraitCrop(makePose({ x: 640, torso: 80 }), FRAME_W, FRAME_H, 1)!;
    expect(near.w).toBeGreaterThan(far.w * 2);
  });

  it('stays inside the video for a child at the edge', () => {
    const crop = portraitCrop(makePose({ x: 30, torso: 150 }), FRAME_W, FRAME_H, 16 / 9)!;
    expect(crop.x).toBeGreaterThanOrEqual(0);
    expect(crop.y).toBeGreaterThanOrEqual(0);
    expect(crop.x + crop.w).toBeLessThanOrEqual(FRAME_W);
  });

  it('follows the child smoothly', () => {
    const a = { x: 0, y: 0, w: 100, h: 100 };
    const b = { x: 100, y: 50, w: 200, h: 200 };
    expect(followCrop(null, b, 0.2)).toEqual(b);
    expect(followCrop(a, b, 0.5)).toEqual({ x: 50, y: 25, w: 150, h: 150 });
  });
});
