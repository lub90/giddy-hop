import GUI from 'lil-gui';
import { CONFIG } from '../config';
import { clearOverrides, saveOverrides } from '../core/persist';
import type { PlayerSlot } from '../pose/playerTracker';
import type { CameraView } from '../ui/cameraView';

export const CONFIG_STORAGE_KEY = 'giddyup.config.v1';

export interface DebugStats {
  renderFps: number;
  poseFps: number;
  people: number;
  slots: readonly PlayerSlot[];
}

type Range = [min: number, max: number, step?: number];

/** Tunable parameters shown in the panel, grouped like CONFIG. */
const TUNABLES: Record<string, Record<string, Range>> = {
  steer: { fullLeanDegrees: [5, 45, 0.5], curveExponent: [1, 3, 0.1], smoothing: [0.05, 1, 0.05] },
  gallop: {
    minAmplitude: [0.005, 0.15, 0.005],
    adaptiveHysteresis: [0, 0.8, 0.05],
    halfCyclesAveraged: [2, 12, 1],
    cadenceMin: [0, 2, 0.05],
    cadenceFull: [0.8, 4, 0.05],
    positionSmoothing: [0.1, 1, 0.05],
    responsePerSecond: [0.5, 10, 0.5],
  },
  jump: {
    minRise: [0.1, 1, 0.01],
    windowSeconds: [0.2, 1.5, 0.05],
    confirmFrames: [1, 5, 1],
    cooldownSeconds: [0.2, 2, 0.05],
  },
  horse: {
    maxSpeed: [3, 15, 0.5],
    minSpeed: [0, 4, 0.1],
    steerSpeed: [1, 8, 0.1],
    driftFactor: [0, 1.5, 0.05],
    offTrackSpeedFactor: [0.2, 1, 0.05],
    railSpeedFactor: [0.1, 1, 0.05],
  },
  jumpAssist: { zoneBefore: [2, 15, 0.5], height: [0.8, 3, 0.1], freeJumpVelocity: [2, 8, 0.1] },
  tracking: { maxMatchDistance: [0.05, 0.4, 0.01], registerHoldSeconds: [0.2, 3, 0.1] },
  detection: { minKeypointScore: [0.1, 0.8, 0.05] },
  race: { timeoutSeconds: [30, 300, 5] },
  render: { pixelRatio: [0.5, 2, 0.25] },
};

/**
 * Developer overlay, toggled with Ctrl+Alt+D:
 *  - live values per player (lean angle, bounce cadence, jump rise …)
 *  - camera preview with skeletons
 *  - sliders for all tuning values (saved in the browser, survive reloads)
 */
export class DebugPanel {
  visible = false;
  private readonly root = document.createElement('div');
  private readonly live = document.createElement('pre');
  private readonly cameraSlot = document.createElement('div');
  private readonly gui: GUI;
  private lastLiveUpdate = 0;

  constructor(
    host: HTMLElement,
    private readonly cameraView: CameraView,
    onRenderChange: () => void,
  ) {
    this.root.className = 'debug hidden';
    this.cameraSlot.className = 'debug-camera';
    this.live.className = 'debug-live';
    this.root.append(this.cameraSlot, this.live);
    host.appendChild(this.root);

    this.gui = new GUI({ title: 'Debug – Ctrl+Alt+D', container: this.root, width: 300 });
    const save = () => saveOverrides(CONFIG_STORAGE_KEY, CONFIG);
    const cfg = CONFIG as unknown as Record<string, Record<string, number>>;
    for (const [section, fields] of Object.entries(TUNABLES)) {
      const folder = this.gui.addFolder(section);
      folder.close();
      for (const [key, [min, max, step]] of Object.entries(fields)) {
        const c = folder.add(cfg[section], key, min, max, step);
        c.onFinishChange(() => {
          save();
          if (section === 'render') onRenderChange();
        });
      }
    }
    this.gui.add(
      {
        copy: () => void navigator.clipboard?.writeText(JSON.stringify(CONFIG, null, 2)),
      },
      'copy',
    ).name('📋 Config kopieren (JSON)');
    this.gui.add(
      {
        reset: () => {
          clearOverrides(CONFIG_STORAGE_KEY);
          location.reload();
        },
      },
      'reset',
    ).name('↺ Reset to defaults (reload)');
  }

  toggle(): void {
    this.visible = !this.visible;
    this.root.classList.toggle('hidden', !this.visible);
  }

  mountCamera(): void {
    this.cameraSlot.appendChild(this.cameraView.canvas);
  }

  /** True while the camera preview lives in the panel. */
  get showsCamera(): boolean {
    return this.visible && this.cameraView.canvas.parentElement === this.cameraSlot;
  }

  update(stats: DebugStats, now: number): void {
    if (!this.visible || now - this.lastLiveUpdate < 0.1) return;
    this.lastLiveUpdate = now;
    const f = (v: number, d = 2) => (v >= 0 ? ' ' : '') + v.toFixed(d);
    const lines = [
      `Render ${stats.renderFps.toFixed(0)} fps · Pose ${stats.poseFps.toFixed(1)} fps · people ${stats.people}`,
      '',
      ' #  tracked  lean°   steer   Hz    drive  rise   max',
      ...stats.slots.map((s, i) => {
        const g = s.gestures;
        const seen = s.kind === 'keyboard' ? 'keyboard' : g.tracked ? 'yes    ' : 'NO     ';
        return ` ${i + 1}  ${seen}  ${f(g.leanDegrees, 1).padStart(6)}  ${f(g.steer)}  ${g.cadence.toFixed(1)}   ${g.drive.toFixed(2)}  ${f(g.rise)}  ${g.peakRise.toFixed(2)}`;
      }),
      '',
      `jump: rise ≥ ${CONFIG.jump.minRise.toFixed(2)} · full speed at ${CONFIG.gallop.cadenceFull.toFixed(1)} Hz`,
    ];
    this.live.textContent = lines.join('\n');
  }
}
