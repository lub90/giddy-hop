import type { RaceResult } from '../game/race';
import type { PlayerTracker } from '../pose/playerTracker';

const ROSETTES = ['🥇', '🥈', '🥉', '🎀'];

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

function formatTime(t: number | null): string {
  if (t === null) return '–';
  return `${Math.floor(t / 60)}:${(t % 60).toFixed(1).padStart(4, '0')}`;
}

/** Full-screen overlays: loading, registration, countdown, results. */
export class Screens {
  private current = '';
  private slotsEl: HTMLElement | null = null;
  private countdownEl: HTMLElement | null = null;

  constructor(private readonly root: HTMLElement) {}

  hide(): void {
    this.current = '';
    this.root.className = 'overlay hidden';
    this.root.replaceChildren();
  }

  loading(message: string): void {
    this.show('loading', `<h1>🐴 Giddy Up!</h1><p class="hint">${escapeHtml(message)}</p>`);
  }

  error(title: string, details: string): void {
    this.show('error', `<h1>🐴 Giddy Up!</h1><h2 class="err">${escapeHtml(title)}</h2><p class="hint">${details}</p>`);
  }

  /** Puts the camera preview into the registration screen (if it is showing). */
  mountCamera(canvas: HTMLCanvasElement): void {
    this.root.querySelector('.camera-slot')?.appendChild(canvas);
  }

  /** Registration screen; mount the camera preview afterwards with `mountCamera`. */
  registration(cameraProblem: string | null): void {
    this.show(
      'register',
      `<h1>🐴 Giddy Up! – Das große Reitturnier</h1>
       <p class="hint">Stellt euch nebeneinander vor die Kamera (ca. 2–3 m Abstand).
       Wer mitreiten will: <b>einen Arm hochhalten</b>, bis der Kreis voll ist!</p>
       ${cameraProblem ? `<p class="hint err">${escapeHtml(cameraProblem)}</p>` : '<div class="camera-slot"></div>'}
       <div class="slots"></div>
       <p class="hint small"><b>Leertaste</b> = Los geht's · <b>Rücktaste</b> = alle abmelden ·
       <b>T</b> = Tastatur-Reiter · <b>F</b> = Vollbild</p>`,
    );
    this.slotsEl = this.root.querySelector('.slots');
  }

  updateRegistration(tracker: PlayerTracker, maxPlayers: number, names: readonly string[], colors: readonly string[]): void {
    if (this.current !== 'register' || !this.slotsEl) return;
    const cards: string[] = [];
    for (let i = 0; i < maxPlayers; i++) {
      const slot = tracker.slots[i];
      const state = !slot ? 'frei' : slot.kind === 'keyboard' ? '⌨️ Tastatur' : slot.pose ? '✋ bereit!' : '👀 wo bist du?';
      cards.push(
        `<div class="slot ${slot ? 'on' : ''}" style="--player:${colors[i]}">
           <div class="slot-name">🐴 ${escapeHtml(names[i])}</div><div class="slot-state">${state}</div>
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
    this.root.className = className;
    this.root.innerHTML = html;
  }
}
