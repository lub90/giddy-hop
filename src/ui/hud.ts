import type { RaceEventType } from '../game/race';
import type { Rect } from '../render/layout';

export interface HudState {
  carrots: number;
  faults: number;
  /** Seconds shown in the timer. */
  time: number;
  /** 0..1 */
  progress: number;
  jumpZone: boolean;
  lostTracking: boolean;
  /** Suggests leaning: -1 = lean left, +1 = lean right, 0 = fine. */
  steerHint: -1 | 0 | 1;
  finished: boolean;
}

const TOASTS: Partial<Record<RaceEventType, string>> = {
  'fence-cleared': 'Super Sprung! ⭐',
  'fence-fault': 'Abwurf! 💥',
  'cone-hit': 'Autsch, Hütchen! 💥',
  carrot: '+1 🥕',
};

const TOAST_SECONDS = 1.2;

/** Cheap DOM updates: only touch the DOM when the text actually changes. */
function setText(el: HTMLElement, text: string): void {
  if (el.textContent !== text) el.textContent = text;
}
function toggle(el: HTMLElement, cls: string, on: boolean): void {
  if (el.classList.contains(cls) !== on) el.classList.toggle(cls, on);
}

class PlayerHud {
  readonly el = document.createElement('div');
  private readonly stats: HTMLElement;
  private readonly big: HTMLElement;
  private readonly toast: HTMLElement;
  private readonly hint: HTMLElement;
  private readonly bar: HTMLElement;
  private toastUntil = 0;

  constructor(name: string, color: string) {
    this.el.className = 'hud-panel';
    this.el.style.setProperty('--player', color);
    this.el.innerHTML = `
      <div class="hud-top"><span class="hud-name"></span><span class="hud-stats"></span></div>
      <div class="hud-big"></div>
      <div class="hud-toast"></div>
      <div class="hud-hint"></div>
      <div class="hud-progress"><div class="hud-bar"></div></div>`;
    this.el.querySelector<HTMLElement>('.hud-name')!.textContent = `🐴 ${name}`;
    this.stats = this.el.querySelector('.hud-stats')!;
    this.big = this.el.querySelector('.hud-big')!;
    this.toast = this.el.querySelector('.hud-toast')!;
    this.hint = this.el.querySelector('.hud-hint')!;
    this.bar = this.el.querySelector('.hud-bar')!;
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
    const m = Math.floor(s.time / 60);
    const sec = Math.floor(s.time % 60).toString().padStart(2, '0');
    setText(this.stats, `🥕 ${s.carrots}   ❌ ${s.faults}   ⏱ ${m}:${sec}`);
    this.bar.style.width = `${(s.progress * 100).toFixed(1)}%`;

    let big = '';
    if (s.finished) big = 'ZIEL! 🏁';
    else if (s.jumpZone) big = 'HOPP!';
    setText(this.big, big);
    toggle(this.big, 'jump', s.jumpZone && !s.finished);

    let hint = '';
    if (s.lostTracking) hint = '👀 Ich sehe dich nicht – stell dich wieder hin!';
    else if (s.steerHint === -1) hint = '⬅️ nach links lehnen';
    else if (s.steerHint === 1) hint = 'nach rechts lehnen ➡️';
    setText(this.hint, hint);
    toggle(this.hint, 'warn', s.lostTracking);

    if (now > this.toastUntil) toggle(this.toast, 'show', false);
  }
}

/** HTML overlays on top of each player's viewport (name, stats, hints, progress). */
export class Hud {
  private panels: PlayerHud[] = [];

  constructor(private readonly container: HTMLElement) {}

  setup(names: readonly string[], colors: readonly string[]): void {
    this.clear();
    this.panels = names.map((n, i) => new PlayerHud(n, colors[i]));
    for (const p of this.panels) this.container.appendChild(p.el);
  }

  layout(rects: readonly Rect[]): void {
    this.panels.forEach((p, i) => rects[i] && p.place(rects[i]));
  }

  update(states: readonly HudState[], now: number): void {
    this.panels.forEach((p, i) => states[i] && p.update(states[i], now));
  }

  event(player: number, type: RaceEventType, now: number): void {
    const text = TOASTS[type];
    if (text) this.panels[player]?.showToast(text, now);
  }

  clear(): void {
    this.container.replaceChildren();
    this.panels = [];
  }
}
