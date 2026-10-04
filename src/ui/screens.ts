import type { RaceResult } from '../game/race';
import type { PlayerSlot, PlayerTracker } from '../pose/playerTracker';

const ROSETTES = ['🥇', '🥈', '🥉', '🎀'];

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

function formatTime(t: number | null): string {
  if (t === null) return '–';
  return `${Math.floor(t / 60)}:${(t % 60).toFixed(1).padStart(4, '0')}`;
}

export interface SlotStatus {
  text: string;
  /** CSS state class of the card. */
  state: 'free' | 'registered' | 'ready' | 'missing';
}

/** What a player card in the lobby says (kid-facing, German). */
export function slotStatus(slot: PlayerSlot | undefined): SlotStatus {
  if (!slot) return { text: 'frei', state: 'free' };
  if (slot.ready) return { text: '✅ bereit!', state: 'ready' };
  if (slot.kind === 'keyboard') return { text: '⌨️ Tastatur', state: 'registered' };
  if (!slot.pose) return { text: '👀 wo bist du?', state: 'missing' };
  return { text: '✋ Nochmal Arm heben = bereit', state: 'registered' };
}

/** Full-screen overlays: startup, registration, loading, countdown, "Los!", results. */
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
    this.show('startup', `<h1>🐴 Giddy Hop!</h1><p class="hint">${escapeHtml(message)}</p>`);
  }

  error(title: string, details: string): void {
    this.show('error', `<h1>🐴 Giddy Hop!</h1><h2 class="err">${escapeHtml(title)}</h2><p class="hint">${details}</p>`);
  }

  /** Puts the camera preview into the registration screen (if it is showing). */
  mountCamera(canvas: HTMLCanvasElement): void {
    this.root.querySelector('.camera-slot')?.appendChild(canvas);
  }

  /** Registration screen; mount the camera preview afterwards with `mountCamera`. */
  registration(cameraProblem: string | null): void {
    this.show(
      'register',
      `<h1>🐴 Giddy Hop! – Das große Reitturnier</h1>
       <p class="hint">Stellt euch nebeneinander vor die Kamera (ca. 2–3 m Abstand).<br>
       <span class="nowrap">✋ <b>Einen Arm hochhalten</b> = mitmachen</span> ·
       <span class="nowrap">✋ <b>nochmal</b> = bereit</span> ·
       <span class="nowrap">🙌 <b>beide Arme</b> = zurück</span></p>
       ${cameraProblem ? `<p class="hint err">${escapeHtml(cameraProblem)}</p>` : '<div class="camera-slot"></div>'}
       <div class="slots"></div>
       <p class="hint">Wenn alle bereit sind, geht's los!</p>
       <p class="hint small"><b>Leertaste</b> = alle bereit · <b>Rücktaste</b> = alle abmelden ·
       <b>T</b> = Tastatur-Reiter · <b>F</b> = Vollbild</p>`,
    );
    this.slotsEl = this.root.querySelector('.slots');
  }

  /** "Laden …" while everyone gets into position. */
  loading(): void {
    this.show(
      'loading',
      `<h1>Laden …</h1>
       <div class="loading-bar"><div class="loading-fill"></div></div>
       <div class="slots"></div>
       <p class="hint big">Stellt euch bereit – gleich geht's los!</p>
       <p class="hint">🙌 Beide Arme hoch = abbrechen</p>
       <p class="hint small"><b>Leertaste</b> = sofort starten · <b>Esc</b> = abbrechen</p>`,
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
       <p class="hint big">Wippen = Galopp · Lehnen = Lenken · Hochspringen = Hopp!</p>`,
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

  /** "Los!" at the start of the race. */
  go(): void {
    this.show('go', '<div class="countdown go">Los!</div>', 'overlay translucent');
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
      `<h1>🏆 Siegerehrung</h1>
       <div class="results">${rows}</div>
       <p class="hint">Jedes Pferd bekommt eine Schleife – toll geritten! 🎀</p>
       <p class="hint small"><b>Leertaste</b> = Nochmal reiten · <b>Esc</b> = Neue Anmeldung</p>`,
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
