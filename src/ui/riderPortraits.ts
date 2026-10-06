import { t } from '../i18n';
import type { PlayerSlot } from '../pose/playerTracker';
import type { Rect } from '../render/layout';
import { horseIconSvg, type HorseCoat } from './horseIcon';
import { followCrop, portraitCrop, type CropRect } from './portraitCrop';

/** How fast the crop follows the child (per frame). */
const FOLLOW = 0.2;

/**
 * Before the start: every player's quadrant shows the camera picture of the
 * child riding that horse (head and shoulders), so each child knows which
 * screen is theirs. Keyboard riders get their horse instead.
 */
export class RiderPortraits {
  private cards: { el: HTMLElement; canvas: HTMLCanvasElement; crop: CropRect | null }[] = [];

  constructor(
    private readonly container: HTMLElement,
    private readonly video: HTMLVideoElement,
  ) {}

  get visible(): boolean {
    return this.cards.length > 0;
  }

  show(names: readonly string[], colors: readonly string[], coats: readonly HorseCoat[]): void {
    this.hide();
    this.cards = names.map((name, i) => {
      const el = document.createElement('div');
      el.className = 'portrait';
      el.style.setProperty('--player', colors[i]);
      el.innerHTML = `
        <div class="portrait-frame"><canvas></canvas><div class="portrait-horse">${horseIconSvg(coats[i])}</div></div>
        <div class="portrait-name">${t('portrait.thatsYou')} ${horseIconSvg(coats[i])} ${escapeHtml(name)}</div>`;
      this.container.appendChild(el);
      return { el, canvas: el.querySelector('canvas')!, crop: null };
    });
  }

  /**
   * Still picture of every child as currently shown (JPEG data URL), null
   * where there is no camera picture (keyboard riders). Kept in memory only.
   */
  snapshot(): (string | null)[] {
    return this.cards.map((c) => (c.crop && c.canvas.width > 0 ? c.canvas.toDataURL('image/jpeg', 0.85) : null));
  }

  hide(): void {
    for (const c of this.cards) c.el.remove();
    this.cards = [];
  }

  layout(rects: readonly Rect[]): void {
    this.cards.forEach((c, i) => {
      const r = rects[i];
      if (r) Object.assign(c.el.style, { left: `${r.x}px`, top: `${r.y}px`, width: `${r.w}px`, height: `${r.h}px` });
    });
  }

  /** Draws the current camera picture of each player (slots in race order). */
  draw(slots: readonly PlayerSlot[]): void {
    const { video } = this;
    this.cards.forEach((card, i) => {
      const slot = slots[i];
      const { canvas } = card;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (w === 0 || h === 0) return;
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      const target = slot?.pose && video.videoWidth ? portraitCrop(slot.pose, video.videoWidth, video.videoHeight, w / h) : null;
      if (target) card.crop = followCrop(card.crop, target, FOLLOW);
      // Keyboard riders (or nobody seen yet): the horse instead of a picture.
      card.el.classList.toggle('no-picture', !card.crop);
      if (!card.crop) return;

      const ctx = canvas.getContext('2d')!;
      const c = card.crop;
      // The poses are mirrored like a mirror; so is the picture.
      ctx.save();
      ctx.translate(w, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(video, video.videoWidth - c.x - c.w, c.y, c.w, c.h, 0, 0, w, h);
      ctx.restore();
    });
  }
}

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
