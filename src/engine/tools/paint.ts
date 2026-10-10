import { inSelection } from '../selection';
import { alpha, type Color } from '../color';
import { blendOver } from '../composite';
import { ditherSecond } from '../dither';
import type { Point } from '../math';
import { mirrorAxes } from '../document';
import { brush, line, mirrored } from '../raster';
import type { Stroke } from './types';

export const inBounds = (s: Stroke, x: number, y: number): boolean =>
  x >= 0 && y >= 0 && x < s.doc.width && y < s.doc.height;

const mod = (a: number, n: number) => ((a % n) + n) % n;

/**
 * Where a painted pixel lands: its index on the canvas, or -1 when it falls outside (or outside
 * the selection). In tile preview, strokes wrap around: past an edge they continue on the
 * opposite side, so seamless textures are easy to draw.
 */
export function pixelIndex(s: Stroke, x: number, y: number): number {
  const { width, height } = s.doc;
  if (s.wrap) {
    x = mod(x, width);
    y = mod(y, height);
  } else if (x < 0 || y < 0 || x >= width || y >= height) return -1;
  return inSelection(s.selection, x, y) ? y * width + x : -1;
}

/**
 * Writes a pixel if it lies on the canvas and inside the selection. With the `blend` option, a
 * semi-transparent color mixes with the pixel as it was when the stroke started, so going over the
 * same spot twice in one stroke doesn't build it up. Fully transparent (the Eraser) always clears:
 * blended, it would leave the pixel as it was.
 */
export function setPixel(s: Stroke, x: number, y: number, color: Color): void {
  const i = pixelIndex(s, x, y);
  if (i < 0) return;
  const a = alpha(color);
  s.layer.pixels[i] = s.options.blend && a > 0 && a < 255 ? blendOver(color, s.base[i]) : color;
}

/** Every mirrored copy of a single pixel. */
export const mirrorsOf = (s: Stroke, x: number, y: number): Point[] => {
  const axes = mirrorAxes(s.doc);
  return mirrored(x, y, axes.x, axes.y, s.mirrorX, s.mirrorY);
};

/**
 * Paints the brush footprint at (cx, cy), with symmetry. With `dither`, pixels alternate
 * between c1 and c2 in the dithering pattern (decided from the source pixel so mirrored copies match).
 */
export function stamp(
  s: Stroke,
  cx: number,
  cy: number,
  c1: Color,
  c2 = c1,
  dither = false,
  size = s.options.size,
): void {
  brush(
    cx,
    cy,
    size,
    (x, y) => {
      const color = dither && ditherSecond(s.options.ditherPattern, x, y) ? c2 : c1;
      for (const m of mirrorsOf(s, x, y)) setPixel(s, m.x, m.y, color);
    },
    s.options.roundTip,
  );
}

/** Calls `paint` for every pixel between the previous pointer position and `p` (excluding the previous one). */
export function followPointer(s: Stroke, p: Point, paint: (q: Point) => void): void {
  if (p.x === s.last.x && p.y === s.last.y) return;
  let first = true;
  line(s.last.x, s.last.y, p.x, p.y, (x, y) => {
    if (first) {
      first = false;
      return;
    }
    paint({ x, y });
  });
  s.last = p;
}

/** Runs `visit` once per pixel per stroke over the brush footprint (with symmetry). */
export function forEachBrushPixelOnce(
  s: Stroke,
  p: Point,
  visit: (index: number, x: number, y: number) => void,
): void {
  brush(
    p.x,
    p.y,
    s.options.size,
    (bx, by) => {
      for (const m of mirrorsOf(s, bx, by)) {
        const i = pixelIndex(s, m.x, m.y);
        if (i < 0 || s.visited[i]) continue;
        s.visited[i] = 1;
        visit(i, i % s.doc.width, Math.floor(i / s.doc.width));
      }
    },
    s.options.roundTip,
  );
}

export const strokeColors = (s: Stroke): [Color, Color] =>
  s.secondary ? [s.secondaryColor, s.primaryColor] : [s.primaryColor, s.secondaryColor];
