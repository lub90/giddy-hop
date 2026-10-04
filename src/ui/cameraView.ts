import type { PlayerTracker } from '../pose/playerTracker';
import { SKELETON_EDGES, type DetectedPose } from '../pose/poseTypes';

/**
 * Mirrored webcam image with skeletons drawn on top. One instance is moved
 * between the registration screen (large) and the debug panel (small).
 */
export class CameraView {
  readonly canvas = document.createElement('canvas');
  private readonly ctx = this.canvas.getContext('2d')!;

  constructor(private readonly video: HTMLVideoElement) {
    this.canvas.className = 'camera-view';
  }

  draw(tracker: PlayerTracker, names: readonly string[], colors: readonly string[]): void {
    const { canvas, ctx, video } = this;
    if (!canvas.isConnected || canvas.clientWidth === 0) return;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, w, h);
    if (!video.videoWidth) return;

    // Fit the video into the canvas (contain) and mirror it like a real mirror.
    const scale = Math.min(w / video.videoWidth, h / video.videoHeight);
    const vw = video.videoWidth * scale;
    const vh = video.videoHeight * scale;
    const ox = (w - vw) / 2;
    const oy = (h - vh) / 2;
    ctx.save();
    ctx.translate(ox + vw, oy);
    ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0, vw, vh);
    ctx.restore();

    const map = (x: number, y: number) => [ox + x * scale, oy + y * scale] as const;

    for (const c of tracker.candidates) {
      this.skeleton(c.pose, 'rgba(255,255,255,0.45)', map, 2);
      if (c.progress > 0) this.progressRing(c.pose, c.progress, map);
    }
    tracker.slots.forEach((slot, i) => {
      if (!slot.pose) return;
      this.skeleton(slot.pose, colors[i], map, 4);
      this.label(slot.pose, `${i + 1} ${names[i]}`, colors[i], map);
    });
  }

  private skeleton(pose: DetectedPose, color: string, map: (x: number, y: number) => readonly [number, number], width: number): void {
    const { ctx } = this;
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    for (const [a, b] of SKELETON_EDGES) {
      const ka = pose.keypoints[a];
      const kb = pose.keypoints[b];
      if (!ka || !kb) continue;
      ctx.beginPath();
      ctx.moveTo(...map(ka.x, ka.y));
      ctx.lineTo(...map(kb.x, kb.y));
      ctx.stroke();
    }
  }

  private headPoint(pose: DetectedPose): { x: number; y: number } | null {
    const k = pose.keypoints;
    const p = k.nose ?? k.left_shoulder ?? k.right_shoulder;
    return p ? { x: p.x, y: p.y - 60 } : null;
  }

  private progressRing(pose: DetectedPose, progress: number, map: (x: number, y: number) => readonly [number, number]): void {
    const p = this.headPoint(pose);
    if (!p) return;
    const [x, y] = map(p.x, p.y);
    const { ctx } = this;
    ctx.lineWidth = 6;
    ctx.strokeStyle = 'rgba(0,0,0,0.4)';
    ctx.beginPath();
    ctx.arc(x, y, 18, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = '#ffd24a';
    ctx.beginPath();
    ctx.arc(x, y, 18, -Math.PI / 2, -Math.PI / 2 + progress * Math.PI * 2);
    ctx.stroke();
  }

  private label(pose: DetectedPose, text: string, color: string, map: (x: number, y: number) => readonly [number, number]): void {
    const p = this.headPoint(pose);
    if (!p) return;
    const [x, y] = map(p.x, p.y);
    const { ctx } = this;
    ctx.font = 'bold 18px system-ui, sans-serif';
    ctx.textAlign = 'center';
    const tw = ctx.measureText(text).width + 16;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.roundRect(x - tw / 2, y - 16, tw, 28, 14);
    ctx.fill();
    ctx.fillStyle = '#111';
    ctx.fillText(text, x, y + 4);
  }
}
