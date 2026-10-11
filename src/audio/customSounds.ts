import { localSamples, SAMPLE_KINDS, type SampleKind } from './localSamples';
import {
  checkSoundFile,
  MAX_FILES_PER_SLOT,
  MAX_PACKAGE_BYTES,
  mimeTypeOf,
  readSoundPackage,
  soundSource,
  type FileProblem,
  type SoundSource,
} from './soundFiles';
import { SoundStore, type StoredSound } from './soundStore';

/** The part of Sounds this needs (keeps the class testable without Web Audio). */
export interface SampleSink {
  setSampleUrls(slot: SampleKind, urls: readonly string[]): void;
}

/** Checks that the browser can actually play the data; resolves false otherwise. */
export type Decoder = (data: ArrayBuffer) => Promise<boolean>;

export interface UploadReport {
  /** Accepted file names per slot. */
  accepted: { name: string; slot: SampleKind }[];
  rejected: { name: string; problem: FileProblem }[];
  /** Files in a package that belong to no slot. */
  ignored: string[];
  /** The package itself is unusable (no zip, too large). */
  packageProblem?: 'notZip' | 'size';
}

export interface SlotStatus {
  source: SoundSource;
  /** Number of uploaded files (source "upload") or asset files (source "assets"). */
  count: number;
}

/**
 * Own sounds per slot, in this order:
 *   1. files uploaded in the game (IndexedDB, stay on this device),
 *   2. files in the local-assets/ folder (bundled at build time),
 *   3. the synthesized sound.
 */
export class CustomSounds {
  private uploaded: Record<SampleKind, StoredSound[]> = { whinny: [], snort: [], hoof: [] };
  private objectUrls: Record<SampleKind, string[]> = { whinny: [], snort: [], hoof: [] };

  constructor(
    private readonly sink: SampleSink,
    private readonly store: SoundStore = new SoundStore(),
    private readonly assets: Record<SampleKind, readonly string[]> = localSamples(),
    private readonly decode: Decoder = browserDecoder,
  ) {}

  /** Loads the stored uploads (call once at start; without IndexedDB the uploads are just empty). */
  async init(): Promise<void> {
    try {
      for (const file of await this.store.all()) this.uploaded[file.slot]?.push(file);
    } catch (err) {
      console.warn('Own sounds could not be loaded', err);
    }
    for (const slot of SAMPLE_KINDS) this.apply(slot);
  }

  status(slot: SampleKind): SlotStatus {
    const source = soundSource(this.uploaded[slot].length, this.assets[slot].length);
    return { source, count: source === 'upload' ? this.uploaded[slot].length : source === 'assets' ? this.assets[slot].length : 0 };
  }

  /** Files chosen for one slot: replace that slot's uploads with the valid ones. */
  async addFiles(slot: SampleKind, files: readonly File[]): Promise<UploadReport> {
    const report: UploadReport = { accepted: [], rejected: [], ignored: [] };
    const valid: Omit<StoredSound, 'slot'>[] = [];
    for (const file of files) {
      const problem = checkSoundFile(file.name, file.size) ?? (valid.length >= MAX_FILES_PER_SLOT ? 'tooMany' : null);
      if (problem) {
        report.rejected.push({ name: file.name, problem });
        continue;
      }
      const data = await file.arrayBuffer();
      if (!(await this.decode(data))) report.rejected.push({ name: file.name, problem: 'decode' });
      else valid.push({ name: file.name, data });
    }
    if (valid.length > 0) {
      await this.save(slot, valid);
      report.accepted.push(...valid.map((v) => ({ name: v.name, slot })));
    }
    return report;
  }

  /** A .zip sound package: fills every slot that has files in it. */
  async addPackage(file: File): Promise<UploadReport> {
    const report: UploadReport = { accepted: [], rejected: [], ignored: [] };
    if (file.size > MAX_PACKAGE_BYTES) return { ...report, packageProblem: 'size' };
    let content;
    try {
      content = readSoundPackage(new Uint8Array(await file.arrayBuffer()));
    } catch {
      return { ...report, packageProblem: 'notZip' };
    }
    report.rejected.push(...content.rejected);
    report.ignored.push(...content.ignored);
    const bySlot = new Map<SampleKind, Omit<StoredSound, 'slot'>[]>();
    for (const entry of content.entries) {
      // Own copy of the bytes: the decoder may take over (detach) the buffer it gets.
      const data = entry.data.slice().buffer;
      if (!(await this.decode(data.slice(0)))) {
        report.rejected.push({ name: entry.name, problem: 'decode' });
        continue;
      }
      if (!bySlot.has(entry.slot)) bySlot.set(entry.slot, []);
      bySlot.get(entry.slot)!.push({ name: entry.name, data });
    }
    for (const [slot, files] of bySlot) {
      await this.save(slot, files);
      report.accepted.push(...files.map((f) => ({ name: f.name, slot })));
    }
    return report;
  }

  /** Back to the asset folder or the synthesized sound for one slot. */
  async reset(slot: SampleKind): Promise<void> {
    await this.store.clearSlot(slot);
    this.uploaded[slot] = [];
    this.apply(slot);
  }

  async resetAll(): Promise<void> {
    await this.store.clearAll();
    for (const slot of SAMPLE_KINDS) {
      this.uploaded[slot] = [];
      this.apply(slot);
    }
  }

  private async save(slot: SampleKind, files: Omit<StoredSound, 'slot'>[]): Promise<void> {
    await this.store.replaceSlot(slot, files);
    this.uploaded[slot] = files.map((f) => ({ ...f, slot }));
    this.apply(slot);
  }

  /** Hands the slot's current sounds to the player (uploads, else assets, else none = synthesis). */
  private apply(slot: SampleKind): void {
    for (const url of this.objectUrls[slot]) URL.revokeObjectURL(url);
    this.objectUrls[slot] = this.uploaded[slot].map((f) => URL.createObjectURL(new Blob([f.data], { type: mimeTypeOf(f.name) })));
    this.sink.setSampleUrls(slot, this.objectUrls[slot].length > 0 ? this.objectUrls[slot] : this.assets[slot]);
  }
}

/** Decodes with a throw-away offline audio context (works without a user gesture). */
export const browserDecoder: Decoder = async (data) => {
  try {
    await new OfflineAudioContext(1, 1, 22050).decodeAudioData(data.slice(0));
    return true;
  } catch {
    return false;
  }
};
