import { createWriteStream, type WriteStream } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config.js';
import { randomId } from './crypto.js';
import { firebaseConfigured, getDb } from './firebase.js';

export interface HostAccount {
  email: string;
  /** AES-GCM encrypted Google refresh token. Never leaves the server. */
  refreshTokenEnc: string;
  connectedAt: string;
  /** Drive folder that every roll folder is nested under. */
  rootFolderId: string | null;
}

export interface Roll {
  id: string;
  /** Unguessable code that appears in the shareable camera URL. */
  code: string;
  name: string;
  driveFolderId: string;
  driveFolderUrl: string;
  createdAt: string;
  /** Legacy field; share links no longer expire. Always null for new rolls. */
  expiresAt: string | null;
  closed: boolean;
  /** Max exposures for this roll, or null for unlimited. */
  photoCap: number | null;
  photoCount: number;
}

export interface PhotoRecord {
  id: string;
  rollId: string;
  driveFileId: string;
  bytes: number;
  mimeType: string;
  shooter: string | null;
  clientPhotoId: string | null;
  uploadedAt: string;
}

interface Database {
  version: 1;
  host: HostAccount | null;
  rolls: Roll[];
}

const EMPTY: Database = { version: 1, host: null, rolls: [] };

const HOST_DOC = 'meta/host';
const ROLLS_COL = 'rolls';
const PHOTOS_COL = 'photos';

/**
 * Durable store for host + rolls.
 *
 * - Local / tests: JSON file under DATA_DIR (fast, no network).
 * - Deployed (Vercel): Cloud Firestore when Firebase env is set, so cameras
 *   survive deploys. Serverless /tmp is ephemeral and must not be the source
 *   of truth.
 */
class Store {
  private db: Database = structuredClone(EMPTY);
  private ready: Promise<void> | null = null;
  /** Serialises local-file writes so concurrent uploads cannot interleave. */
  private tail: Promise<unknown> = Promise.resolve();
  private photoLog: WriteStream | null = null;
  private useFirestore = false;

  private get dbPath() {
    return path.join(config.dataDir, 'db.json');
  }

  private get photoLogPath() {
    return path.join(config.dataDir, 'photos.jsonl');
  }

  async init(): Promise<void> {
    this.ready ??= (async () => {
      // Tests always use the local JSON file so the suite stays offline.
      this.useFirestore = firebaseConfigured() && config.NODE_ENV !== 'test';
      if (this.useFirestore) {
        await this.loadFromFirestore();
        return;
      }
      await fs.mkdir(config.dataDir, { recursive: true });
      try {
        const raw = await fs.readFile(this.dbPath, 'utf8');
        this.db = { ...structuredClone(EMPTY), ...(JSON.parse(raw) as Database) };
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
        await this.persistFile();
      }
    })();
    return this.ready;
  }

  private async loadFromFirestore(): Promise<void> {
    const firestore = getDb();
    const [hostSnap, rollsSnap] = await Promise.all([
      firestore.doc(HOST_DOC).get(),
      firestore.collection(ROLLS_COL).get(),
    ]);
    const host = hostSnap.exists ? (hostSnap.data() as HostAccount) : null;
    const rolls = rollsSnap.docs.map((doc) => doc.data() as Roll);
    this.db = { version: 1, host, rolls };
  }

  /** Re-read from Firestore so warm serverless instances see peer writes. */
  private async refreshIfRemote(): Promise<void> {
    await this.init();
    if (this.useFirestore) await this.loadFromFirestore();
  }

