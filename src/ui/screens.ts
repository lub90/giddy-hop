import { courseStats, type CourseInfo, type CourseOptions } from '../game/courseFormat';
import type { RaceResult } from '../game/race';
import { currentLanguage, LANGUAGE_NAMES, LANGUAGES, localized, t } from '../i18n';
import type { PlayerSlot, PlayerTracker } from '../pose/playerTracker';

const ROSETTES = ['🥇', '🥈', '🥉', '🎀'];

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

function formatTime(time: number | null): string {
  if (time === null) return '–';
  return `${Math.floor(time / 60)}:${(time % 60).toFixed(1).padStart(4, '0')}`;
}

export interface SlotStatus {
  text: string;
  /** CSS state class of the card. */
  state: 'free' | 'registered' | 'ready' | 'missing';
}

/** What a player card in the lobby says. */
export function slotStatus(slot: PlayerSlot | undefined): SlotStatus {
  if (!slot) return { text: t('slot.free'), state: 'free' };
  if (slot.ready) return { text: t('slot.ready'), state: 'ready' };
  if (slot.kind === 'keyboard') return { text: t('slot.keyboard'), state: 'registered' };
  if (!slot.pose) return { text: t('slot.missing'), state: 'missing' };
  return { text: t('slot.registered'), state: 'registered' };
}

/** Description and key facts of a course in the current language. */
export function courseInfoText(course: CourseInfo): string {
  const s = courseStats(course.def);
  const facts = `${Math.round(s.length)} m · ${t('course.jumps', { count: s.jumps })} · ${t('course.curves', { count: s.curves })}`;
  const description = localized(course.description);
  return description ? `${description} (${facts})` : facts;
}

/** Full-screen overlays: startup, registration, loading, countdown, "Go!", results. */
export class Screens {
  private current = '';
  private slotsEl: HTMLElement | null = null;
  private countdownEl: HTMLElement | null = null;
  private progressEl: HTMLElement | null = null;

  constructor(private readonly root: HTMLElement) {}

  get showing(): string {
    return this.current;
  }

  hide(): void {
    this.current = '';
    this.root.className = 'overlay hidden';
    this.root.replaceChildren();
  }

  /** Message while camera and model start up. */
  startup(message: string): void {
    this.show(
      'startup',
      `<h1>🐴 ${t('title')}</h1><p class="subtitle">${t('subtitle')}</p><p class="hint">${escapeHtml(message)}</p>`,
    );
  }

  /** Puts the camera preview into the registration screen (if it is showing). */
  mountCamera(canvas: HTMLCanvasElement): void {
    this.root.querySelector('.camera-slot')?.appendChild(canvas);
  }

  /** Shows the facts of the selected course below the course dropdown. */
  updateCourseInfo(course: CourseInfo): void {
    const el = this.root.querySelector<HTMLElement>('.course-info');
    const select = this.root.querySelector<HTMLSelectElement>('select[data-action="course"]');
    if (select && select.value !== course.id) select.value = course.id;
    if (el) el.textContent = courseInfoText(course);
  }

  /** Registration screen; mount the camera preview afterwards with `mountCamera`. */
  registration(
    cameraProblem: string | null,
    courses: readonly CourseInfo[],
    selected: CourseInfo,
    options: CourseOptions,
  ): void {
    const toggle = (key: keyof CourseOptions) =>
      `<label class="toggle"><input type="checkbox" data-action="${key}"${options[key] ? ' checked' : ''} tabindex="-1"> ${t(`register.${key}`)}</label>`;
    const option = (value: string, label: string, isSelected: boolean) =>
      `<option value="${escapeHtml(value)}"${isSelected ? ' selected' : ''}>${escapeHtml(label)}</option>`;
    const courseOptions = courses.map((c) => option(c.id, localized(c.name), c.id === selected.id)).join('');
    const lang = currentLanguage();
    const languageOptions = LANGUAGES.map((l) => option(l, LANGUAGE_NAMES[l], l === lang)).join('');
    this.show(
      'register',
      `<h1>🐴 ${t('title')}</h1>
       <p class="subtitle">${t('subtitle')}</p>
       <p class="hint">${t('register.position')}<br>
       <span class="nowrap">${t('register.gestureJoin')}</span> ·
       <span class="nowrap">${t('register.gestureReady')}</span> ·
       <span class="nowrap">${t('register.gestureBack')}</span></p>
       ${cameraProblem ? `<p class="hint err">${escapeHtml(cameraProblem)}</p>` : '<div class="camera-slot"></div>'}
       <div class="slots"></div>
       <div class="course-picker">
         <div class="pickers">
           <label>${t('register.course')} <select data-action="course">${courseOptions}</select></label>
           <label>${t('register.language')} <select data-action="language">${languageOptions}</select></label>
           ${toggle('cones')}
           ${toggle('carrots')}
         </div>
         <div class="course-info"></div>
       </div>
       <p class="hint">${t('register.whenReady')}</p>
       <button class="fullscreen-btn" data-action="fullscreen" tabindex="-1">${t('register.fullscreen')}</button>
       <p class="hint small">${t('register.keys')}</p>`,
    );
    this.slotsEl = this.root.querySelector('.slots');
    this.updateCourseInfo(selected);
  }

