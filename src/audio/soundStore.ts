import type { SampleKind } from './localSamples';

/**
 * Own sound files, stored in the browser's IndexedDB (localStorage is far too
 * small for audio). Nothing is uploaded anywhere – the files stay on this
 * device. The database name carries the game's prefix, because all projects
 * hosted under the same domain (e.g. <user>.github.io) share one storage.
 */
export const SOUND_DB_NAME = 'giddyhop.sounds';
const STORE = 'files';

export interface StoredSound {
  slot: SampleKind;
  name: string;
  /** File content (ArrayBuffer, stored reliably by every browser). */
  data: ArrayBuffer;
}

export class SoundStore {
  private db: Promise<IDBDatabase> | null = null;

  constructor(private readonly factory: () => IDBFactory = () => indexedDB) {}

  /** All stored files, in the order they were added. */
  async all(): Promise<StoredSound[]> {
    const db = await this.open();
    return request<{ slot: SampleKind; name: string; data: ArrayBuffer }[]>(
      db.transaction(STORE).objectStore(STORE).getAll(),
    );
  }

  /** Replaces the files of one slot (in one transaction: all or nothing). */
  async replaceSlot(slot: SampleKind, files: readonly Omit<StoredSound, 'slot'>[]): Promise<void> {
    const db = await this.open();
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    // Inside the request callback, so the transaction is still open.
    store.index('slot').getAllKeys(slot).onsuccess = (e) => {
      for (const key of (e.target as IDBRequest<IDBValidKey[]>).result) store.delete(key);
      for (const f of files) store.add({ slot, name: f.name, data: f.data });
    };
    await done(tx);
  }

  async clearSlot(slot: SampleKind): Promise<void> {
    await this.replaceSlot(slot, []);
  }

  async clearAll(): Promise<void> {
    const db = await this.open();
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).clear();
    await done(tx);
  }

  private open(): Promise<IDBDatabase> {
    this.db ??= new Promise((resolve, reject) => {
      const req = this.factory().open(SOUND_DB_NAME, 1);
      req.onupgradeneeded = () => {
        const store = req.result.createObjectStore(STORE, { autoIncrement: true });
        store.createIndex('slot', 'slot');
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return this.db;
  }
}

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'));
  });
}
