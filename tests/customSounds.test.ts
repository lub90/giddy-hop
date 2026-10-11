import { IDBFactory } from 'fake-indexeddb';
import { zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { CustomSounds, type Decoder } from '../src/audio/customSounds';
import type { SampleKind } from '../src/audio/localSamples';
import {
  checkSoundFile,
  MAX_FILE_BYTES,
  MAX_FILES_PER_SLOT,
  readSoundPackage,
  slotOfFileName,
  soundSource,
} from '../src/audio/soundFiles';
import { SoundStore } from '../src/audio/soundStore';

const bytes = (n: number, fill = 1) => new Uint8Array(n).fill(fill);
/** Pretend audio: decodes unless the content starts with 0 ("broken file"). */
const fakeDecoder: Decoder = async (data) => new Uint8Array(data)[0] !== 0;
const file = (name: string, size = 100, fill = 1) => new File([bytes(size, fill)], name);

describe('Own sounds – file rules', () => {
  it('the start of the file name decides the slot, like in local-assets/', () => {
    expect(slotOfFileName('whinny-happy.mp3')).toBe('whinny');
    expect(slotOfFileName('Snort.WAV')).toBe('snort');
    expect(slotOfFileName('sounds/hoof_01.ogg')).toBe('hoof');
    expect(slotOfFileName('neigh.mp3')).toBeNull();
  });

  it('accepts mp3, ogg and wav up to the size limit, with clear reasons otherwise', () => {
    expect(checkSoundFile('whinny.mp3', 1000)).toBeNull();
    expect(checkSoundFile('whinny.OGG', 1000)).toBeNull();
    expect(checkSoundFile('whinny.wav', 1000)).toBeNull();
    expect(checkSoundFile('whinny.m4a', 1000)).toBe('format');
    expect(checkSoundFile('whinny.txt', 1000)).toBe('format');
    expect(checkSoundFile('whinny.wav', 0)).toBe('empty');
    expect(checkSoundFile('whinny.wav', MAX_FILE_BYTES + 1)).toBe('size');
  });

  it('order per sound: uploads, then the asset folder, then the synthesized sound', () => {
    expect(soundSource(2, 5)).toBe('upload');
    expect(soundSource(0, 5)).toBe('assets');
    expect(soundSource(0, 0)).toBe('synth');
  });

  it('reads a sound package: files by slot (also in folders), others ignored, bad ones rejected', () => {
    const zip = zipSync({
      'whinny-1.wav': bytes(10),
      'pack/hoof-a.mp3': bytes(10),
      'pack/HOOF-b.ogg': bytes(10),
      'snort.flac': bytes(10),
      'readme.txt': bytes(10),
      '__MACOSX/._whinny-1.wav': bytes(10),
      'folder/': new Uint8Array(0),
    });
    const content = readSoundPackage(zip);
    expect(content.entries.map((e) => [e.slot, e.name])).toEqual([
      ['hoof', 'hoof-a.mp3'],
      ['hoof', 'HOOF-b.ogg'],
      ['whinny', 'whinny-1.wav'],
    ]);
    expect(content.rejected).toEqual([{ name: 'snort.flac', problem: 'format' }]);
    expect(content.ignored).toEqual(['readme.txt']);
  });

  it('a package with too many files for one slot keeps the first ones', () => {
    const files: Record<string, Uint8Array> = {};
    for (let i = 0; i < MAX_FILES_PER_SLOT + 3; i++) files[`hoof-${String(i).padStart(2, '0')}.wav`] = bytes(10);
    const content = readSoundPackage(zipSync(files));
    expect(content.entries).toHaveLength(MAX_FILES_PER_SLOT);
    expect(content.rejected.every((r) => r.problem === 'tooMany')).toBe(true);
  });

  it('something that is not a zip file is refused', () => {
    expect(() => readSoundPackage(bytes(100))).toThrow();
  });
});

/** Records which URLs the game would play per slot. */
class FakeSink {
  urls: Record<SampleKind, readonly string[]> = { whinny: [], snort: [], hoof: [] };
  setSampleUrls(slot: SampleKind, urls: readonly string[]) {
    this.urls[slot] = urls;
  }
}

const ASSETS: Record<SampleKind, string[]> = { whinny: ['assets/whinny-01.wav'], snort: [], hoof: [] };

async function setup(idb = new IDBFactory()) {
  const sink = new FakeSink();
  const sounds = new CustomSounds(sink, new SoundStore(() => idb), ASSETS, fakeDecoder);
  await sounds.init();
  return { sink, sounds, idb };
}

describe('Own sounds – upload, storage and reset', () => {
  it('without uploads: asset folder where there are files, otherwise the synthesized sound', async () => {
    const { sink, sounds } = await setup();
    expect(sink.urls.whinny).toEqual(ASSETS.whinny);
    expect(sounds.status('whinny')).toEqual({ source: 'assets', count: 1 });
    expect(sink.urls.snort).toEqual([]);
    expect(sounds.status('snort')).toEqual({ source: 'synth', count: 0 });
  });

  it('uploaded files win over the asset folder, and are kept on the device across restarts', async () => {
    const { sink, sounds, idb } = await setup();
    const report = await sounds.addFiles('whinny', [file('my-whinny.mp3'), file('second.ogg')]);
    expect(report.accepted).toHaveLength(2);
    expect(sounds.status('whinny')).toEqual({ source: 'upload', count: 2 });
    expect(sink.urls.whinny).toHaveLength(2);
    expect(sink.urls.whinny[0]).toMatch(/^blob:/);
    // Restart: the files come back from IndexedDB.
    const again = await setup(idb);
    expect(again.sounds.status('whinny')).toEqual({ source: 'upload', count: 2 });
  });

  it('invalid files are refused with a reason; valid ones of the same selection are still taken', async () => {
    const { sounds } = await setup();
    const report = await sounds.addFiles('snort', [
      file('snort.wav'),
      file('notes.txt'),
      file('huge.wav', MAX_FILE_BYTES + 1),
      file('broken.mp3', 100, 0),
    ]);
    expect(report.accepted.map((a) => a.name)).toEqual(['snort.wav']);
    expect(report.rejected).toEqual([
      { name: 'notes.txt', problem: 'format' },
      { name: 'huge.wav', problem: 'size' },
      { name: 'broken.mp3', problem: 'decode' },
    ]);
    expect(sounds.status('snort')).toEqual({ source: 'upload', count: 1 });
  });

  it('a selection without any valid file keeps what the slot had before', async () => {
    const { sounds } = await setup();
    await sounds.addFiles('hoof', [file('hoof.wav')]);
    await sounds.addFiles('hoof', [file('hoof.txt')]);
    expect(sounds.status('hoof')).toEqual({ source: 'upload', count: 1 });
  });

  it('a new selection replaces the uploads of that slot', async () => {
    const { sounds } = await setup();
    await sounds.addFiles('hoof', [file('a.wav'), file('b.wav')]);
    await sounds.addFiles('hoof', [file('c.wav')]);
    expect(sounds.status('hoof')).toEqual({ source: 'upload', count: 1 });
  });

  it('reset: back to the asset folder or the synthesized sound, also after a restart', async () => {
    const { sink, sounds, idb } = await setup();
    await sounds.addFiles('whinny', [file('w.wav')]);
    await sounds.addFiles('snort', [file('s.wav')]);
    await sounds.reset('whinny');
    expect(sounds.status('whinny')).toEqual({ source: 'assets', count: 1 });
    expect(sink.urls.whinny).toEqual(ASSETS.whinny);
    expect(sounds.status('snort').source).toBe('upload');
    await sounds.resetAll();
    expect(sounds.status('snort')).toEqual({ source: 'synth', count: 0 });
    const again = await setup(idb);
    expect(again.sounds.status('snort').source).toBe('synth');
  });

  it('a sound package fills every slot it has files for and leaves the others alone', async () => {
    const { sounds } = await setup();
    await sounds.addFiles('whinny', [file('mine.wav')]);
    const zip = zipSync({ 'hoof-1.wav': bytes(20), 'hoof-2.wav': bytes(20), 'snort-x.mp3': bytes(20, 0), 'info.txt': bytes(5) });
    const report = await sounds.addPackage(new File([zip], 'pack.zip'));
    expect(report.accepted.map((a) => `${a.slot}:${a.name}`)).toEqual(['hoof:hoof-1.wav', 'hoof:hoof-2.wav']);
    expect(report.rejected).toEqual([{ name: 'snort-x.mp3', problem: 'decode' }]);
    expect(report.ignored).toEqual(['info.txt']);
    expect(sounds.status('hoof')).toEqual({ source: 'upload', count: 2 });
    expect(sounds.status('whinny')).toEqual({ source: 'upload', count: 1 });
    expect(sounds.status('snort').source).toBe('synth');
  });

  it('a file that is not a zip is reported as such', async () => {
    const { sounds } = await setup();
    expect((await sounds.addPackage(file('pack.zip'))).packageProblem).toBe('notZip');
  });
});
