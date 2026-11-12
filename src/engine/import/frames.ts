import { createDocument, MAX_SIZE, type PixelDoc } from '../document';
import {
  clampDuration,
  createFrame,
  DEFAULT_DURATION,
  MAX_FRAMES,
  normalizeFrames,
  type Cel,
} from '../frames';

export const MIN_SPRITE_SHEET_SIDE = 8;

export interface ImportedFrame {
  pixels: Uint32Array;
  duration: number;
}

/** Checks whether two pixel buffers contain identical packed colors. */
export function samePixels(a: Uint32Array, b: Uint32Array): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

/** Slices a raster sprite sheet row-major into `cols * rows` cells of `cellWidth × cellHeight`. */
export function sliceSpriteSheet(
  pixels: Uint32Array,
  width: number,
  height: number,
  cellWidth: number,
  cellHeight: number,
  cols: number,
  rows: number,
): Uint32Array[] {
  if (!Number.isInteger(cellWidth) || !Number.isInteger(cellHeight) || cellWidth < 1 || cellHeight < 1) {
    throw new Error('Cell size must be positive integers.');
  }
  if (!Number.isInteger(cols) || !Number.isInteger(rows) || cols < 1 || rows < 1) {
    throw new Error('Columns and rows must be positive integers.');
  }
  if (cols * cellWidth > width || rows * cellHeight > height) {
    throw new Error('Sprite sheet grid exceeds the image dimensions.');
  }

  const total = Math.min(cols * rows, MAX_FRAMES);
  const frames: Uint32Array[] = [];
  for (let i = 0; i < total; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const cell = new Uint32Array(cellWidth * cellHeight);
    const ox = col * cellWidth;
    const oy = row * cellHeight;
    for (let y = 0; y < cellHeight; y++) {
      const srcStart = (oy + y) * width + ox;
      cell.set(pixels.subarray(srcStart, srcStart + cellWidth), y * cellWidth);
    }
    frames.push(cell);
  }
  return frames;
}

/** Computes target dimensions fitting within `maxSide` while preserving aspect ratio. */
export function fitMaxSide(
  width: number,
  height: number,
  maxSide = MAX_SIZE,
): { width: number; height: number; scaled: boolean } {
  const scale = Math.min(1, maxSide / Math.max(width, height));
  if (scale >= 1) return { width, height, scaled: false };
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
    scaled: true,
  };
}

/** Resamples a pixel block with nearest-neighbor sampling to fit exact pixel grids cleanly. */
export function resizeBlockNearest(
  pixels: Uint32Array,
  width: number,
  height: number,
  targetWidth: number,
  targetHeight: number,
): Uint32Array {
  if (width === targetWidth && height === targetHeight) return pixels.slice();
  const out = new Uint32Array(targetWidth * targetHeight);
  for (let y = 0; y < targetHeight; y++) {
    const sy = Math.min(height - 1, Math.floor((y * height) / targetHeight));
    const srcRow = sy * width;
    const dstRow = y * targetWidth;
    for (let x = 0; x < targetWidth; x++) {
      const sx = Math.min(width - 1, Math.floor((x * width) / targetWidth));
      out[dstRow + x] = pixels[srcRow + sx];
    }
  }
  return out;
}

/** Builds a single- or multi-frame `PixelDoc` from decoded frames or sliced sprite-sheet cells. */
export function createAnimatedDocument(
  name: string,
  width: number,
  height: number,
  frames: readonly ImportedFrame[],
  layerName = 'Layer 1',
): PixelDoc {
  const usable = frames.slice(0, MAX_FRAMES);
  const doc = createDocument(name, width, height, layerName);
  if (!usable.length) return doc;

  doc.layers[0].pixels.set(usable[0].pixels);
  if (usable.length > 1) {
    doc.frames = usable.map((f) => createFrame(clampDuration(f.duration || DEFAULT_DURATION)));
    doc.activeFrame = 0;
    const cels: (Cel | null)[] = [null];
    for (let i = 1; i < usable.length; i++) {
      const prevPixels = i === 1 ? doc.layers[0].pixels : cels[i - 1]!.pixels;
      if (samePixels(usable[i].pixels, prevPixels)) {
        // Linked cel: shares the pixel buffer with the earlier identical frame.
        cels.push({ pixels: prevPixels });
      } else {
        cels.push({ pixels: usable[i].pixels.slice() });
      }
    }
    doc.layers[0].cels = cels;
    normalizeFrames(doc);
  }
  return doc;
}
