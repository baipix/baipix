import type { Color } from './color';
import { clipRect, type Point, type Rect } from './math';
import { floodFill } from './raster';
import type { PixelBlock } from './region';

/**
 * A selection: a rectangle, and for the lasso and the magic wand a mask of the pixels selected in
 * it (row by row, 1: selected), so any shape can be selected. Everything that only needs a box
 * (handles, cropping, the move frame) keeps using the rectangle.
 */
export interface Selection extends Rect {
  /** w × h, relative to the rectangle. Missing: all of it is selected. */
  mask?: Uint8Array;
}

/** Whether canvas pixel (x, y) is selected; no selection means everything is. */
export function inSelection(sel: Selection | null, x: number, y: number): boolean {
  if (!sel) return true;
  const i = x - sel.x;
  const j = y - sel.y;
  if (i < 0 || j < 0 || i >= sel.w || j >= sel.h) return false;
  return !sel.mask || sel.mask[j * sel.w + i] === 1;
}

/** A selection from a mask over the whole canvas, cropped to what's in it; null when it's empty. */
export function fromCanvasMask(mask: Uint8Array, width: number, height: number): Selection | null {
  let x0 = width;
  let y0 = height;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++)
      if (mask[y * width + x]) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
  if (x1 < 0) return null;
  const w = x1 - x0 + 1;
  const h = y1 - y0 + 1;
  const local = new Uint8Array(w * h);
  let full = true;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const v = mask[(y0 + y) * width + x0 + x];
      local[y * w + x] = v;
      if (!v) full = false;
    }
  // A plain rectangle needs no mask.
  return full ? { x: x0, y: y0, w, h } : { x: x0, y: y0, w, h, mask: local };
}

/** The selection as a mask over the whole canvas. */
export function toCanvasMask(sel: Selection | null, width: number, height: number): Uint8Array {
  const out = new Uint8Array(width * height);
  if (!sel) return out;
  for (let y = Math.max(0, sel.y); y < Math.min(height, sel.y + sel.h); y++)
    for (let x = Math.max(0, sel.x); x < Math.min(width, sel.x + sel.w); x++)
      if (inSelection(sel, x, y)) out[y * width + x] = 1;
  return out;
}

/** The selection cut to the canvas, its mask too. Null when nothing of it is left. */
export function clipSelection(sel: Selection, width: number, height: number): Selection | null {
  const r = clipRect(sel, width, height);
  if (!r.w || !r.h) return null;
  if (!sel.mask) return r;
  return fromCanvasMask(toCanvasMask(sel, width, height), width, height);
}

/**
 * The pixels inside a closed polygon (the lasso's path, in canvas pixels), the path itself
 * included. Even-odd rule on pixel centers, row by row.
 */
export function polygonMask(points: Point[], width: number, height: number): Uint8Array {
  const mask = new Uint8Array(width * height);
  if (!points.length) return mask;
  for (let y = 0; y < height; y++) {
    const cy = y + 0.5;
    const xs: number[] = [];
    for (let k = 0; k < points.length; k++) {
      const a = points[k];
      const b = points[(k + 1) % points.length];
      const ay = a.y + 0.5;
      const by = b.y + 0.5;
      if (ay <= cy === by <= cy) continue;
      xs.push(a.x + 0.5 + ((cy - ay) / (by - ay)) * (b.x - a.x));
    }
    xs.sort((p, q) => p - q);
    for (let k = 0; k + 1 < xs.length; k += 2)
      for (
        let x = Math.max(0, Math.ceil(xs[k] - 0.5));
        x <= Math.min(width - 1, Math.floor(xs[k + 1] - 0.5));
        x++
      )
        mask[y * width + x] = 1;
  }
  // The path's own pixels, so a thin lasso still selects what it went over.
  for (let k = 0; k < points.length; k++) {
    const a = points[k];
    const b = points[(k + 1) % points.length];
    const n = Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y), 1);
    for (let s = 0; s <= n; s++) {
      const x = Math.round(a.x + ((b.x - a.x) * s) / n);
      const y = Math.round(a.y + ((b.y - a.y) * s) / n);
      if (x >= 0 && y >= 0 && x < width && y < height) mask[y * width + x] = 1;
    }
  }
  return mask;
}

