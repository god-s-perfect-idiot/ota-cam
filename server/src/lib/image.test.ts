import { describe, expect, it } from 'vitest';
import { buildPhotoFilename, detectImageType, sanitiseNameFragment } from './image.js';

function bytes(...values: number[]): Uint8Array {
  // Pad past the longest signature so short-buffer handling is exercised too.
  const buf = new Uint8Array(32);
  buf.set(values);
  return buf;
}

describe('detectImageType', () => {
  it('recognises the formats a phone camera produces', () => {
    expect(detectImageType(bytes(0xff, 0xd8, 0xff, 0xe0))?.mimeType).toBe('image/jpeg');
    expect(
      detectImageType(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))?.mimeType,
    ).toBe('image/png');

    const webp = new Uint8Array(32);
    webp.set([0x52, 0x49, 0x46, 0x46]);
    webp.set([0x57, 0x45, 0x42, 0x50], 8);
    expect(detectImageType(webp)?.mimeType).toBe('image/webp');

    const heic = new Uint8Array(32);
    heic.set([0x66, 0x74, 0x79, 0x70], 4);
    heic.set([0x68, 0x65, 0x69, 0x63], 8);
    expect(detectImageType(heic)?.mimeType).toBe('image/heic');
  });

  it('rejects anything that is not an image', () => {
    // A public endpoint must not forward these to Drive just because the
    // client claimed image/jpeg.
    expect(detectImageType(new TextEncoder().encode('<html><script>x</script>'))).toBeNull();
    expect(detectImageType(new TextEncoder().encode('%PDF-1.7'))).toBeNull();
    expect(detectImageType(new TextEncoder().encode('#!/bin/sh\nrm -rf /'))).toBeNull();
    expect(detectImageType(new Uint8Array(0))).toBeNull();
    expect(detectImageType(bytes(0xff, 0xd8))).toBeNull(); // truncated JPEG magic
  });

  it('does not treat a non-image ISO container as a photo', () => {
    const mp4 = new Uint8Array(32);
    mp4.set([0x66, 0x74, 0x79, 0x70], 4);
    mp4.set([0x69, 0x73, 0x6f, 0x6d], 8); // "isom"
    expect(detectImageType(mp4)).toBeNull();
  });
});

describe('sanitiseNameFragment', () => {
  it('strips characters that could escape a filename', () => {
    expect(sanitiseNameFragment('../../etc/passwd')).toBe('etcpasswd');
    expect(sanitiseNameFragment('a/b\\c')).toBe('abc');
    expect(sanitiseNameFragment('name\u0000null')).toBe('namenull');
    expect(sanitiseNameFragment('  spaced   out  ')).toBe('spaced out');
  });

  it('keeps ordinary and non-latin names intact', () => {
    expect(sanitiseNameFragment('Samar')).toBe('Samar');
    expect(sanitiseNameFragment('Ravi-Kumar_2')).toBe('Ravi-Kumar_2');
    expect(sanitiseNameFragment('സമർ')).toBe('സമർ');
  });

  it('truncates long input', () => {
    expect(sanitiseNameFragment('x'.repeat(200), 10)).toHaveLength(10);
  });
});

describe('buildPhotoFilename', () => {
  const takenAt = new Date('2026-08-23T09:41:07.500Z');

  it('sorts chronologically and records the shooter', () => {
    expect(
      buildPhotoFilename({ takenAt, sequence: 7, shooter: 'Samar', extension: 'jpg' }),
    ).toBe('0007_2026-08-23_09-41-07_Samar.jpg');
  });

  it('omits the shooter when none was given', () => {
    expect(buildPhotoFilename({ takenAt, sequence: 1, shooter: null, extension: 'jpg' })).toBe(
      '0001_2026-08-23_09-41-07.jpg',
    );
  });

  it('cannot be coerced into a path by a hostile shooter name', () => {
    const name = buildPhotoFilename({
      takenAt,
      sequence: 2,
      shooter: '../../secret',
      extension: 'jpg',
    });
    expect(name).not.toContain('/');
    expect(name).not.toContain('..');
  });
});
