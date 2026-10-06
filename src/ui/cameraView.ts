import type { PlayerTracker } from '../pose/playerTracker';
import { SKELETON_EDGES, type DetectedPose } from '../pose/poseTypes';

/** Progress ring colors: one arm (register / ready) and both arms (back / cancel). */
const ONE_ARM_COLOR = '#ffd24a';
const BOTH_ARMS_COLOR = '#ff6a4a';

const RING_RADIUS = 18;
const LABEL_HEIGHT = 28;
/** Gap between ring and label, and to the canvas edge. */
const MARGIN = 6;

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), Math.max(lo, hi));

/** Center of a name label above the head, kept inside the canvas. */
export function placeLabel(x: number, y: number, width: number, canvasW: number, canvasH: number): { x: number; y: number } {
  return {
    x: clamp(x, width / 2 + MARGIN, canvasW - width / 2 - MARGIN),
    y: clamp(y, LABEL_HEIGHT / 2 + MARGIN, canvasH - LABEL_HEIGHT / 2 - MARGIN),
  };
}

/**
 * Center of a progress ring, always fully inside the canvas: above the label
 * (or above the head), or – when a child stands so close to the top edge that
 * there is no room – beside the label.
 */
export function placeRing(x: number, y: number, canvasW: number, canvasH: number, label?: Box): { x: number; y: number } {
  const r = RING_RADIUS + 3;
  let ry = label ? label.y - label.h / 2 - MARGIN - r : y;
  let rx = x;
  if (label && ry < r + MARGIN) {
    ry = label.y;
    rx = label.x + label.w / 2 + MARGIN + r;
    // No room on the right either: left of the label.
    if (rx > canvasW - r - MARGIN) rx = label.x - label.w / 2 - MARGIN - r;
  }
  return { x: clamp(rx, r + MARGIN, canvasW - r - MARGIN), y: clamp(ry, r + MARGIN, canvasH - r - MARGIN) };
}

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
    // Let the surrounding box take the camera's aspect ratio (no black bars).
    const aspect = (video.videoWidth / video.videoHeight).toFixed(4);
    const box = canvas.parentElement;
    if (box && box.style.getPropertyValue('--camera-aspect') !== aspect) box.style.setProperty('--camera-aspect', aspect);

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
      if (c.progress > 0) this.progressRing(c.pose, c.progress, ONE_ARM_COLOR, map);
    }
    for (const slot of tracker.slots) {
      if (!slot.pose) continue;
      const n = slot.number;
      this.skeleton(slot.pose, colors[n], map, 4);
      const label = this.label(slot.pose, `${n + 1} ${names[n]}${slot.ready ? ' ✅' : ''}`, colors[n], map);
      if (slot.arms.progress > 0) {
        this.progressRing(slot.pose, slot.arms.progress, slot.arms.holding === 2 ? BOTH_ARMS_COLOR : ONE_ARM_COLOR, map, label);
      }
    }
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

  private progressRing(
    pose: DetectedPose,
    progress: number,
    color: string,
    map: (x: number, y: number) => readonly [number, number],
    label?: Box | null,
  ): void {
    const p = this.headPoint(pose);
    if (!p) return;
    const [hx, hy] = map(p.x, p.y);
    const { x, y } = placeRing(hx, hy, this.canvas.width, this.canvas.height, label ?? undefined);
    const { ctx } = this;
    ctx.lineWidth = 6;
    ctx.strokeStyle = 'rgba(0,0,0,0.4)';
    ctx.beginPath();
    ctx.arc(x, y, RING_RADIUS, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, RING_RADIUS, -Math.PI / 2, -Math.PI / 2 + progress * Math.PI * 2);
    ctx.stroke();
  }

  /** Draws the name label above the head; returns where it ended up. */
  private label(pose: DetectedPose, text: string, color: string, map: (x: number, y: number) => readonly [number, number]): Box | null {
    const p = this.headPoint(pose);
    if (!p) return null;
    const { ctx } = this;
    ctx.font = 'bold 18px system-ui, sans-serif';
    ctx.textAlign = 'center';
    const tw = ctx.measureText(text).width + 16;
    const { x, y } = placeLabel(...map(p.x, p.y), tw, this.canvas.width, this.canvas.height);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.roundRect(x - tw / 2, y - LABEL_HEIGHT / 2, tw, LABEL_HEIGHT, LABEL_HEIGHT / 2);
    ctx.fill();
    ctx.fillStyle = '#111';
    ctx.fillText(text, x, y + 6);
    return { x, y, w: tw, h: LABEL_HEIGHT };
  }
}
