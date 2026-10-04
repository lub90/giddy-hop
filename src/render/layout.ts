/** Screen rectangle in CSS pixels, origin top left. */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface SplitLayout {
  /** One viewport per player, in player order. */
  players: Rect[];
  /** Unused quadrant (3 players in a 2×2 grid) – used for the overview camera. */
  spare: Rect | null;
}

/**
 * Splits the screen for 1–4 players:
 *   1 → full screen, 2 → side by side, 3–4 → 2×2 grid (player 1 top left).
 * `gap` is the separator width between viewports.
 */
export function splitLayout(count: number, width: number, height: number, gap = 4): SplitLayout {
  if (count <= 1) return { players: [{ x: 0, y: 0, w: width, h: height }], spare: null };

  if (count === 2) {
    const w = (width - gap) / 2;
    return {
      players: [
        { x: 0, y: 0, w, h: height },
        { x: w + gap, y: 0, w, h: height },
      ],
      spare: null,
    };
  }

  const w = (width - gap) / 2;
  const h = (height - gap) / 2;
  const grid: Rect[] = [
    { x: 0, y: 0, w, h },
    { x: w + gap, y: 0, w, h },
    { x: 0, y: h + gap, w, h },
    { x: w + gap, y: h + gap, w, h },
  ];
  return { players: grid.slice(0, count), spare: count === 3 ? grid[3] : null };
}
