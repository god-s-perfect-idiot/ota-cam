import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getShotsForRoll } from './db.js';
import { uploadQueue, type QueueStats } from './uploadQueue.js';

/** Each test uses its own roll code so the shared IndexedDB stays isolated. */
let rollCode = '';
let counter = 0;

function jpegBlob(): Blob {
  return new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3])], { type: 'image/jpeg' });
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

async function waitFor(predicate: () => boolean, timeoutMs = 2000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error('Timed out waiting for the queue to settle');
}

let stats: QueueStats | null = null;
let unsubscribe: () => void;

beforeEach(async () => {
  counter += 1;
  rollCode = `ROLL${counter}`;
  localStorage.clear();
  await uploadQueue.attach(rollCode);
  unsubscribe = uploadQueue.subscribe((next) => {
    stats = next;
  });
});

afterEach(() => {
  unsubscribe();
  uploadQueue.detach();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('uploadQueue', () => {
  it('uploads a queued shot and clears it from storage', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(jsonResponse(200, { ok: true, fileId: 'f1' }));

    await uploadQueue.enqueue(jpegBlob(), 'Samar');
    await waitFor(() => stats?.uploaded === 1);

    expect(await getShotsForRoll(rollCode)).toHaveLength(0);
    expect(stats).toMatchObject({ uploaded: 1, pending: 0, failed: 0 });

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe(`/api/rolls/${rollCode}/photos`);

    // The idempotency key and capture time must travel with the photo, and the
    // fields must precede the file so the server can read them while streaming.
    const form = (init as RequestInit).body as FormData;
    expect([...form.keys()]).toEqual(['clientPhotoId', 'takenAt', 'shooter', 'photo']);
    expect(form.get('shooter')).toBe('Samar');
    expect(String(form.get('clientPhotoId'))).not.toHaveLength(0);
  });

  it('keeps the shot and retries after a network failure', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'));

    await uploadQueue.enqueue(jpegBlob(), null);
    await waitFor(() => stats?.pending === 1 && stats?.lastError !== null);

    // The photo is still on the device, scheduled for another attempt.
    const [shot] = await getShotsForRoll(rollCode);
    expect(shot?.status).toBe('pending');
    expect(shot?.attempts).toBe(1);
    expect(shot?.nextAttemptAt).toBeGreaterThan(Date.now());
    expect(stats?.failed).toBe(0);
  });

  it('recovers once the connection returns', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValue(jsonResponse(200, { ok: true, fileId: 'f2' }));

    await uploadQueue.enqueue(jpegBlob(), null);
    await waitFor(() => stats?.pending === 1);

    window.dispatchEvent(new Event('online'));
    await waitFor(() => stats?.uploaded === 1, 5000);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(await getShotsForRoll(rollCode)).toHaveLength(0);
  });

  it('parks a shot the server will never accept', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse(415, { error: 'unsupported_type', message: 'That file is not a photo.' }),
    );

    await uploadQueue.enqueue(jpegBlob(), null);
    await waitFor(() => stats?.failed === 1);

    const [shot] = await getShotsForRoll(rollCode);
    expect(shot?.status).toBe('failed');
    expect(shot?.error).toBe('That file is not a photo.');
    expect(stats?.pending).toBe(0);
  });

  it('does not discard a shot when the roll is full', async () => {
    // The guest should be told, but their photo stays on the device rather
    // than being silently destroyed.
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse(409, { error: 'full', message: 'This camera has used up its roll.' }),
    );

    await uploadQueue.enqueue(jpegBlob(), null);
    await waitFor(() => stats?.failed === 1);

    expect(await getShotsForRoll(rollCode)).toHaveLength(1);
    expect(stats?.lastError).toBe('This camera has used up its roll.');
  });

  it('retries parked shots on request', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse(413, { message: 'Photo too large.' }));

    await uploadQueue.enqueue(jpegBlob(), null);
    await waitFor(() => stats?.failed === 1);

    fetchMock.mockResolvedValue(jsonResponse(200, { ok: true, fileId: 'f3' }));
    await uploadQueue.retryFailed();
    await waitFor(() => stats?.uploaded === 1);

    expect(stats?.failed).toBe(0);
    expect(await getShotsForRoll(rollCode)).toHaveLength(0);
  });

  it('uploads a burst of shots without losing any', async () => {
    let served = 0;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      served += 1;
      // Fail one in the middle to prove the queue keeps going.
      return served === 3
        ? jsonResponse(502, { message: 'Drive unreachable.' })
        : jsonResponse(200, { ok: true, fileId: `f${served}` });
    });

    for (let i = 0; i < 5; i += 1) await uploadQueue.enqueue(jpegBlob(), null);
    await waitFor(() => stats?.uploaded === 4);

    // The failed one is still queued for a later attempt, not dropped.
    const remaining = await getShotsForRoll(rollCode);
    expect(remaining).toHaveLength(1);
    expect(remaining[0]?.status).toBe('pending');
  });

  it('remembers the uploaded count across a reload', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse(200, { ok: true, fileId: 'f1' }));

    await uploadQueue.enqueue(jpegBlob(), null);
    await waitFor(() => stats?.uploaded === 1);

    uploadQueue.detach();
    await uploadQueue.attach(rollCode);
    unsubscribe = uploadQueue.subscribe((next) => {
      stats = next;
    });

    expect(stats?.uploaded).toBe(1);
  });
});
