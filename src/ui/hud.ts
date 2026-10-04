import { gaitOf, type Gait, type GaitThresholds } from '../game/gait';
import { t } from '../i18n';
import type { RaceEvent, RaceEventType, SlowdownReason } from '../game/race';
import type { Rect } from '../render/layout';

export interface HudState {
  /** Live placement, 1 = leading. */
  position: number;
  /** Number of riders; the placement is only shown with more than one. */
  riders: number;
  carrots: number;
  faults: number;
  /** Seconds shown in the timer. */
  time: number;
  /** 0..1 */
  progress: number;
  /** Current horse speed as a fraction of the maximum speed (0..1, above 1 with turbo). */
  speed: number;
  /** Carrot turbo active. */
  boosting: boolean;
  /** Why the horse is slowed down by the track (grass / rail), if at all. */
  slowdown: SlowdownReason;
  jumpZone: boolean;
  lostTracking: boolean;
  /** Suggests leaning: -1 = lean left, +1 = lean right, 0 = fine. */
  steerHint: -1 | 0 | 1;
  finished: boolean;
}

export interface Hint {
  text: string;
  warn: boolean;
}

const TOAST_KEYS: Partial<Record<RaceEventType, string>> = {
  'jump-cleared': 'toast.cleared',
  'jump-fault': 'toast.fault',
  'cone-hit': 'toast.cone',
  carrot: 'toast.carrot',
};

/** Short message for a race event, or null if it has none. */
export function toastFor(e: Pick<RaceEvent, 'type' | 'obstacle'>): string | null {
  if (e.type === 'jump-fault' && e.obstacle === 'water') return t('toast.splash');
  const key = TOAST_KEYS[e.type];
  return key ? t(key) : null;
}

const TOAST_SECONDS = 1.2;
const GAITS: Gait[] = ['walk', 'trot', 'gallop'];

/** The hint line at the bottom of a player's view, most important first. */
export function hintFor(s: HudState): Hint {
  if (s.lostTracking) return { text: t('hud.lost'), warn: true };
  const lean = s.steerHint === -1 ? t('hud.leanLeft') : s.steerHint === 1 ? t('hud.leanRight') : '';
  if (s.slowdown === 'rail') return { text: `${t('hud.rail')} ${lean}`.trim(), warn: true };
  if (s.slowdown === 'grass') return { text: `${t('hud.grass')} ${lean}`.trim(), warn: true };
  return { text: lean, warn: false };
}

/** Cheap DOM updates: only touch the DOM when the text actually changes. */
function setText(el: HTMLElement, text: string): void {
  if (el.textContent !== text) el.textContent = text;
}
function toggle(el: HTMLElement, cls: string, on: boolean): void {
  if (el.classList.contains(cls) !== on) el.classList.toggle(cls, on);
}

/** Vertical speed gauge with tick marks for walk / trot / gallop. */
class SpeedGauge {
  readonly el = document.createElement('div');
  private readonly fill: HTMLElement;
  private readonly labels = new Map<Gait, HTMLElement>();

  constructor(thresholds: GaitThresholds) {
    this.el.className = 'hud-gauge';
    // Each gait label sits in the middle of its band; ticks mark the band borders.
    const bands: Record<Gait, [number, number]> = {
      walk: [0, thresholds.trot],
      trot: [thresholds.trot, thresholds.gallop],
      gallop: [thresholds.gallop, 1],
    };
    const ticks = [thresholds.trot, thresholds.gallop]
      .map((f) => `<div class="gauge-tick" style="bottom:${f * 100}%"></div>`)
      .join('');
    const labels = GAITS.map((g) => {
      const [lo, hi] = bands[g];
      return `<span class="gauge-label" data-gait="${g}" style="bottom:${((lo + hi) / 2) * 100}%">${t(`gait.${g}`)}</span>`;
    }).join('');
    this.el.innerHTML = `<div class="gauge-track"><div class="gauge-fill"></div>${ticks}</div>${labels}`;
    this.fill = this.el.querySelector('.gauge-fill')!;
    for (const g of GAITS) this.labels.set(g, this.el.querySelector(`[data-gait="${g}"]`)!);
  }

  update(speed: number, gait: Gait, slowed: boolean, boosting: boolean): void {
    this.fill.style.height = `${(Math.min(1, Math.max(0, speed)) * 100).toFixed(1)}%`;
    toggle(this.el, 'slowed', slowed);
    toggle(this.el, 'boost', boosting);
    for (const [g, label] of this.labels) toggle(label, 'active', g === gait);
  }
}

