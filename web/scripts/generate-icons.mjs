/**
 * Renders the app icons as real PNGs with no image dependencies.
 *
 * A PWA that lives on a phone home screen needs raster icons (iOS ignores SVG
 * for apple-touch-icon), so this draws the camera mark into a pixel buffer and
 * encodes it with Node's built-in zlib.
 *
 * Run with: node scripts/generate-icons.mjs
 */
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const outDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');

const SHELL = [0x1c, 0x18, 0x12];
const CREAM = [0xf6, 0xea, 0xd6];
const AMBER = [0xff, 0xb0, 0x20];
const ORANGE = [0xff, 0x6b, 0x1a];
const DARK = [0x0b, 0x0a, 0x09];

function createCanvas(size) {
  const pixels = new Uint8Array(size * size * 3);
  const set = (x, y, [r, g, b], alpha = 1) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    const i = (y * size + x) * 3;
    pixels[i] = Math.round(pixels[i] * (1 - alpha) + r * alpha);
    pixels[i + 1] = Math.round(pixels[i + 1] * (1 - alpha) + g * alpha);
    pixels[i + 2] = Math.round(pixels[i + 2] * (1 - alpha) + b * alpha);
  };

  return {
    pixels,
    fill(colour) {
      for (let y = 0; y < size; y += 1) for (let x = 0; x < size; x += 1) set(x, y, colour);
    },
    rect(x0, y0, w, h, colour) {
      for (let y = y0; y < y0 + h; y += 1)
        for (let x = x0; x < x0 + w; x += 1) set(Math.round(x), Math.round(y), colour);
    },
    /** Anti-aliased annulus; `inner` of 0 gives a filled disc. */
    ring(cx, cy, outer, inner, colour) {
      const pad = 2;
      for (let y = Math.floor(cy - outer - pad); y <= Math.ceil(cy + outer + pad); y += 1) {
        for (let x = Math.floor(cx - outer - pad); x <= Math.ceil(cx + outer + pad); x += 1) {
          const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
          // Feather one pixel at each edge so curves do not look jagged.
          const alpha = Math.min(
            Math.max(outer - d + 0.5, 0),
            inner > 0 ? Math.max(d - inner + 0.5, 0) : 1,
            1,
          );
          if (alpha > 0) set(x, y, colour, alpha);
        }
      }
    },
  };
}

function encodePng(size, pixels) {
  const stride = size * 3;
  // PNG requires a filter-type byte at the start of every scanline.
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y += 1) {
    raw[y * (stride + 1)] = 0;
    Buffer.from(pixels.subarray(y * stride, (y + 1) * stride)).copy(
      raw,
      y * (stride + 1) + 1,
    );
  }

  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  const crc32 = (buf) => {
    let c = -1;
    for (const byte of buf) c = table[(c ^ byte) & 0xff] ^ (c >>> 8);
    return (c ^ -1) >>> 0;
  };

  const chunk = (type, data) => {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([length, body, crc]);
  };

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // truecolour
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function drawIcon(size) {
  const c = createCanvas(size);
  const u = size / 100;
  c.fill(SHELL);

  // Body of the camera.
  c.rect(12 * u, 26 * u, 76 * u, 52 * u, DARK);
  c.rect(12 * u, 26 * u, 76 * u, 5 * u, AMBER);

  // Lens: cream barrel, amber ring, dark glass with a highlight.
  const cx = 50 * u;
  const cy = 54 * u;
  c.ring(cx, cy, 21 * u, 0, CREAM);
  c.ring(cx, cy, 21 * u, 16 * u, AMBER);
  c.ring(cx, cy, 15 * u, 0, DARK);
  c.ring(cx - 5 * u, cy - 5 * u, 4 * u, 0, CREAM);

  // Flash window and shutter button.
  c.rect(70 * u, 34 * u, 12 * u, 9 * u, ORANGE);
  c.rect(20 * u, 18 * u, 14 * u, 8 * u, ORANGE);

  return encodePng(size, c.pixels);
}

for (const size of [180, 192, 512]) {
  const name = size === 180 ? 'icon-180.png' : `icon-${size}.png`;
  writeFileSync(join(outDir, name), drawIcon(size));
  console.log(`wrote public/${name}`);
}
