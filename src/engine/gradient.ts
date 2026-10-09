import type { Color } from './color';
import type { Point } from './math';

/**
 * Gradients the pixel art way: every pixel takes the color of a stop, never a color in between.
 * Between two stops, dithering decides which of the two a pixel gets, so a fade is a pattern of
 * real palette colors.
 */
export type GradientShape = 'linear' | 'radial' | 'angular' | 'diamond';
export const GRADIENT_SHAPES: GradientShape[] = ['linear', 'radial', 'angular', 'diamond'];

/** Bayer: a smooth fade in 16 steps. Checker: a harder one, half and half in the middle. None: bands. */
export type GradientDither = 'bayer' | 'checker' | 'none';
export const GRADIENT_DITHERS: GradientDither[] = ['bayer', 'checker', 'none'];

export interface GradientStop {
  /** Where along the gradient, 0 to 1. */
  at: number;
  /** A palette color, or 0 (transparent) to fade out. */
  color: Color;
}

/** The 4×4 Bayer matrix: the order in which pixels switch over as a fade goes along. */
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

/**
 * Where a pixel is along a gradient from `a` to `b`, 0 to 1 (pixel centers, so a gradient drawn
 * between two pixels starts and ends on them).
 */
export function gradientT(shape: GradientShape, a: Point, b: Point, x: number, y: number): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length2 = dx * dx + dy * dy;
  if (!length2) return 0;
  const px = x - a.x;
  const py = y - a.y;
  let t: number;
  switch (shape) {
    case 'radial':
      t = Math.sqrt((px * px + py * py) / length2);
      break;
    case 'angular': {
      // Once around, starting in the direction of `b`.
      const turn = (Math.atan2(py, px) - Math.atan2(dy, dx)) / (2 * Math.PI);
      return turn - Math.floor(turn);
    }
    case 'diamond': {
      // A square turned to point at `b`: distance along the direction plus across it.
      const length = Math.sqrt(length2);
      t = (Math.abs(px * dx + py * dy) + Math.abs(px * dy - py * dx)) / length / length;
      break;
    }
    default:
      t = (px * dx + py * dy) / length2;
  }
  return Math.min(1, Math.max(0, t));
}

/** Stops read back from saved preferences: 2 to 16 valid ones, or null (the default gradient). */
export function cleanStops(raw: unknown): GradientStop[] | null {
  if (!Array.isArray(raw)) return null;
  const stops = raw
    .filter(
      (s): s is GradientStop =>
        !!s && typeof s.at === 'number' && Number.isFinite(s.at) && typeof s.color === 'number',
    )
    .slice(0, 16)
    .map((s) => ({ at: Math.min(1, Math.max(0, s.at)), color: s.color >>> 0 }));
  return stops.length >= 2 ? stops : null;
}

/** The stops in order, at least two (a single one is a plain color). */
export function sortedStops(stops: GradientStop[]): GradientStop[] {
  const sorted = [...stops].sort((p, q) => p.at - q.at);
  return sorted.length === 1 ? [sorted[0], sorted[0]] : sorted;
}

/** The color at `t` for the pixel (x, y): one of the two stops around `t`, picked by the dithering. */
export function gradientColor(
  stops: GradientStop[],
  t: number,
  dither: GradientDither,
  x: number,
  y: number,
): Color {
  if (!stops.length) return 0;
  if (t <= stops[0].at) return stops[0].color;
  for (let k = 1; k < stops.length; k++) {
    const to = stops[k];
    if (t > to.at) continue;
    const from = stops[k - 1];
    const f = to.at > from.at ? (t - from.at) / (to.at - from.at) : 1;
    switch (dither) {
      case 'none':
        return f < 0.5 ? from.color : to.color;
      case 'checker':
        if (f < 1 / 3) return from.color;
        if (f > 2 / 3) return to.color;
        return ((x + y) & 1) === 1 ? to.color : from.color;
      default:
        return f * 16 > BAYER[(y & 3) * 4 + (x & 3)] + 0.5 ? to.color : from.color;
    }
  }
  return stops[stops.length - 1].color;
}
