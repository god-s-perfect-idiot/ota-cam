export type ShotStatus = 'pending' | 'uploading' | 'done' | 'failed';

export interface Shot {
  id: string;
  rollCode: string;
  /**
   * Raw JPEG bytes rather than a Blob. Some browsers (notably older iOS
   * Safari) mishandle Blobs stored in IndexedDB, and an ArrayBuffer survives
   * the structured clone intact on every engine.
   */
  data: ArrayBuffer;
  mimeType: string;
  takenAt: string;
  shooter: string | null;
  status: ShotStatus;
  attempts: number;
  /** Epoch ms before which the uploader should not retry this shot. */
  nextAttemptAt: number;
  error?: string;
  bytes: number;
}

const DB_NAME = 'ota-cam';
const DB_VERSION = 1;
const STORE = 'shots';

let dbPromise: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'id' });
        store.createIndex('status', 'status');
        store.createIndex('rollCode', 'rollCode');
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Could not open IndexedDB'));
  });
  return dbPromise;
}

function run<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(STORE, mode);
        const request = fn(tx.objectStore(STORE));
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
      }),
  );
}

export function putShot(shot: Shot): Promise<unknown> {
  return run('readwrite', (store) => store.put(shot));
}

export function deleteShot(id: string): Promise<unknown> {
  return run('readwrite', (store) => store.delete(id));
}

export function getAllShots(): Promise<Shot[]> {
  return run<Shot[]>('readonly', (store) => store.getAll() as IDBRequest<Shot[]>);
}

export async function getShotsForRoll(rollCode: string): Promise<Shot[]> {
  const all = await getAllShots();
  return all.filter((shot) => shot.rollCode === rollCode);
}

/** Drops finished shots so their image blobs stop occupying device storage. */
export async function pruneCompleted(): Promise<void> {
  const all = await getAllShots();
  await Promise.all(all.filter((shot) => shot.status === 'done').map((shot) => deleteShot(shot.id)));
}

export function newShotId(): string {
  return crypto.randomUUID();
}
