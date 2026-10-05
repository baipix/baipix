import { alpha, type Color } from './color';
import { clipRect, type Rect } from './math';

/** A standalone block of pixels (clipboard, floating selection). */
export interface PixelBlock {
  width: number;
  height: number;
  pixels: Uint32Array;
}

export function extractBlock(pixels: Uint32Array, width: number, height: number, rect: Rect): PixelBlock {
  const r = clipRect(rect, width, height);
  const out = new Uint32Array(r.w * r.h);
  for (let y = 0; y < r.h; y++) {
    const start = (r.y + y) * width + r.x;
    out.set(pixels.subarray(start, start + r.w), y * r.w);
  }
  return { width: r.w, height: r.h, pixels: out };
}

export function fillRect(pixels: Uint32Array, width: number, height: number, rect: Rect, color: Color): void {
  const r = clipRect(rect, width, height);
  for (let y = r.y; y < r.y + r.h; y++) pixels.fill(color, y * width + r.x, y * width + r.x + r.w);
}

/** Stamps a block at (x, y). Transparent pixels of the block are skipped unless `replace` is set. */
export function stampBlock(
  pixels: Uint32Array,
  width: number,
  height: number,
  block: PixelBlock,
  x: number,
  y: number,
  replace = false,
): void {
  for (let by = 0; by < block.height; by++) {
    const ty = y + by;
    if (ty < 0 || ty >= height) continue;
    for (let bx = 0; bx < block.width; bx++) {
      const tx = x + bx;
      if (tx < 0 || tx >= width) continue;
      const c = block.pixels[by * block.width + bx];
      if (replace || alpha(c)) pixels[ty * width + tx] = c;
    }
  }
}

export function flipRect(
  pixels: Uint32Array,
  width: number,
  height: number,
  rect: Rect,
  horizontal: boolean,
): void {
  const r = clipRect(rect, width, height);
  if (horizontal) {
    for (let y = r.y; y < r.y + r.h; y++) {
      for (let i = 0; i < r.w >> 1; i++) {
        const a = y * width + r.x + i;
        const b = y * width + r.x + r.w - 1 - i;
        [pixels[a], pixels[b]] = [pixels[b], pixels[a]];
      }
    }
  } else {
    for (let j = 0; j < r.h >> 1; j++) {
      for (let x = r.x; x < r.x + r.w; x++) {
        const a = (r.y + j) * width + x;
        const b = (r.y + r.h - 1 - j) * width + x;
        [pixels[a], pixels[b]] = [pixels[b], pixels[a]];
      }
    }
  }
}

/**
 * Rotates the pixels of `rect` by 90° clockwise around its center. Returns the rotated area
 * (clipped to the canvas); pixels pushed off canvas are lost, like when moving.
 */
export function rotateRect(
  pixels: Uint32Array,
  width: number,
  height: number,
  rect: Rect,
  clockwise = true,
): Rect {
  const r = clipRect(rect, width, height);
  const block = extractBlock(pixels, width, height, r);
  fillRect(pixels, width, height, r, 0);
  const x0 = r.x + Math.floor((r.w - r.h) / 2);
  const y0 = r.y + Math.floor((r.h - r.w) / 2);
  for (let j = 0; j < r.h; j++)
    for (let i = 0; i < r.w; i++) {
      // Clockwise: column i becomes row i, row j becomes column (h - 1 - j).
      // Counterclockwise: column i becomes row (w - 1 - i), row j becomes column j.
      const x = clockwise ? x0 + r.h - 1 - j : x0 + j;
      const y = clockwise ? y0 + i : y0 + r.w - 1 - i;
      if (x >= 0 && x < width && y >= 0 && y < height) pixels[y * width + x] = block.pixels[j * r.w + i];
    }
  return clipRect({ x: x0, y: y0, w: r.h, h: r.w }, width, height);
}

/** Unique opaque colors of a buffer, at most `limit`. */
export function uniqueColors(pixels: Uint32Array, limit = 256): Color[] {
  const set = new Set<Color>();
  for (const c of pixels) {
    if (alpha(c)) set.add((c | 0xff000000) >>> 0);
    if (set.size >= limit) break;
  }
  return [...set];
}

/** Smallest rectangle holding every non-transparent pixel, or null when there is none. */
export function pixelBounds(pixels: Uint32Array, width: number, height: number): Rect | null {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) {
      if (!(pixels[row + x] >>> 24)) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      maxY = y;
    }
  }
  return maxX < 0 ? null : { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

/** Resizes a block with nearest-neighbor sampling, so pixel art stays sharp. */
export function scaleBlock(block: PixelBlock, width: number, height: number): PixelBlock {
  const w = Math.max(1, Math.round(width));
  const h = Math.max(1, Math.round(height));
  const out = new Uint32Array(w * h);
  for (let y = 0; y < h; y++) {
    const sy = Math.min(block.height - 1, Math.floor(((y + 0.5) * block.height) / h));
    for (let x = 0; x < w; x++) {
      const sx = Math.min(block.width - 1, Math.floor(((x + 0.5) * block.width) / w));
      out[y * w + x] = block.pixels[sy * block.width + sx];
    }
  }
  return { width: w, height: h, pixels: out };
}
