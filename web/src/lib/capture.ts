/** Longest edge of the saved photo. Keeps party uploads to a few MB each. */
const MAX_EDGE = 2560;
const JPEG_QUALITY = 0.9;

export interface CaptureOptions {
  dateStamp: boolean;
  filmLook: boolean;
}

let noiseTile: HTMLCanvasElement | null = null;

/**
 * Pre-renders a tile of monochrome noise once. Perturbing every pixel of a
 * 12-megapixel frame in JavaScript is far too slow for a responsive shutter,
 * so the grain is composited as a repeating pattern instead.
 */
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

function applyFilmLook(ctx: CanvasRenderingContext2D, width: number, height: number): void {
  ctx.save();

  ctx.globalCompositeOperation = 'overlay';
  ctx.globalAlpha = 0.11;
  const pattern = ctx.createPattern(getNoiseTile(), 'repeat');
  if (pattern) {
    ctx.fillStyle = pattern;
    ctx.fillRect(0, 0, width, height);
  }

  // Warm the midtones the way cheap consumer film stock does.
  ctx.globalCompositeOperation = 'soft-light';
  ctx.globalAlpha = 0.18;
  ctx.fillStyle = '#ff9a3c';
  ctx.fillRect(0, 0, width, height);

  // Vignette from a plastic lens.
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
  vignette.addColorStop(1, 'rgba(120,105,95,1)');
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, width, height);

  ctx.restore();
}

/** The orange date burn-in that every disposable camera stamped on the negative. */
function drawDateStamp(ctx: CanvasRenderingContext2D, width: number, height: number): void {
  const now = new Date();
  const text = `${now.getFullYear()} ${now.getMonth() + 1} ${String(now.getDate()).padStart(2, '0')}`;
  const fontSize = Math.round(Math.min(width, height) * 0.045);
  const margin = Math.round(fontSize * 0.9);

  ctx.save();
  ctx.font = `600 ${fontSize}px "Courier New", ui-monospace, monospace`;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'bottom';
  ctx.shadowColor = 'rgba(255, 94, 0, 0.9)';
  ctx.shadowBlur = fontSize * 0.5;
  ctx.fillStyle = '#ff8412';
  ctx.fillText(text, width - margin, height - margin);
  // Second pass brightens the core of the glyphs like a real LED burn.
  ctx.shadowBlur = fontSize * 0.18;
  ctx.fillStyle = '#ffc46b';
  ctx.fillText(text, width - margin, height - margin);
  ctx.restore();
}

/**
 * Grabs the current video frame and returns it as a JPEG, with the disposable
 * camera treatment baked in so the photo in Drive looks the part.
 */
export async function captureFrame(
  video: HTMLVideoElement,
  options: CaptureOptions,
): Promise<Blob> {
  const sourceWidth = video.videoWidth;
  const sourceHeight = video.videoHeight;
  if (!sourceWidth || !sourceHeight) {
    throw new Error('The camera is not ready yet.');
  }

  const scale = Math.min(1, MAX_EDGE / Math.max(sourceWidth, sourceHeight));
  const width = Math.round(sourceWidth * scale);
  const height = Math.round(sourceHeight * scale);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) throw new Error('This browser cannot process the photo.');

  ctx.drawImage(video, 0, 0, width, height);
  if (options.filmLook) applyFilmLook(ctx, width, height);
  if (options.dateStamp) drawDateStamp(ctx, width, height);

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY),
  );
  if (!blob) throw new Error('Could not save the photo.');
  return blob;
}
