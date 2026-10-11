import { unzipSync } from 'fflate';
import { SAMPLE_KINDS, type SampleKind } from './localSamples';

/**
 * Rules for own sound files uploaded in the game (single files or a .zip
 * "sound package"). Same naming convention as the local-assets/ folder: the
 * start of the file name decides the sound slot (whinny…, snort…, hoof…).
 */

export const UPLOAD_EXTENSIONS = ['mp3', 'ogg', 'wav'] as const;
/** A single sound file; real recordings of one whinny or hoofbeat are far smaller. */
export const MAX_FILE_BYTES = 5 * 1024 * 1024;
/** A whole sound package. */
export const MAX_PACKAGE_BYTES = 60 * 1024 * 1024;
/** More variety than this per slot makes no difference. */
export const MAX_FILES_PER_SLOT = 20;

/** Why a file was not taken. */
export type FileProblem = 'format' | 'size' | 'empty' | 'decode' | 'tooMany' | 'noSlot';

/** Where a sound slot currently gets its sound from (in this order). */
export type SoundSource = 'upload' | 'assets' | 'synth';

export function soundSource(uploaded: number, assets: number): SoundSource {
  return uploaded > 0 ? 'upload' : assets > 0 ? 'assets' : 'synth';
}

/** File name without folders (zip entries contain paths). */
export function baseName(path: string): string {
  return path.split(/[\\/]/).pop() ?? path;
}

export function extensionOf(name: string): string {
  const base = baseName(name);
  const dot = base.lastIndexOf('.');
  return dot < 0 ? '' : base.slice(dot + 1).toLowerCase();
}

/** Sound slot by the start of the file name (case-insensitive), or null. */
export function slotOfFileName(name: string): SampleKind | null {
  const base = baseName(name).toLowerCase();
  return SAMPLE_KINDS.find((kind) => base.startsWith(kind)) ?? null;
}

/** Format and size check (the content is checked by decoding it). */
export function checkSoundFile(name: string, size: number): FileProblem | null {
  if (!(UPLOAD_EXTENSIONS as readonly string[]).includes(extensionOf(name))) return 'format';
  if (size === 0) return 'empty';
  if (size > MAX_FILE_BYTES) return 'size';
  return null;
}

export interface PackageEntry {
  name: string;
  slot: SampleKind;
  data: Uint8Array;
}

export interface PackageContent {
  /** Files that match a slot and pass the format and size checks. */
  entries: PackageEntry[];
  /** Files that belong to a slot by name but cannot be used. */
  rejected: { name: string; problem: FileProblem }[];
  /** Other files (readme, pictures, …) – silently skipped. */
  ignored: string[];
}

/** Hidden files of the packing program (macOS, Windows). */
const isJunk = (path: string) => /(^|\/)__MACOSX\//.test(path) || baseName(path).startsWith('.') || /thumbs\.db$/i.test(path);

/**
 * Reads a .zip sound package (folders inside are fine). Throws when the data
 * is not a zip file.
 */
export function readSoundPackage(zip: Uint8Array): PackageContent {
  const files = unzipSync(zip, { filter: (f) => !f.name.endsWith('/') && !isJunk(f.name) });
  const content: PackageContent = { entries: [], rejected: [], ignored: [] };
  const perSlot = new Map<SampleKind, number>();
  for (const path of Object.keys(files).sort((a, b) => a.localeCompare(b))) {
    const name = baseName(path);
    const slot = slotOfFileName(name);
    if (!slot) {
      content.ignored.push(name);
      continue;
    }
    const problem = checkSoundFile(name, files[path].length);
    const count = perSlot.get(slot) ?? 0;
    if (problem) content.rejected.push({ name, problem });
    else if (count >= MAX_FILES_PER_SLOT) content.rejected.push({ name, problem: 'tooMany' });
    else {
      perSlot.set(slot, count + 1);
      content.entries.push({ name, slot, data: files[path] });
    }
  }
  return content;
}

/** MIME type for an accepted file name (for playing it back from storage). */
export function mimeTypeOf(name: string): string {
  return { mp3: 'audio/mpeg', ogg: 'audio/ogg', wav: 'audio/wav' }[extensionOf(name)] ?? 'application/octet-stream';
}