class PlayerHud {
  readonly el = document.createElement('div');
  private readonly pos: HTMLElement;
  private readonly stats: HTMLElement;
  private readonly big: HTMLElement;
  private readonly toast: HTMLElement;
  private readonly hint: HTMLElement;
  private readonly bar: HTMLElement;
  private readonly gauge: SpeedGauge;
  private toastUntil = 0;

  constructor(name: string, color: string, private readonly thresholds: GaitThresholds) {
    this.el.className = 'hud-panel';
    this.el.style.setProperty('--player', color);
    this.el.innerHTML = `
      <div class="hud-top"><span class="hud-left"><span class="hud-pos"></span><span class="hud-name"></span></span><span class="hud-stats"></span></div>
      <div class="hud-big"></div>
      <div class="hud-toast"></div>
      <div class="hud-hint"></div>
      <div class="hud-progress"><div class="hud-bar"></div></div>`;
    this.el.querySelector<HTMLElement>('.hud-name')!.textContent = `🐴 ${name}`;
    this.pos = this.el.querySelector('.hud-pos')!;
    this.stats = this.el.querySelector('.hud-stats')!;
    this.big = this.el.querySelector('.hud-big')!;
    this.toast = this.el.querySelector('.hud-toast')!;
    this.hint = this.el.querySelector('.hud-hint')!;
    this.bar = this.el.querySelector('.hud-bar')!;
    this.gauge = new SpeedGauge(thresholds);
    this.el.appendChild(this.gauge.el);
  }

  place(r: Rect): void {
    Object.assign(this.el.style, { left: `${r.x}px`, top: `${r.y}px`, width: `${r.w}px`, height: `${r.h}px` });
  }

  showToast(text: string, now: number): void {
    setText(this.toast, text);
    this.toastUntil = now + TOAST_SECONDS;
    // Restart the CSS animation.
    this.toast.classList.remove('show');
    void this.toast.offsetWidth;
    this.toast.classList.add('show');
  }

  update(s: HudState, now: number): void {
    const showPos = s.riders > 1;
    setText(this.pos, showPos ? `${s.position}.` : '');
    toggle(this.pos, 'hidden', !showPos);
    for (const [cls, p] of [['gold', 1], ['silver', 2], ['bronze', 3]] as const) toggle(this.pos, cls, s.position === p);

    const m = Math.floor(s.time / 60);
    const sec = Math.floor(s.time % 60).toString().padStart(2, '0');
    setText(this.stats, `🥕 ${s.carrots}   ❌ ${s.faults}   ⏱ ${m}:${sec}`);
    this.bar.style.width = `${(s.progress * 100).toFixed(1)}%`;
    this.gauge.update(s.speed, gaitOf(s.speed, this.thresholds), s.slowdown !== null, s.boosting);

    let big = '';
    if (s.finished) big = t('hud.finish');
    else if (s.jumpZone) big = t('hud.jump');
    setText(this.big, big);
    toggle(this.big, 'jump', s.jumpZone && !s.finished);

    const hint = hintFor(s);
    setText(this.hint, hint.text);
    toggle(this.hint, 'warn', hint.warn);

    if (now > this.toastUntil) toggle(this.toast, 'show', false);
  }
}

/** HTML overlays on top of each player's viewport (name, stats, hints, speed gauge, progress). */
export class Hud {
  private panels: PlayerHud[] = [];

  constructor(
    private readonly container: HTMLElement,
    private readonly thresholds: GaitThresholds,
  ) {}

  setup(names: readonly string[], colors: readonly string[]): void {
    this.clear();
    this.panels = names.map((n, i) => new PlayerHud(n, colors[i], this.thresholds));
    for (const p of this.panels) this.container.appendChild(p.el);
  }

  layout(rects: readonly Rect[]): void {
    this.panels.forEach((p, i) => rects[i] && p.place(rects[i]));
  }

  update(states: readonly HudState[], now: number): void {
    this.panels.forEach((p, i) => states[i] && p.update(states[i], now));
  }

  event(e: RaceEvent, now: number): void {
    const text = toastFor(e);
    if (text) this.panels[e.player]?.showToast(text, now);
  }

  clear(): void {
    this.container.replaceChildren();
    this.panels = [];
  }
}
