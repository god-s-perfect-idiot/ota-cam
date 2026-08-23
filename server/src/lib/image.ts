export interface DetectedImage {
  mimeType: string;
  extension: string;
}

/**
 * Identifies an image by its magic bytes rather than the client-supplied
 * Content-Type. The upload endpoint is public, so the declared type is not
 * trustworthy and we refuse to hand anything unrecognised to Drive.
 */
export function detectImageType(buf: Uint8Array): DetectedImage | null {
  const startsWith = (...bytes: number[]) => bytes.every((b, i) => buf[i] === b);

  if (startsWith(0xff, 0xd8, 0xff)) {
    return { mimeType: 'image/jpeg', extension: 'jpg' };
  }
  if (startsWith(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) {
    return { mimeType: 'image/png', extension: 'png' };
  }
  if (startsWith(0x52, 0x49, 0x46, 0x46) && ascii(buf, 8, 12) === 'WEBP') {
    return { mimeType: 'image/webp', extension: 'webp' };
  }
  // ISO base media container: `....ftyp<brand>`. Covers iOS HEIC/HEIF.
  if (ascii(buf, 4, 8) === 'ftyp') {
    const brand = ascii(buf, 8, 12);
    if (['heic', 'heix', 'hevc', 'heim', 'heis', 'hevm', 'mif1', 'msf1'].includes(brand)) {
      return { mimeType: 'image/heic', extension: 'heic' };
    }
  }
  return null;
}

function ascii(buf: Uint8Array, start: number, end: number): string {
  if (buf.length < end) return '';
  let out = '';
  for (let i = start; i < end; i += 1) out += String.fromCharCode(buf[i]!);
  return out;
}

/** Strips anything that could escape a Drive filename or look like a path. */
export function sanitiseNameFragment(input: string, maxLength = 40): string {
  return input
    .normalize('NFKD')
    .replace(/[^\p{L}\p{N} _-]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

/**
 * Builds a sortable filename so the Drive folder reads like a roll of film in
 * chronological order regardless of how the uploads interleave.
 */
export function buildPhotoFilename(options: {
  takenAt: Date;
  sequence: number;
  shooter?: string | null;
  extension: string;
}): string {
  const { takenAt, sequence, shooter, extension } = options;
  const stamp = takenAt
    .toISOString()
    .replace(/[:.]/g, '-')
    .replace('T', '_')
    .slice(0, 19);
  const who = shooter ? `_${sanitiseNameFragment(shooter, 24).replace(/ /g, '-')}` : '';
  const seq = String(sequence).padStart(4, '0');
  return `${seq}_${stamp}${who}.${extension}`;
}
