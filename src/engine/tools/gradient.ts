import type { Color } from '../color';
import { gradientColor, gradientT, sortedStops, type GradientStop } from '../gradient';
import { rectContains, type Point } from '../math';
import { constrainAngle, floodFill } from '../raster';
import type { Stroke, Tool, ToolOptions } from './types';

/** The stops to paint with: the ones set in the options, or the primary color to the secondary. */
export function stopsOf(options: ToolOptions, primary: Color, secondary: Color): GradientStop[] {
  return sortedStops(
    options.gradientStops ?? [
      { at: 0, color: primary },
      { at: 1, color: secondary },
    ],
  );
}

/**
 * The pixels a gradient fills, as a mask: the selection if there is one, else the whole layer
 * when asked, else the area of the same color under `p`, like the bucket.
 */
export function gradientArea(s: Stroke, p: Point): Uint8Array {
  const { width, height } = s.doc;
  const mask = new Uint8Array(width * height);
  const inside = (x: number, y: number) => rectContains(s.selection, x, y);
  const outOfCanvas = p.x < 0 || p.y < 0 || p.x >= width || p.y >= height;
  if (s.selection || s.options.gradientLayer || outOfCanvas) {
    for (let i = 0; i < mask.length; i++) if (inside(i % width, (i / width) | 0)) mask[i] = 1;
  } else floodFill(s.base, width, height, p.x, p.y, (i) => (mask[i] = 1), inside);
  return mask;
}

/** Paints a gradient from `a` to `b` over `base`, in the pixels of `mask`. */
export function paintGradient(
  pixels: Uint32Array,
  base: Uint32Array,
  mask: Uint8Array,
  width: number,
  options: ToolOptions,
  stops: GradientStop[],
  a: Point,
  b: Point,
): void {
  pixels.set(base);
  const shape = options.gradientShape;
  for (let i = 0; i < mask.length; i++) {
    if (!mask[i]) continue;
    const x = i % width;
    const y = (i / width) | 0;
    pixels[i] = gradientColor(stops, gradientT(shape, a, b, x, y), options.gradientDither, x, y);
  }
}

/**
 * Drag from where the gradient starts to where it ends (Shift: in steps of 45°). It's redrawn from
 * the original pixels on every move, so it shows live; nothing happens without a drag.
 */
export const gradientTool: Tool = {
  id: 'gradient',
  editsPixels: true,
  onDown(s, p) {
    s.scratch.mask = gradientArea(s, p);
  },
  onMove(s, p, mods) {
    const b = mods.shift ? constrainAngle(s.start, p) : p;
    s.scratch.end = b;
    if (b.x === s.start.x && b.y === s.start.y) {
      s.layer.pixels.set(s.base);
      return;
    }
    const stops = stopsOf(s.options, s.primaryColor, s.secondaryColor);
    paintGradient(
      s.layer.pixels,
      s.base,
      s.scratch.mask as Uint8Array,
      s.doc.width,
      s.options,
      stops,
      s.start,
      b,
    );
  },
};
