/** Short dial labels inspired by a camera mode dial. */
export type FilterId = 'off' | 'film' | 'noir' | 'sepia' | 'vivid' | 'cool';

export type FilterAccent = 'plain' | 'green' | 'tan' | 'boxed';

export interface CameraFilter {
  id: FilterId;
  /** Short label printed on the dial face. */
  label: string;
  /** Spoken name for aria / stamp under the dial. */
  name: string;
  accent: FilterAccent;
}

export const FILTERS: readonly CameraFilter[] = [
  { id: 'off', label: 'OFF', name: 'plain', accent: 'plain' },
  { id: 'film', label: 'VT', name: 'vintage', accent: 'tan' },
  { id: 'noir', label: 'NR', name: 'noir', accent: 'boxed' },
  { id: 'sepia', label: 'SP', name: 'sepia', accent: 'tan' },
  { id: 'vivid', label: 'VD', name: 'vivid', accent: 'green' },
  { id: 'cool', label: 'CL', name: 'cool', accent: 'plain' },
] as const;

export const DEFAULT_FILTER: FilterId = 'film';

export function getFilter(id: FilterId): CameraFilter {
  return FILTERS.find((f) => f.id === id) ?? FILTERS[0]!;
}

export function nextFilterId(id: FilterId): FilterId {
  const index = FILTERS.findIndex((f) => f.id === id);
  const next = FILTERS[(index + 1) % FILTERS.length];
  return next!.id;
}

export function previousFilterId(id: FilterId): FilterId {
  const index = FILTERS.findIndex((f) => f.id === id);
  const prev = FILTERS[(index - 1 + FILTERS.length) % FILTERS.length];
  return prev!.id;
}

let noiseTile: HTMLCanvasElement | null = null;

function getNoiseTile(): HTMLCanvasElement {
  if (noiseTile) return noiseTile;
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const image = ctx.createImageData(size, size);
  for (let i = 0; i < image.data.length; i += 4) {
    const value = 110 + Math.random() * 36;
    image.data[i] = value;
    image.data[i + 1] = value;
    image.data[i + 2] = value;
    image.data[i + 3] = 255;
  }
  ctx.putImageData(image, 0, 0);
  noiseTile = canvas;
  return canvas;
}

function drawGrain(ctx: CanvasRenderingContext2D, width: number, height: number, alpha: number): void {
  ctx.globalCompositeOperation = 'overlay';
  ctx.globalAlpha = alpha;
  const pattern = ctx.createPattern(getNoiseTile(), 'repeat');
  if (pattern) {
    ctx.fillStyle = pattern;
    ctx.fillRect(0, 0, width, height);
  }
}

function drawVignette(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  edge: string,
): void {
  ctx.globalCompositeOperation = 'multiply';
  ctx.globalAlpha = 1;
  const radius = Math.hypot(width, height) / 2;
  const vignette = ctx.createRadialGradient(
    width / 2,
    height / 2,
    radius * 0.55,
    width / 2,
    height / 2,
    radius,
  );
  vignette.addColorStop(0, 'rgba(255,255,255,1)');
  vignette.addColorStop(1, edge);
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, width, height);
}

function applyFilm(ctx: CanvasRenderingContext2D, width: number, height: number): void {
  drawGrain(ctx, width, height, 0.11);
  ctx.globalCompositeOperation = 'soft-light';
  ctx.globalAlpha = 0.18;
  ctx.fillStyle = '#ff9a3c';
  ctx.fillRect(0, 0, width, height);
  drawVignette(ctx, width, height, 'rgba(120,105,95,1)');
}

/** Re-draw the canvas through a CSS filter without touching every pixel in JS. */
function bakeCssFilter(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  cssFilter: string,
): void {
  const copy = document.createElement('canvas');
  copy.width = width;
  copy.height = height;
  copy.getContext('2d')!.drawImage(ctx.canvas, 0, 0);
  ctx.filter = cssFilter;
  ctx.drawImage(copy, 0, 0);
  ctx.filter = 'none';
}

function applyNoir(ctx: CanvasRenderingContext2D, width: number, height: number): void {
  bakeCssFilter(ctx, width, height, 'grayscale(1) contrast(1.08)');
  drawGrain(ctx, width, height, 0.16);
  ctx.globalCompositeOperation = 'soft-light';
  ctx.globalAlpha = 0.12;
  ctx.fillStyle = '#8a8a8a';
  ctx.fillRect(0, 0, width, height);
  drawVignette(ctx, width, height, 'rgba(40,40,40,1)');
}

function applySepia(ctx: CanvasRenderingContext2D, width: number, height: number): void {
  bakeCssFilter(ctx, width, height, 'sepia(0.92) contrast(1.04)');
  drawGrain(ctx, width, height, 0.1);
  drawVignette(ctx, width, height, 'rgba(90,70,45,1)');
}

function applyVivid(ctx: CanvasRenderingContext2D, width: number, height: number): void {
  ctx.globalCompositeOperation = 'saturation';
  ctx.globalAlpha = 0.55;
  ctx.fillStyle = '#ff0088';
  ctx.fillRect(0, 0, width, height);

  ctx.globalCompositeOperation = 'soft-light';
  ctx.globalAlpha = 0.22;
  ctx.fillStyle = '#ffcc66';
  ctx.fillRect(0, 0, width, height);

  ctx.globalCompositeOperation = 'overlay';
  ctx.globalAlpha = 0.12;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
}

function applyCool(ctx: CanvasRenderingContext2D, width: number, height: number): void {
  drawGrain(ctx, width, height, 0.08);
  ctx.globalCompositeOperation = 'soft-light';
  ctx.globalAlpha = 0.28;
  ctx.fillStyle = '#4a8fd4';
  ctx.fillRect(0, 0, width, height);

  ctx.globalCompositeOperation = 'color';
  ctx.globalAlpha = 0.14;
  ctx.fillStyle = '#6eb0e0';
  ctx.fillRect(0, 0, width, height);

  drawVignette(ctx, width, height, 'rgba(70,90,120,1)');
}

/**
 * Bakes the selected filter into a captured frame so Drive photos match the
 * live viewfinder treatment.
 */
export function applyCameraFilter(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  filterId: FilterId,
): void {
  if (filterId === 'off') return;

  ctx.save();
  switch (filterId) {
    case 'film':
      applyFilm(ctx, width, height);
      break;
    case 'noir':
      applyNoir(ctx, width, height);
      break;
    case 'sepia':
      applySepia(ctx, width, height);
      break;
    case 'vivid':
      applyVivid(ctx, width, height);
      break;
    case 'cool':
      applyCool(ctx, width, height);
      break;
  }
  ctx.restore();
}