/** The magic wand: pixels of the same color as (x, y), touching it or anywhere on the canvas. */
export function colorMask(
  pixels: Uint32Array,
  width: number,
  height: number,
  x: number,
  y: number,
  contiguous: boolean,
): Uint8Array {
  const mask = new Uint8Array(width * height);
  if (x < 0 || y < 0 || x >= width || y >= height) return mask;
  if (contiguous) floodFill(pixels, width, height, x, y, (i) => (mask[i] = 1));
  else {
    const target: Color = pixels[y * width + x];
    // Every fully transparent pixel counts as the same "color".
    const same = (c: Color) => c === target || (!(c >>> 24) && !(target >>> 24));
    for (let i = 0; i < pixels.length; i++) if (same(pixels[i])) mask[i] = 1;
  }
  return mask;
}

/** How a new selection combines with the one there: Shift adds to it, Alt takes from it. */
export type SelectMode = 'replace' | 'add' | 'subtract';

export function combine(
  current: Selection | null,
  next: Uint8Array,
  mode: SelectMode,
  width: number,
  height: number,
): Selection | null {
  if (mode === 'replace' || (!current && mode === 'add')) return fromCanvasMask(next, width, height);
  if (!current) return null;
  const mask = toCanvasMask(current, width, height);
  for (let i = 0; i < mask.length; i++)
    mask[i] = mode === 'add' ? mask[i] | next[i] : mask[i] & (1 - next[i]);
  return fromCanvasMask(mask, width, height);
}

/** Empties the pixels of a block that aren't selected (the block being the selection's rectangle). */
export function maskBlock(block: PixelBlock, sel: Selection): PixelBlock {
  if (!sel.mask || block.width !== sel.w || block.height !== sel.h) return block;
  const pixels = block.pixels.slice();
  for (let i = 0; i < pixels.length; i++) if (!sel.mask[i]) pixels[i] = 0;
  return { ...block, pixels };
}

/** Writes `color` on the selected pixels (or the whole canvas without a selection). */
export function fillSelection(
  pixels: Uint32Array,
  width: number,
  height: number,
  sel: Selection | null,
  color: Color,
): void {
  const r = sel ? clipRect(sel, width, height) : { x: 0, y: 0, w: width, h: height };
  for (let y = r.y; y < r.y + r.h; y++)
    for (let x = r.x; x < r.x + r.w; x++) if (inSelection(sel, x, y)) pixels[y * width + x] = color;
}

/** The mask flipped like the pixels in its rectangle. */
export function flipMask(sel: Selection, horizontal: boolean): Selection {
  if (!sel.mask) return sel;
  const { w, h, mask } = sel;
  const out = new Uint8Array(mask.length);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      out[y * w + x] = horizontal ? mask[y * w + (w - 1 - x)] : mask[(h - 1 - y) * w + x];
  return { ...sel, mask: out };
}

/** The mask turned by 90° like the pixels, onto the rotated rectangle `to` (h × w). */
export function rotateMask(sel: Selection, to: Rect, clockwise: boolean): Selection {
  // Cut by the canvas edge: the shape no longer lines up, the rectangle stays.
  if (!sel.mask || to.w !== sel.h || to.h !== sel.w) return to;
  const { w, h, mask } = sel;
  const out = new Uint8Array(w * h);
  for (let j = 0; j < h; j++)
    for (let i = 0; i < w; i++) {
      // Same mapping as rotateRect: the new rectangle is h wide and w tall.
      const x = clockwise ? h - 1 - j : j;
      const y = clockwise ? i : w - 1 - i;
      out[y * h + x] = mask[j * w + i];
    }
  return { ...to, mask: out };
}

/** The mask scaled to w × h, nearest neighbor, like the pixels it goes with. */
export function scaleMask(sel: Selection, to: Rect): Selection {
  if (!sel.mask) return to;
  const out = new Uint8Array(to.w * to.h);
  for (let y = 0; y < to.h; y++)
    for (let x = 0; x < to.w; x++)
      out[y * to.w + x] = sel.mask[Math.floor((y * sel.h) / to.h) * sel.w + Math.floor((x * sel.w) / to.w)];
  return { ...to, mask: out };
}
