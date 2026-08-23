import type { Roll } from './store.js';

export type RollStatus = 'open' | 'closed' | 'expired' | 'full';

export function rollStatus(roll: Roll, now = new Date()): RollStatus {
  if (roll.closed) return 'closed';
  if (roll.expiresAt && new Date(roll.expiresAt) <= now) return 'expired';
  if (roll.photoCount >= roll.photoCap) return 'full';
  return 'open';
}

/** Shape sent to guests. Deliberately excludes the Drive folder link. */
export function publicRollView(roll: Roll, now = new Date()) {
  const status = rollStatus(roll, now);
  return {
    code: roll.code,
    name: roll.name,
    status,
    acceptingPhotos: status === 'open',
    photoCount: roll.photoCount,
    remaining: Math.max(0, roll.photoCap - roll.photoCount),
    expiresAt: roll.expiresAt,
  };
}

/** Shape sent to the authenticated host, including where the photos live. */
export function adminRollView(roll: Roll, baseUrl: string, now = new Date()) {
  return {
    ...publicRollView(roll, now),
    id: roll.id,
    createdAt: roll.createdAt,
    photoCap: roll.photoCap,
    closed: roll.closed,
    driveFolderUrl: roll.driveFolderUrl,
    shareUrl: `${baseUrl}/c/${roll.code}`,
  };
}
