import '@tensorflow/tfjs-backend-webgl';
import * as tf from '@tensorflow/tfjs-core';
import * as poseDetection from '@tensorflow-models/pose-detection';
import { CONFIG } from '../config';
import { EMPTY_FRAME, toDetectedPose, type DetectedPose, type PoseFrame } from './poseTypes';

/**
 * Runs MoveNet MultiPose continuously in its own loop, independent of the
 * render loop. The game reads `latest` whenever it likes; `latest.id`
 * changes when a new result arrives.
 */
export class PoseService {
  latest: PoseFrame = EMPTY_FRAME;
  /** Pose detections per second (for the debug panel). */
  fps = 0;

  private detector: poseDetection.PoseDetector | null = null;
  private running = false;
  private frameId = 0;

  constructor(private readonly video: HTMLVideoElement) {}

  async init(): Promise<void> {
    await tf.setBackend('webgl');
    await tf.ready();
    this.detector = await poseDetection.createDetector(poseDetection.SupportedModels.MoveNet, {
      modelType: poseDetection.movenet.modelType.MULTIPOSE_LIGHTNING,
      enableTracking: true,
      trackerType: poseDetection.TrackerType.BoundingBox,
      multiPoseMaxDimension: CONFIG.detection.multiPoseMaxDimension,
    });
  }

  start(): void {
    if (this.running || !this.detector) return;
    this.running = true;
    void this.loop();
  }

  stop(): void {
    this.running = false;
  }

  private async loop(): Promise<void> {
    let fpsCount = 0;
    let fpsSince = performance.now();
    while (this.running && this.detector) {
      const v = this.video;
      if (v.readyState >= 2 && v.videoWidth > 0) {
        const time = performance.now() / 1000;
        try {
          const raw = await this.detector.estimatePoses(v, { flipHorizontal: true });
          const poses = raw
            .map((p) => toDetectedPose(p, v.videoWidth, v.videoHeight, CONFIG.detection.minKeypointScore))
            .filter((p): p is DetectedPose => p !== null);
          this.latest = { id: ++this.frameId, time, width: v.videoWidth, height: v.videoHeight, poses };
          fpsCount++;
        } catch (err) {
          console.warn('Pose detection failed for one frame', err);
        }
      }
      const now = performance.now();
      if (now - fpsSince >= 1000) {
        this.fps = (fpsCount * 1000) / (now - fpsSince);
        fpsCount = 0;
        fpsSince = now;
      }
      // Yield to the browser so rendering stays smooth.
      await new Promise((r) => requestAnimationFrame(r));
    }
  }
}
