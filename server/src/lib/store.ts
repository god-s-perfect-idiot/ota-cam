import { createWriteStream, type WriteStream } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config.js';
import { randomId } from './crypto.js';

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
  /** ISO timestamp after which the camera stops accepting photos, or null. */
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

/**
 * A tiny append-and-replace JSON store. The dataset here is a handful of rolls
 * plus counters, so a real database would be more operational burden than it is
 * worth; per-photo rows go to an append-only log instead of being rewritten.
 */
class Store {
  private db: Database = structuredClone(EMPTY);
  private ready: Promise<void> | null = null;
  /** Serialises writes so concurrent uploads cannot interleave a read-modify-write. */
  private tail: Promise<unknown> = Promise.resolve();
  private photoLog: WriteStream | null = null;

  private get dbPath() {
    return path.join(config.dataDir, 'db.json');
  }

  private get photoLogPath() {
    return path.join(config.dataDir, 'photos.jsonl');
  }

  async init(): Promise<void> {
    this.ready ??= (async () => {
      await fs.mkdir(config.dataDir, { recursive: true });
      try {
        const raw = await fs.readFile(this.dbPath, 'utf8');
        this.db = { ...structuredClone(EMPTY), ...(JSON.parse(raw) as Database) };
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
        await this.persist();
      }
    })();
    return this.ready;
  }

  private async persist(): Promise<void> {
    // Write to a sibling temp file then rename, so a crash mid-write cannot
    // truncate the only copy of the host's refresh token.
    const tmp = `${this.dbPath}.${process.pid}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(this.db, null, 2), 'utf8');
    await fs.rename(tmp, this.dbPath);
  }

  /** Runs `mutator` exclusively, then flushes to disk. */
  private mutate<T>(mutator: (db: Database) => T): Promise<T> {
    const run = this.tail.then(async () => {
      const result = mutator(this.db);
      await this.persist();
      return result;
    });
    // Keep the chain alive even if this mutation rejects.
    this.tail = run.catch(() => undefined);
    return run;
  }

  getHost(): HostAccount | null {
    return this.db.host;
  }

  setHost(host: HostAccount): Promise<void> {
    return this.mutate((db) => {
      db.host = host;
    });
  }

  disconnectHost(): Promise<void> {
    return this.mutate((db) => {
      db.host = null;
    });
  }

  listRolls(): Roll[] {
    return [...this.db.rolls].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  findRollByCode(code: string): Roll | undefined {
    return this.db.rolls.find((roll) => roll.code === code);
  }

  findRollById(id: string): Roll | undefined {
    return this.db.rolls.find((roll) => roll.id === id);
  }

  createRoll(roll: Roll): Promise<Roll> {
    return this.mutate((db) => {
      db.rolls.push(roll);
      return roll;
    });
  }

  updateRoll(id: string, patch: Partial<Omit<Roll, 'id'>>): Promise<Roll | undefined> {
    return this.mutate((db) => {
      const roll = db.rolls.find((r) => r.id === id);
      if (!roll) return undefined;
      Object.assign(roll, patch);
      return roll;
    });
  }

  deleteRoll(id: string): Promise<boolean> {
    return this.mutate((db) => {
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
  reservePhotoSlot(rollId: string): Promise<{ sequence: number; remaining: number } | null> {
    return this.mutate((db) => {
      const roll = db.rolls.find((r) => r.id === rollId);
      if (!roll) return null;
      if (roll.photoCap !== null && roll.photoCount >= roll.photoCap) return null;
      roll.photoCount += 1;
      return {
        sequence: roll.photoCount,
        remaining:
          roll.photoCap === null ? Number.MAX_SAFE_INTEGER : Math.max(0, roll.photoCap - roll.photoCount),
      };
    });
  }

  releasePhotoSlot(rollId: string): Promise<void> {
    return this.mutate((db) => {
      const roll = db.rolls.find((r) => r.id === rollId);
      if (roll) roll.photoCount = Math.max(0, roll.photoCount - 1);
    });
  }

  async recordPhoto(record: Omit<PhotoRecord, 'id' | 'uploadedAt'>): Promise<PhotoRecord> {
    const full: PhotoRecord = {
      ...record,
      id: randomId(),
      uploadedAt: new Date().toISOString(),
    };
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

  /** Test helper: forget everything in memory and on disk. */
  async _reset(): Promise<void> {
    await this.tail.catch(() => undefined);
    await this.close();
    this.db = structuredClone(EMPTY);
    this.ready = null;
    await this.init();
  }
}

export const store = new Store();
