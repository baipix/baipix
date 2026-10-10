import { inSelection } from '../selection';
import { mirrorAxes } from '../document';
import type { Point } from '../math';
import { followPointer } from './paint';
import type { Stroke, Tool } from './types';

export type LiquifyMode = 'push' | 'expand' | 'shrink';

/**
 * The warp of one stroke: how far each pixel's content comes from, in pixels (dx, dy per pixel).
 * The layer is always redrawn from the stroke's original pixels through it, picking the nearest
 * source pixel, so the drawing stays sharp, keeps its exact colors and passes never degrade it.
 */
interface Warp {
  dx: Float32Array;
  dy: Float32Array;
}

const warpOf = (s: Stroke): Warp => {
  const n = s.doc.width * s.doc.height;
  return ((s.scratch.warp as Warp | undefined) ??= { dx: new Float32Array(n), dy: new Float32Array(n) });
};

/** The dab's center and its mirrored copies, each with how its directions flip. */
function centers(s: Stroke, p: Point): { x: number; y: number; fx: number; fy: number }[] {
  const out = [{ x: p.x + 0.5, y: p.y + 0.5, fx: 1, fy: 1 }];
  const axes = mirrorAxes(s.doc);
  const mx = 2 * axes.x - (p.x + 0.5);
  const my = 2 * axes.y - (p.y + 0.5);
  if (s.mirrorX) out.push({ x: mx, y: p.y + 0.5, fx: -1, fy: 1 });
  if (s.mirrorY) out.push({ x: p.x + 0.5, y: my, fx: 1, fy: -1 });
  if (s.mirrorX && s.mirrorY) out.push({ x: mx, y: my, fx: -1, fy: -1 });
  return out;
}

/**
 * One dab at `p`: adds to the warp around it (falling off to the brush edge), then redraws the
 * area from the original pixels. `move` is the pointer's step, which Push carries along.
 */
function dab(s: Stroke, p: Point, move: Point): void {
  const { width, height } = s.doc;
  const warp = warpOf(s);
  const mode = s.options.liquifyMode;
  const r = s.options.liquifySize / 2;
  const strength = s.options.liquifyStrength / 100;
  if (mode === 'push' && !move.x && !move.y) return;
  for (const c of centers(s, p)) {
    const x0 = Math.max(0, Math.floor(c.x - r));
    const x1 = Math.min(width - 1, Math.ceil(c.x + r));
    const y0 = Math.max(0, Math.floor(c.y - r));
    const y1 = Math.min(height - 1, Math.ceil(c.y + r));
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) {
        if (!inSelection(s.selection, x, y)) continue;
        const ox = x + 0.5 - c.x;
        const oy = y + 0.5 - c.y;
        const d = Math.hypot(ox, oy);
        if (d >= r) continue;
        const w = (1 - d / r) ** 2 * strength;
        const i = y * width + x;
        if (mode === 'push') {
          // The content follows the pointer: each pixel now shows what was a step behind it.
          warp.dx[i] += move.x * c.fx * w;
          warp.dy[i] += move.y * c.fy * w;
        } else if (d > 0) {
          // Expand shows what was nearer the center (content spreads out), Shrink what was farther.
          const k = (mode === 'expand' ? 1 : -1) * w * 0.35;
          warp.dx[i] += (ox / d) * k;
          warp.dy[i] += (oy / d) * k;
        }
      }
    redraw(s, warp, x0, y0, x1, y1);
  }
}

/** Redraws a rectangle of the layer from the original pixels, through the warp. */
function redraw(s: Stroke, warp: Warp, x0: number, y0: number, x1: number, y1: number): void {
  const { width, height } = s.doc;
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) {
      const i = y * width + x;
      const sx = Math.round(x - warp.dx[i]);
      const sy = Math.round(y - warp.dy[i]);
      s.layer.pixels[i] = sx >= 0 && sy >= 0 && sx < width && sy < height ? s.base[sy * width + sx] : 0;
    }
}

export const liquifyTool: Tool = {
  id: 'liquify',
  editsPixels: true,
  onDown: (s, p) => dab(s, p, { x: 0, y: 0 }),
  onMove: (s, p) => {
    // Holding still keeps Expand and Shrink going (the canvas repeats the last position).
    if (p.x === s.last.x && p.y === s.last.y) return dab(s, p, { x: 0, y: 0 });
    let prev = s.last;
    followPointer(s, p, (q) => {
      dab(s, q, { x: q.x - prev.x, y: q.y - prev.y });
      prev = q;
    });
  },
};
