import type { PlayerInput } from './playerInput';

export interface KeyBinding {
  gallop: string;
  left: string;
  right: string;
  jump: string;
}

/** Keyboard fallback for testing without a camera (KeyboardEvent.code). */
export const KEY_BINDINGS: readonly KeyBinding[] = [
  { gallop: 'KeyW', left: 'KeyA', right: 'KeyD', jump: 'KeyS' },
  { gallop: 'KeyI', left: 'KeyJ', right: 'KeyL', jump: 'KeyK' },
  { gallop: 'ArrowUp', left: 'ArrowLeft', right: 'ArrowRight', jump: 'ArrowDown' },
  { gallop: 'Numpad8', left: 'Numpad4', right: 'Numpad6', jump: 'Numpad5' },
];

/**
 * Holds the key state. Testable without the DOM: `attach` wires
 * `press`/`release` to real keyboard events.
 */
export class KeyboardInput {
  private readonly down = new Set<string>();
  private readonly jumpQueued = new Set<number>();

  constructor(private readonly bindings: readonly KeyBinding[] = KEY_BINDINGS) {}

  attach(target: Window): () => void {
    const onDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.altKey || e.metaKey) return;
      if (this.isBound(e.code)) e.preventDefault();
      if (!e.repeat) this.press(e.code);
    };
    const onUp = (e: KeyboardEvent) => this.release(e.code);
    const onBlur = () => this.down.clear();
    target.addEventListener('keydown', onDown);
    target.addEventListener('keyup', onUp);
    target.addEventListener('blur', onBlur);
    return () => {
      target.removeEventListener('keydown', onDown);
      target.removeEventListener('keyup', onUp);
      target.removeEventListener('blur', onBlur);
    };
  }

  press(code: string): void {
    this.down.add(code);
    this.bindings.forEach((b, i) => {
      if (b.jump === code) this.jumpQueued.add(i);
    });
  }

  release(code: string): void {
    this.down.delete(code);
  }

  /** Input for player `index`, or null when none of their keys is in use. */
  read(index: number): PlayerInput | null {
    const b = this.bindings[index];
    if (!b) return null;
    const jump = this.jumpQueued.delete(index);
    const gallop = this.down.has(b.gallop);
    const steer = (this.down.has(b.right) ? 1 : 0) - (this.down.has(b.left) ? 1 : 0);
    if (!gallop && steer === 0 && !jump) return null;
    return { drive: gallop ? 1 : 0, steer, jump };
  }

  private isBound(code: string): boolean {
    return this.bindings.some((b) => b.gallop === code || b.left === code || b.right === code || b.jump === code);
  }
}