  private async persistFile(): Promise<void> {
    const tmp = `${this.dbPath}.${process.pid}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(this.db, null, 2), 'utf8');
    await fs.rename(tmp, this.dbPath);
  }

  /** Runs `mutator` exclusively against the local JSON file, then flushes. */
  private mutateFile<T>(mutator: (db: Database) => T): Promise<T> {
    const run = this.tail.then(async () => {
      await this.init();
      const result = mutator(this.db);
      await this.persistFile();
      return result;
    });
    this.tail = run.catch(() => undefined);
    return run;
  }

  async getHost(): Promise<HostAccount | null> {
    await this.refreshIfRemote();
    return this.db.host;
  }

  async setHost(host: HostAccount): Promise<void> {
    await this.init();
    if (this.useFirestore) {
      await getDb().doc(HOST_DOC).set(host);
      this.db.host = host;
      return;
    }
    await this.mutateFile((db) => {
      db.host = host;
    });
  }

  async disconnectHost(): Promise<void> {
    await this.init();
    if (this.useFirestore) {
      await getDb().doc(HOST_DOC).delete();
      this.db.host = null;
      return;
    }
    await this.mutateFile((db) => {
      db.host = null;
    });
  }

  async listRolls(): Promise<Roll[]> {
    await this.refreshIfRemote();
    return [...this.db.rolls].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async findRollByCode(code: string): Promise<Roll | undefined> {
    await this.refreshIfRemote();
    return this.db.rolls.find((roll) => roll.code === code);
  }

  async findRollById(id: string): Promise<Roll | undefined> {
    await this.refreshIfRemote();
    return this.db.rolls.find((roll) => roll.id === id);
  }

  async createRoll(roll: Roll): Promise<Roll> {
    await this.init();
    if (this.useFirestore) {
      await getDb().collection(ROLLS_COL).doc(roll.id).set(roll);
      this.db.rolls.push(roll);
      return roll;
    }
    return this.mutateFile((db) => {
      db.rolls.push(roll);
      return roll;
    });
  }

  async updateRoll(id: string, patch: Partial<Omit<Roll, 'id'>>): Promise<Roll | undefined> {
    await this.init();
    if (this.useFirestore) {
      const ref = getDb().collection(ROLLS_COL).doc(id);
      return getDb().runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists) return undefined;
        const next = { ...(snap.data() as Roll), ...patch, id };
        tx.set(ref, next);
        const idx = this.db.rolls.findIndex((r) => r.id === id);
        if (idx >= 0) this.db.rolls[idx] = next;
        else this.db.rolls.push(next);
        return next;
      });
    }
    return this.mutateFile((db) => {
      const roll = db.rolls.find((r) => r.id === id);
      if (!roll) return undefined;
      Object.assign(roll, patch);
      return roll;
    });
  }

  async deleteRoll(id: string): Promise<boolean> {
    await this.init();
    if (this.useFirestore) {
      const ref = getDb().collection(ROLLS_COL).doc(id);
      const snap = await ref.get();
      if (!snap.exists) return false;
      await ref.delete();
      this.db.rolls = this.db.rolls.filter((r) => r.id !== id);
      return true;
    }
    return this.mutateFile((db) => {
      const before = db.rolls.length;
      db.rolls = db.rolls.filter((r) => r.id !== id);
      return db.rolls.length < before;
    });
  }

  /**
   * Claims one slot on the roll before the upload starts, so simultaneous
   * shutters cannot race past the cap. Returns null when the roll is full.
   * Callers must release the slot if the upload does not complete.
   */
  async reservePhotoSlot(
    rollId: string,
  ): Promise<{ sequence: number; remaining: number } | null> {
    await this.init();
    if (this.useFirestore) {
      const ref = getDb().collection(ROLLS_COL).doc(rollId);
      return getDb().runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists) return null;
        const roll = snap.data() as Roll;
        if (roll.photoCap !== null && roll.photoCount >= roll.photoCap) return null;
        const photoCount = roll.photoCount + 1;
        tx.update(ref, { photoCount });
        const next = { ...roll, photoCount };
        const idx = this.db.rolls.findIndex((r) => r.id === rollId);
        if (idx >= 0) this.db.rolls[idx] = next;
        return {
          sequence: photoCount,
          remaining:
            roll.photoCap === null
              ? Number.MAX_SAFE_INTEGER
              : Math.max(0, roll.photoCap - photoCount),
        };
      });
    }
    return this.mutateFile((db) => {
      const roll = db.rolls.find((r) => r.id === rollId);
      if (!roll) return null;
      if (roll.photoCap !== null && roll.photoCount >= roll.photoCap) return null;
      roll.photoCount += 1;
      return {
        sequence: roll.photoCount,
        remaining:
          roll.photoCap === null
            ? Number.MAX_SAFE_INTEGER
            : Math.max(0, roll.photoCap - roll.photoCount),
      };
    });
  }

  async releasePhotoSlot(rollId: string): Promise<void> {
    await this.init();
    if (this.useFirestore) {
      const ref = getDb().collection(ROLLS_COL).doc(rollId);
      await getDb().runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists) return;
        const roll = snap.data() as Roll;
        const photoCount = Math.max(0, roll.photoCount - 1);
        tx.update(ref, { photoCount });
        const idx = this.db.rolls.findIndex((r) => r.id === rollId);
        if (idx >= 0) this.db.rolls[idx] = { ...roll, photoCount };
      });
      return;
    }
    await this.mutateFile((db) => {
      const roll = db.rolls.find((r) => r.id === rollId);
      if (roll) roll.photoCount = Math.max(0, roll.photoCount - 1);
    });
  }

  async recordPhoto(record: Omit<PhotoRecord, 'id' | 'uploadedAt'>): Promise<PhotoRecord> {
    await this.init();
    const full: PhotoRecord = {
      ...record,
      id: randomId(),
      uploadedAt: new Date().toISOString(),
    };
    if (this.useFirestore) {
      await getDb().collection(PHOTOS_COL).doc(full.id).set(full);
      return full;
    }
    this.photoLog ??= createWriteStream(this.photoLogPath, { flags: 'a' });
    this.photoLog.write(`${JSON.stringify(full)}\n`);
    return full;
  }

  /** Flushes and releases the photo log so the process can exit cleanly. */
  async close(): Promise<void> {
    const log = this.photoLog;
    this.photoLog = null;
    if (!log) return;
    await new Promise<void>((resolve) => log.end(resolve));
  }

  /** Test helper: forget everything in memory and on disk / Firestore. */
  async _reset(): Promise<void> {
    await this.tail.catch(() => undefined);
    await this.close();
    await this.init();
    if (this.useFirestore) {
      const firestore = getDb();
      const rolls = await firestore.collection(ROLLS_COL).listDocuments();
      const photos = await firestore.collection(PHOTOS_COL).listDocuments();
      const batch = firestore.batch();
      batch.delete(firestore.doc(HOST_DOC));
      for (const ref of [...rolls, ...photos]) batch.delete(ref);
      await batch.commit();
    } else {
      await fs.rm(this.dbPath, { force: true });
      await fs.rm(this.photoLogPath, { force: true });
    }
    this.db = structuredClone(EMPTY);
    this.ready = null;
    await this.init();
  }

  backend(): 'firestore' | 'file' {
    return this.useFirestore ? 'firestore' : 'file';
  }
}

export const store = new Store();