  /** "Loading …" while everyone gets into position. */
  loading(): void {
    this.show(
      'loading',
      `<h1>${t('loading.title')}</h1>
       <div class="loading-bar"><div class="loading-fill"></div></div>
       <div class="slots"></div>
       <p class="hint big">${t('loading.getReady')}</p>
       <p class="hint">${t('loading.cancel')}</p>
       <p class="hint small">${t('loading.keys')}</p>`,
    );
    this.slotsEl = this.root.querySelector('.slots');
    this.progressEl = this.root.querySelector('.loading-fill');
  }

  updateLoading(progress: number): void {
    if (this.progressEl) this.progressEl.style.width = `${(progress * 100).toFixed(1)}%`;
  }

  /** Player cards (registration and loading screen), one per player number. */
  updateSlots(tracker: PlayerTracker, maxPlayers: number, names: readonly string[], colors: readonly string[]): void {
    if (!this.slotsEl) return;
    const cards: string[] = [];
    for (let n = 0; n < maxPlayers; n++) {
      const slot = tracker.slots.find((s) => s.number === n);
      const status = slotStatus(slot);
      cards.push(
        `<div class="slot ${status.state}" style="--player:${colors[n]}">
           <div class="slot-name">${n + 1}. 🐴 ${escapeHtml(names[n])}</div><div class="slot-state">${status.text}</div>
         </div>`,
      );
    }
    const html = cards.join('');
    if (this.slotsEl.dataset.html !== html) {
      this.slotsEl.dataset.html = html;
      this.slotsEl.innerHTML = html;
    }
  }

  countdown(): void {
    this.show(
      'countdown',
      `<div class="countdown"></div>
       <p class="hint big">${t('countdown.controls')}</p>`,
      'overlay translucent',
    );
    this.countdownEl = this.root.querySelector('.countdown');
  }

  updateCountdown(value: number): void {
    if (this.countdownEl) {
      const text = String(value);
      if (this.countdownEl.textContent !== text) this.countdownEl.textContent = text;
    }
  }

  /** "Go!" at the start of the race. */
  go(): void {
    this.show('go', `<div class="countdown go">${t('countdown.go')}</div>`, 'overlay translucent');
  }

  results(results: readonly RaceResult[], names: readonly string[], colors: readonly string[]): void {
    const rows = [...results]
      .sort((a, b) => a.rank - b.rank)
      .map(
        (r) => `<div class="result" style="--player:${colors[r.player]}">
          <span class="rosette">${ROSETTES[Math.min(r.rank - 1, ROSETTES.length - 1)]}</span>
          <span class="result-name">${r.rank}. ${escapeHtml(names[r.player])}</span>
          <span>⏱ ${formatTime(r.time)}</span><span>🥕 ${r.carrots}</span><span>❌ ${r.faults}</span>
        </div>`,
      )
      .join('');
    this.show(
      'results',
      `<h1>${t('results.title')}</h1>
       <div class="results">${rows}</div>
       <p class="hint">${t('results.ribbon')}</p>
       <p class="hint small">${t('results.keys')}</p>`,
    );
  }

  private show(name: string, html: string, className = 'overlay'): void {
    this.current = name;
    this.slotsEl = null;
    this.countdownEl = null;
    this.progressEl = null;
    this.root.className = className;
    this.root.innerHTML = html;
  }
}
