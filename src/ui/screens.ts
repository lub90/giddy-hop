import { courseStats, type CourseInfo, type CourseOptions } from '../game/courseFormat';
import type { RaceResult } from '../game/race';
import { currentLanguage, LANGUAGE_NAMES, LANGUAGES, localized, t } from '../i18n';
import type { CameraInfo } from '../pose/camera';
import { horseIconSvg, type HorseCoat } from './horseIcon';
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

/**
 * Order of the places on the podium from left to right: 2nd, 1st, 3rd, then 4th
 * (as on a real winners' podium). Places that do not exist are left out.
 */
export function podiumOrder<T extends { rank: number }>(results: readonly T[]): T[] {
  const byRank = new Map(results.map((r) => [r.rank, r]));
  return [2, 1, 3, 4].map((rank) => byRank.get(rank)).filter((r): r is T => r !== undefined);
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
    cameras: readonly CameraInfo[] = [],
    selectedCamera: string | null = null,
  ): void {
    const toggle = (key: keyof CourseOptions) =>
      `<label class="toggle"><input type="checkbox" data-action="${key}"${options[key] ? ' checked' : ''} tabindex="-1"> ${t(`register.${key}`)}</label>`;
    const option = (value: string, label: string, isSelected: boolean) =>
      `<option value="${escapeHtml(value)}"${isSelected ? ' selected' : ''}>${escapeHtml(label)}</option>`;
    const courseOptions = courses
      .filter((c) => !c.hidden || c.id === selected.id)
      .map((c) => option(c.id, localized(c.name), c.id === selected.id))
      .join('');
    const lang = currentLanguage();
    const languageOptions = LANGUAGES.map((l) => option(l, LANGUAGE_NAMES[l], l === lang)).join('');
    const field = (label: string, control: string) => `<label class="field"><span>${label}</span>${control}</label>`;
    // Only offer a choice when there is one to make.
    const cameraPicker =
      cameras.length > 1
        ? field(
            t('register.camera'),
            `<select data-action="camera">${cameras.map((c) => option(c.id, c.label, c.id === selectedCamera)).join('')}</select>`,
          )
        : '';
    // Left: who plays (camera, gestures, player cards). Right: settings for the race.
    this.show(
      'register',
      `<header class="reg-header">
         <h1>🐴 ${t('title')}</h1>
         <p class="subtitle">${t('subtitle')}</p>
       </header>
       <div class="reg-main">
         <section class="reg-players">
           <p class="hint">${t('register.position')}</p>
           ${cameraProblem ? `<p class="hint err">${escapeHtml(cameraProblem)}</p>` : '<div class="camera-slot"></div>'}
           <ul class="gestures">
             <li>${t('register.gestureJoin')}</li>
             <li>${t('register.gestureReady')}</li>
             <li>${t('register.gestureBack')}</li>
           </ul>
           <div class="slots"></div>
           <p class="hint">${t('register.whenReady')}</p>
         </section>
         <aside class="reg-settings">
           <div class="course-picker">
             ${field(t('register.course'), `<select data-action="course">${courseOptions}</select>`)}
             <div class="course-info"></div>
             <div class="toggles">${toggle('cones')}${toggle('carrots')}</div>
           </div>
           <div class="settings-group">
             ${field(t('register.language'), `<select data-action="language">${languageOptions}</select>`)}
             ${cameraPicker}
           </div>
           <button class="fullscreen-btn" data-action="fullscreen" tabindex="-1">${t('register.fullscreen')}</button>
         </aside>
       </div>
       <p class="hint small reg-keys">${t('register.keys')}</p>`,
      'overlay register-screen',
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

  /** Fills the bar of the loading screen, or of the award ceremony (time left). */
  updateProgress(progress: number): void {
    if (this.progressEl) this.progressEl.style.width = `${(progress * 100).toFixed(1)}%`;
  }

  /** Player cards (registration and loading screen), one per player number. */
  updateSlots(
    tracker: PlayerTracker,
    maxPlayers: number,
    names: readonly string[],
    colors: readonly string[],
    coats: readonly HorseCoat[],
  ): void {
    if (!this.slotsEl) return;
    const cards: string[] = [];
    for (let n = 0; n < maxPlayers; n++) {
      const slot = tracker.slots.find((s) => s.number === n);
      const status = slotStatus(slot);
      cards.push(
        `<div class="slot ${status.state}" style="--player:${colors[n]}">
           <div class="slot-name">${n + 1}. ${horseIconSvg(coats[n])} ${escapeHtml(names[n])}</div><div class="slot-state">${status.text}</div>
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
       <p class="hint big">${t('countdown.controls')}</p>
       <p class="hint small">${t('countdown.keys')}</p>`,
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

  /** Race on hold (Space). */
  pause(): void {
    this.show(
      'pause',
      `<h1>${t('pause.title')}</h1>
       <p class="hint big">${t('pause.resume')}</p>
       <p class="hint">${t('pause.keys')}</p>`,
      'overlay pause-screen',
    );
  }

  /** "Go!" at the start of the race. */
  go(): void {
    this.show('go', `<div class="countdown go">${t('countdown.go')}</div>`, 'overlay translucent');
  }

  /**
   * Award ceremony: podium with the horse names on top, the table with time,
   * knock-downs and carrots below. The background stays see-through so the
   * celebrating horses remain visible.
   */
  results(
    results: readonly RaceResult[],
    names: readonly string[],
    colors: readonly string[],
    coats: readonly HorseCoat[],
  ): void {
    const rosette = (rank: number) => ROSETTES[Math.min(rank - 1, ROSETTES.length - 1)];
    const podium = podiumOrder(results)
      .map(
        (r) => `<div class="podium-place rank-${r.rank}">
          <div class="podium-name" style="--player:${colors[r.player]}">${horseIconSvg(coats[r.player])} ${escapeHtml(names[r.player])}</div>
          <div class="podium-step"><span class="rosette">${rosette(r.rank)}</span><span class="podium-rank">${r.rank}</span></div>
        </div>`,
      )
      .join('');
    const rows = [...results]
      .sort((a, b) => a.rank - b.rank)
      .map(
        (r) => `<tr style="--player:${colors[r.player]}">
          <td>${rosette(r.rank)} ${r.rank}.</td><td class="result-name">${horseIconSvg(coats[r.player])} ${escapeHtml(names[r.player])}</td>
          <td>⏱ ${formatTime(r.time)}</td><td>❌ ${r.faults}</td><td>🥕 ${r.carrots}</td>
        </tr>`,
      )
      .join('');
    this.show(
      'results',
      `<h1>${t('results.title')}</h1>
       <div class="podium">${podium}</div>
       <table class="results-table">
         <thead><tr><th>${t('results.place')}</th><th>${t('results.horse')}</th><th>${t('results.time')}</th>
         <th>${t('results.faults')}</th><th>${t('results.carrots')}</th></tr></thead>
         <tbody>${rows}</tbody>
       </table>
       <p class="hint">${t('results.ribbon')}</p>
       <div class="loading-bar results-timer"><div class="loading-fill"></div></div>
       <p class="hint small">${t('results.backSoon')}</p>`,
      'overlay results-screen',
    );
    this.progressEl = this.root.querySelector('.loading-fill');
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
