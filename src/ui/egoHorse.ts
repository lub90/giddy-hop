/**
 * Drawn horse for the rider's own view: neck, mane, head with ears and bridle,
 * reins and the saddle pad – seen from the saddle. Pure HTML/SVG over the 3D
 * view, so it costs no 3D rendering and looks nicer than the box model.
 */

/** Mixes a hex color towards white (amount > 0) or black (amount < 0). */
export function shade(hex: string, amount: number): string {
  const n = parseInt(hex.replace('#', ''), 16);
  const channel = (shift: number) => {
    const c = (n >> shift) & 255;
    const target = amount > 0 ? 255 : 0;
    return Math.round(c + (target - c) * Math.abs(amount));
  };
  return `#${[16, 8, 0].map((s) => channel(s).toString(16).padStart(2, '0')).join('')}`;
}

let nextId = 0;

/** SVG markup of the horse seen from the saddle, in the given colors. */
export function egoHorseSvg(coat: string, mane: string, cloth: string): string {
  const id = `ego${nextId++}`;
  const light = shade(coat, 0.22);
  const dark = shade(coat, -0.35);
  const maneLight = shade(mane, 0.25);
  const leather = '#5a3518';
  return `
<svg viewBox="0 0 400 300" preserveAspectRatio="xMidYMax meet" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <defs>
    <linearGradient id="${id}-neck" x1="0" x2="1" y1="0" y2="0">
      <stop offset="0" stop-color="${dark}"/>
      <stop offset="0.35" stop-color="${coat}"/>
      <stop offset="0.5" stop-color="${light}"/>
      <stop offset="0.65" stop-color="${coat}"/>
      <stop offset="1" stop-color="${dark}"/>
    </linearGradient>
    <radialGradient id="${id}-head" cx="0.5" cy="0.6" r="0.6">
      <stop offset="0" stop-color="${light}"/>
      <stop offset="1" stop-color="${dark}"/>
    </radialGradient>
    <linearGradient id="${id}-shadow" x1="0" x2="0" y1="0" y2="1">
      <stop offset="0" stop-color="#000" stop-opacity="0.25"/>
      <stop offset="1" stop-color="#000" stop-opacity="0"/>
    </linearGradient>
  </defs>

  <!-- ears (behind the head) -->
  <path d="M160 96 C148 62 156 30 170 16 C182 34 188 64 184 96 Z" fill="${coat}" stroke="${dark}" stroke-width="2"/>
  <path d="M166 88 C160 64 164 42 171 32 C177 46 180 66 178 88 Z" fill="${dark}" opacity="0.7"/>
  <path d="M240 96 C252 62 244 30 230 16 C218 34 212 64 216 96 Z" fill="${coat}" stroke="${dark}" stroke-width="2"/>
  <path d="M234 88 C240 64 236 42 229 32 C223 46 220 66 222 88 Z" fill="${dark}" opacity="0.7"/>

  <!-- head, seen from above/behind (the face points away from the rider) -->
  <path d="M150 136 C136 104 156 64 200 60 C244 64 264 104 250 136 Z" fill="url(#${id}-head)"/>

  <!-- bridle: crownpiece behind the ears and browband -->
  <path d="M152 106 C175 94 225 94 248 106" fill="none" stroke="${leather}" stroke-width="7" stroke-linecap="round"/>
  <path d="M158 118 C180 130 220 130 242 118" fill="none" stroke="${leather}" stroke-width="5" stroke-linecap="round"/>
  <circle cx="158" cy="118" r="4" fill="#c9b37a"/>
  <circle cx="242" cy="118" r="4" fill="#c9b37a"/>

  <!-- forelock: a tuft of hair falling between the ears onto the forehead -->
  <path d="M186 92 C190 80 210 80 214 92 C216 104 210 118 201 128 C192 118 184 104 186 92 Z" fill="${mane}"/>
  <path d="M196 90 C196 102 198 112 200 122 M205 90 C206 100 205 110 203 120" fill="none" stroke="${maneLight}" stroke-width="2" stroke-linecap="round" opacity="0.6"/>

  <!-- neck, widening towards the rider -->
  <path d="M66 300 C92 232 128 170 150 130 L250 130 C272 170 308 232 334 300 Z" fill="url(#${id}-neck)"/>
  <path d="M150 130 L250 130 C252 150 148 150 150 130 Z" fill="url(#${id}-shadow)"/>

  <!-- mane along the top of the neck, falling slightly to the right -->
  <path d="M186 130 C180 172 172 232 164 300 L244 300 C240 248 228 178 214 130 Z" fill="${mane}"/>
  <path d="M196 136 C192 180 186 240 182 300 M206 136 C206 182 206 240 210 300 M214 140 C220 186 226 244 232 300"
        fill="none" stroke="${maneLight}" stroke-width="3" stroke-linecap="round" opacity="0.6"/>
  <path d="M244 300 C252 270 250 240 238 210 C252 236 262 268 258 300 Z" fill="${mane}" opacity="0.85"/>

  <!-- reins from the bit to the rider's hands -->
  <path d="M152 132 C142 200 126 258 116 300" fill="none" stroke="${leather}" stroke-width="6" stroke-linecap="round"/>
  <path d="M248 132 C260 200 276 258 286 300" fill="none" stroke="${leather}" stroke-width="6" stroke-linecap="round"/>

  <!-- front edge of the saddle pad in the player's color -->
  <path d="M24 300 Q200 262 376 300 Z" fill="${cloth}"/>
  <path d="M60 300 Q200 276 340 300" fill="none" stroke="#fff" stroke-width="3" opacity="0.7"/>
</svg>`;
}

/** Overlay element for one rider view; animated with `update`. */
export class EgoHorse {
  readonly el = document.createElement('div');

  constructor(coat: string, mane: string, cloth: string) {
    this.el.className = 'ego-horse';
    this.el.innerHTML = egoHorseSvg(coat, mane, cloth);
  }

  /**
   * @param bob vertical bounce of the horse's body (0 … ~0.12 m)
   * @param tiltDeg sideways lean when steering (degrees)
   * @param panelHeight height of the viewport in px (to scale the bounce)
   */
  update(visible: boolean, bob: number, tiltDeg: number, panelHeight: number): void {
    if (this.el.hidden !== !visible) this.el.hidden = !visible;
    if (!visible) return;
    const y = (bob / 0.12) * panelHeight * 0.025;
    this.el.style.transform = `translateX(-50%) translateY(${y.toFixed(1)}px) rotate(${tiltDeg.toFixed(2)}deg)`;
  }
}
