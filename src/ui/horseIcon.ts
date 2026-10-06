import { shade } from './egoHorse';

export interface HorseCoat {
  coat: string;
  mane: string;
}

/**
 * Small horse head in profile, in the horse's coat and mane colors – so the
 * children can see on every screen which horse is theirs (they look at the
 * horse colors as much as at the saddle cloth). Inline SVG, sized by the
 * surrounding font size.
 */
export function horseIconSvg({ coat, mane }: HorseCoat): string {
  const outline = shade(coat, -0.55);
  const muzzle = shade(coat, -0.2);
  return `<svg class="horse-icon" viewBox="0 0 64 64" aria-hidden="true">
  <path d="M41 4 L37 15 C29 16 21 21 15 29 L6 40 C3 44 5 49 10 50 L18 51 C22 51 25 49 28 46 L33 43 C35 50 37 56 38 62 L60 62 C59 46 57 30 52 18 L50 4 L45 12 Z"
    fill="${coat}" stroke="${outline}" stroke-width="2.5" stroke-linejoin="round"/>
  <path d="M6 40 C3 44 5 49 10 50 L18 51 C21 51 23 50 25 48 C19 46 13 43 8 38 Z" fill="${muzzle}"/>
  <path d="M48 10 C55 20 60 38 61 61 L55 61 C54 43 51 28 45 17 C44 14 46 11 48 10 Z" fill="${mane}"/>
  <path d="M38 14 C34 10 40 6 44 9" fill="none" stroke="${mane}" stroke-width="4" stroke-linecap="round"/>
  <circle cx="30" cy="27" r="3" fill="#1a1008"/>
  <circle cx="31" cy="26" r="1" fill="#fff"/>
  <ellipse cx="11" cy="44" rx="2" ry="1.4" fill="${outline}"/>
</svg>`;
}
