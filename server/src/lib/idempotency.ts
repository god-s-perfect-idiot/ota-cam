interface Entry {
  fileId: string;
  at: number;
}

const TTL_MS = 30 * 60 * 1000;
const MAX_ENTRIES = 5000;

/**
 * Remembers which client-generated photo ids have already landed in Drive.
 * The camera retries queued shots aggressively over flaky connections, and a
 * retry of a request that actually succeeded must not duplicate the photo.
 * In-memory is sufficient: retries happen within minutes, and a server restart
 * losing this map only risks a duplicate, never a lost photo.
 */
const seen = new Map<string, Entry>();

function keyFor(rollId: string, clientPhotoId: string): string {
  return `${rollId}:${clientPhotoId}`;
}

function prune(): void {
  const cutoff = Date.now() - TTL_MS;
  for (const [key, entry] of seen) {
    if (entry.at < cutoff) seen.delete(key);
  }
  while (seen.size > MAX_ENTRIES) {
    const oldest = seen.keys().next();
    if (oldest.done) break;
    seen.delete(oldest.value);
  }
}

export function recallUpload(rollId: string, clientPhotoId: string): string | null {
  prune();
  return seen.get(keyFor(rollId, clientPhotoId))?.fileId ?? null;
}

export function rememberUpload(rollId: string, clientPhotoId: string, fileId: string): void {
  seen.set(keyFor(rollId, clientPhotoId), { fileId, at: Date.now() });
  prune();
}
