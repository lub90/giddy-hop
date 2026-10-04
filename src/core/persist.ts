type Json = Record<string, unknown>;

const isObject = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * Copies values from `source` into `target`, but only for keys that already
 * exist in `target` with the same primitive type. Unknown or mistyped keys
 * (e.g. from an older saved version) are ignored.
 */
export function mergeKnown(target: Json, source: unknown): void {
  if (!isObject(source)) return;
  for (const [key, value] of Object.entries(source)) {
    if (!(key in target)) continue;
    const current = target[key];
    if (isObject(current)) mergeKnown(current, value);
    else if (typeof current === typeof value && !Array.isArray(current)) target[key] = value;
  }
}

/** Loads saved overrides from localStorage into `target`. Never throws. */
export function loadOverrides(storageKey: string, target: Json): void {
  try {
    const raw = localStorage.getItem(storageKey);
    if (raw) mergeKnown(target, JSON.parse(raw));
  } catch {
    // Storage unavailable or corrupt – keep defaults.
  }
}

export function saveOverrides(storageKey: string, value: Json): void {
  try {
    localStorage.setItem(storageKey, JSON.stringify(value));
  } catch {
    // Storage unavailable – tuning only lasts for this session.
  }
}

export function clearOverrides(storageKey: string): void {
  try {
    localStorage.removeItem(storageKey);
  } catch {
    // ignore
  }
}
