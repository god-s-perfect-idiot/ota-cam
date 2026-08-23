import {
  deleteShot,
  getAllShots,
  newShotId,
  putShot,
  type Shot,
} from './db.js';

export interface QueueStats {
  /** Shots taken on this device for the current roll, however they ended up. */
  shot: number;
  uploaded: number;
  pending: number;
  failed: number;
  online: boolean;
  lastError: string | null;
}

export type QueueListener = (stats: QueueStats) => void;

const MAX_ATTEMPTS = 8;
const BASE_BACKOFF_MS = 2_000;
const MAX_BACKOFF_MS = 60_000;

/** Retrying these would fail identically forever, so the shot is parked. */
const TERMINAL_STATUSES = new Set([400, 401, 403, 404, 409, 413, 415]);

function backoffFor(attempts: number): number {
  const exponential = Math.min(BASE_BACKOFF_MS * 2 ** (attempts - 1), MAX_BACKOFF_MS);
  // Jitter stops a room full of phones from retrying in lockstep.
  return exponential * (0.7 + Math.random() * 0.6);
}

class UploadQueue {
  private rollCode: string | null = null;
  private listeners = new Set<QueueListener>();
  private running = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private uploadedThisSession = 0;
  private lastError: string | null = null;
  private stats: QueueStats = {
    shot: 0,
    uploaded: 0,
    pending: 0,
    failed: 0,
    online: true,
    lastError: null,
  };

  async attach(rollCode: string): Promise<void> {
    this.rollCode = rollCode;
    // Count shots already uploaded from this device so the counter survives a
    // reload mid-party rather than resetting to zero.
    this.uploadedThisSession = readUploadedCount(rollCode);
    window.addEventListener('online', this.handleOnline);
    document.addEventListener('visibilitychange', this.handleVisibility);
    await this.refreshStats();
    void this.drain();
  }

  detach(): void {
    window.removeEventListener('online', this.handleOnline);
    document.removeEventListener('visibilitychange', this.handleVisibility);
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.rollCode = null;
    this.listeners.clear();
  }

  subscribe(listener: QueueListener): () => void {
    this.listeners.add(listener);
    listener(this.stats);
    return () => this.listeners.delete(listener);
  }

  private handleOnline = () => {
    this.lastError = null;
    void this.drain();
  };

  private handleVisibility = () => {
    if (document.visibilityState === 'visible') void this.drain();
  };

  /** Persists a freshly captured frame and kicks the uploader. */
  async enqueue(blob: Blob, shooter: string | null): Promise<void> {
    if (!this.rollCode) throw new Error('Queue is not attached to a roll');
    const shot: Shot = {
      id: newShotId(),
      rollCode: this.rollCode,
      data: await blob.arrayBuffer(),
      mimeType: blob.type || 'image/jpeg',
      takenAt: new Date().toISOString(),
      shooter,
      status: 'pending',
      attempts: 0,
      nextAttemptAt: 0,
      bytes: blob.size,
    };
    await putShot(shot);
    await this.refreshStats();
    void this.drain();
  }

  async retryFailed(): Promise<void> {
    const shots = await this.currentRollShots();
    await Promise.all(
      shots
        .filter((shot) => shot.status === 'failed')
        .map((shot) => putShot({ ...shot, status: 'pending', attempts: 0, nextAttemptAt: 0 })),
    );
    this.lastError = null;
    await this.refreshStats();
    void this.drain();
  }

  private async currentRollShots(): Promise<Shot[]> {
    const all = await getAllShots();
    return all.filter((shot) => shot.rollCode === this.rollCode);
  }

  private async refreshStats(): Promise<void> {
    const shots = await this.currentRollShots();
    this.stats = {
      shot: this.uploadedThisSession + shots.filter((s) => s.status !== 'done').length,
      uploaded: this.uploadedThisSession,
      pending: shots.filter((s) => s.status === 'pending' || s.status === 'uploading').length,
      failed: shots.filter((s) => s.status === 'failed').length,
      online: navigator.onLine,
      lastError: this.lastError,
    };
    for (const listener of this.listeners) listener(this.stats);
  }

  /** Uploads queued shots one at a time until none are ready. */
  private async drain(): Promise<void> {
    if (this.running || !this.rollCode) return;
    this.running = true;
    try {
      for (;;) {
        if (!navigator.onLine) break;
        const shots = await this.currentRollShots();
        const ready = shots
          .filter((s) => s.status === 'pending' && s.nextAttemptAt <= Date.now())
          .sort((a, b) => a.takenAt.localeCompare(b.takenAt));

        const next = ready[0];
        if (!next) {
          this.scheduleNextWake(shots);
          break;
        }
        await this.upload(next);
        await this.refreshStats();
      }
    } finally {
      this.running = false;
      await this.refreshStats();
    }
  }

  private scheduleNextWake(shots: Shot[]): void {
    const waits = shots
      .filter((s) => s.status === 'pending')
      .map((s) => s.nextAttemptAt - Date.now())
      .filter((ms) => ms > 0);
    if (waits.length === 0) return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.drain(), Math.max(500, Math.min(...waits)));
  }

  private async upload(shot: Shot): Promise<void> {
    await putShot({ ...shot, status: 'uploading' });

    const form = new FormData();
    // Fields must precede the file so the server can read them while streaming.
    form.append('clientPhotoId', shot.id);
    form.append('takenAt', shot.takenAt);
    if (shot.shooter) form.append('shooter', shot.shooter);
    form.append('photo', new Blob([shot.data], { type: shot.mimeType }), `${shot.id}.jpg`);

    try {
      const response = await fetch(`/api/rolls/${encodeURIComponent(shot.rollCode)}/photos`, {
        method: 'POST',
        body: form,
      });

      if (response.ok) {
        await deleteShot(shot.id);
        this.uploadedThisSession += 1;
        writeUploadedCount(shot.rollCode, this.uploadedThisSession);
        this.lastError = null;
        return;
      }

      const detail = await readError(response);
      if (TERMINAL_STATUSES.has(response.status)) {
        this.lastError = detail;
        await putShot({ ...shot, status: 'failed', error: detail, attempts: shot.attempts + 1 });
        return;
      }
      await this.scheduleRetry(shot, detail);
    } catch {
      // Offline, DNS failure, or the request was cut off mid-flight.
      await this.scheduleRetry(shot, 'No connection. Will retry automatically.');
    }
  }

  private async scheduleRetry(shot: Shot, error: string): Promise<void> {
    const attempts = shot.attempts + 1;
    this.lastError = error;
    if (attempts >= MAX_ATTEMPTS) {
      await putShot({ ...shot, status: 'failed', attempts, error });
      return;
    }
    await putShot({
      ...shot,
      status: 'pending',
      attempts,
      error,
      nextAttemptAt: Date.now() + backoffFor(attempts),
    });
  }
}

async function readError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { message?: string };
    if (body.message) return body.message;
  } catch {
    // Fall through to a generic message below.
  }
  return response.status === 429
    ? 'Slow down a moment, too many photos at once.'
    : `Upload failed (${response.status}).`;
}

const COUNT_KEY = 'ota-cam:uploaded:';

function readUploadedCount(rollCode: string): number {
  const raw = localStorage.getItem(COUNT_KEY + rollCode);
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function writeUploadedCount(rollCode: string, count: number): void {
  localStorage.setItem(COUNT_KEY + rollCode, String(count));
}

export const uploadQueue = new UploadQueue();
export { backoffFor as _backoffFor, MAX_ATTEMPTS as _MAX_ATTEMPTS };
