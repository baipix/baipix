import { ditherSecond } from '../dither';
import type { Color } from '../color';
import type { Point } from '../math';
import { isDoubledCorner } from '../raster';
import { followPointer, mirrorsOf, pixelIndex, setPixel, stamp, straightLine, strokeColors } from './paint';
import type { Stroke, Tool } from './types';

/** Paints at `p`; with `fill` (or the lassoFill option), also records the path to fill at the end. */
function paint(s: Stroke, p: Point, fill = s.options.lassoFill): void {
  const [c1, c2] = strokeColors(s);
  if (s.options.pixelPerfect && s.options.size === 1 && !s.customBrush) {
    const n = s.trail.length;
    if (n && s.trail[n - 1].x === p.x && s.trail[n - 1].y === p.y) return;
    // How many times the stroke went through each pixel: a corner it drew earlier too (a scribble
    // crossing itself) stays, instead of leaving a hole in what it drew.
    const passes = (s.scratch.passes ??= new Uint16Array(s.doc.width * s.doc.height)) as Uint16Array;
    const at = (q: Point) =>
      q.x >= 0 && q.y >= 0 && q.x < s.doc.width && q.y < s.doc.height ? q.y * s.doc.width + q.x : -1;
    if (n >= 2 && isDoubledCorner(s.trail[n - 2], s.trail[n - 1], p)) {
      const corner = s.trail.pop()!;
      const k = at(corner);
      if (k < 0 || --passes[k] === 0)
        for (const m of mirrorsOf(s, corner.x, corner.y)) {
          const i = pixelIndex(s, m.x, m.y);
          if (i >= 0) s.layer.pixels[i] = s.base[i];
        }
    }
    const k = at(p);
    if (k >= 0) passes[k]++;
    s.trail.push(p);
  }
  if (s.customBrush) stampBrush(s, p, c1, c2);
  else stamp(s, p.x, p.y, c1, c2, s.options.dither);
  if (fill) ((s.scratch.path as Point[] | undefined) ?? (s.scratch.path = [])).push(p);
}

/**
 * A custom brush, centered on `p`: its own colors, or its shape in the stroke's colors (stencil),
 * mirrored pixel by pixel like any stroke.
 */
function stampBrush(s: Stroke, p: Point, c1: Color, c2: Color): void {
  const b = s.customBrush!;
  const ox = Math.floor((b.width - 1) / 2);
  const oy = Math.floor((b.height - 1) / 2);
  for (let by = 0; by < b.height; by++)
    for (let bx = 0; bx < b.width; bx++) {
      const c = b.pixels[by * b.width + bx];
      if (!(c >>> 24)) continue;
      const x = p.x - ox + bx;
      const y = p.y - oy + by;
      const color = s.options.brushOwnColors
        ? c
        : s.options.dither && ditherSecond(s.options.ditherPattern, x, y)
          ? c2
          : c1;
      for (const m of mirrorsOf(s, x, y)) setPixel(s, m.x, m.y, color);
    }
}

/**
 * Lasso fill: closes the stroke back to its start and fills the pixels whose centers lie inside
 * (even-odd rule), with the stroke's colors and dithering, mirrored like the stroke.
 */
function fillPath(s: Stroke): void {
  const path = s.scratch.path as Point[] | undefined;
  if (!path || path.length < 3) return;
  const [c1, c2] = strokeColors(s);
  const paintAt = (x: number, y: number) => {
    const color = s.options.dither && ditherSecond(s.options.ditherPattern, x, y) ? c2 : c1;
    for (const m of mirrorsOf(s, x, y)) setPixel(s, m.x, m.y, color);
  };
  // The outline itself, corners included (pixel-perfect removes some while drawing): a solid shape.
  for (const q of path) paintAt(q.x, q.y);
  const ys = path.map((q) => q.y);
  const top = Math.max(0, Math.min(...ys));
  const bottom = Math.min(s.doc.height - 1, Math.max(...ys));
  for (let y = top; y <= bottom; y++) {
    const cy = y + 0.5;
    const xs: number[] = [];
    for (let i = 0; i < path.length; i++) {
      const a = path[i];
      const b = path[(i + 1) % path.length];
      const ay = a.y + 0.5;
      const by = b.y + 0.5;
      if (ay <= cy !== by <= cy) xs.push(a.x + 0.5 + ((cy - ay) * (b.x - a.x)) / (by - ay));
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const from = Math.max(0, Math.ceil(xs[k] - 0.5));
      const to = Math.min(s.doc.width - 1, Math.floor(xs[k + 1] - 0.5));
      for (let x = from; x <= to; x++) paintAt(x, y);
    }
  }
}

export const pencil: Tool = {
  id: 'pencil',
  editsPixels: true,
  paintsColor: true,
  onDown: (s, p, mods) => {
    if (!straightLine(s, p, !!mods.snap, (q) => paint(s, q))) paint(s, p);
  },
  onMove: (s, p) => followPointer(s, p, (q) => paint(s, q)),
  onUp: (s) => fillPath(s),
};

/** The Lasso fill tool: draws like the Pencil, and always fills the shape when the stroke ends. */
export const lassoFillTool: Tool = {
  id: 'lassoFill',
  editsPixels: true,
  paintsColor: true,
  onDown: (s, p) => paint(s, p, true),
  onMove: (s, p) => followPointer(s, p, (q) => paint(s, q, true)),
  onUp: (s) => fillPath(s),
};
