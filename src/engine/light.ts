import { alpha } from './color';

/**
 * A board's light, to shade by: where it comes from, as an angle around the drawing in degrees
 * (0 from the right, 90 from the top, counterclockwise as on a compass rose), and how high it is
 * above the ground in degrees (low: long shadows, high: short ones). A guide only, like the grid:
 * nothing is painted with it, and it isn't exported.
 */
export interface BoardLight {
  angle: number;
  height: number;
  /** The direction drawn over the canvas, as faint parallel lines. */
  direction: boolean;
  /** The sides of the shapes facing the light tinted warm, the ones away from it cool. */
  sides: boolean;
}

/** How high a light can be: never flat on the ground, never straight above. */
export const LIGHT_HEIGHT = { min: 10, max: 80 };

/** A new light: from the top left, halfway up, the most common choice in pixel art. */
export const DEFAULT_LIGHT: BoardLight = { angle: 135, height: 45, direction: true, sides: true };

/** An angle in whole degrees from 0 to 359. */
export const normalizeAngle = (deg: number): number => ((Math.round(deg) % 360) + 360) % 360;

/** A light read from a file or set from the panel, made valid. */
export function readLight(value: unknown): BoardLight | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const l = value as Partial<BoardLight>;
  if (typeof l.angle !== 'number' || !Number.isFinite(l.angle)) return undefined;
  const height = typeof l.height === 'number' && Number.isFinite(l.height) ? l.height : DEFAULT_LIGHT.height;
  return {
    angle: normalizeAngle(l.angle),
    height: Math.min(LIGHT_HEIGHT.max, Math.max(LIGHT_HEIGHT.min, Math.round(height))),
    direction: l.direction !== false,
    sides: l.sides !== false,
  };
}

/** The unit step toward the light, in canvas pixels (y down). */
export function towardLight(angle: number): { x: number; y: number } {
  const a = (angle * Math.PI) / 180;
  return { x: Math.cos(a), y: -Math.sin(a) };
}

/** Lit side (1), shaded side (-1) or neither (0), for each pixel; see `lightSides`. */
export type Side = 1 | -1 | 0;

/**
 * Which pixels of the drawing are on a side facing the light and which on a side away from it:
 * a pixel whose neighbor toward the light is empty is lit, one whose neighbor away from it is
 * empty is shaded. Diagonal light looks at both of its axes, so a staircase edge is lit along
 * its whole length. Thin parts, empty on both sides, count as lit.
 */
export function lightSides(pixels: Uint32Array, width: number, height: number, angle: number): Int8Array {
  const out = new Int8Array(width * height);
  const { x: dx, y: dy } = towardLight(angle);
  // An axis counts when the light leans enough along it (more than about 22° off the other axis).
  const sx = Math.abs(dx) > 0.38 ? Math.sign(dx) : 0;
  const sy = Math.abs(dy) > 0.38 ? Math.sign(dy) : 0;
  const empty = (x: number, y: number) =>
    x < 0 || y < 0 || x >= width || y >= height || !alpha(pixels[y * width + x]);
  const open = (x: number, y: number, k: number) =>
    (sx !== 0 && empty(x + k * sx, y)) || (sy !== 0 && empty(x, y + k * sy)) || empty(x + k * sx, y + k * sy);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      if (!alpha(pixels[y * width + x])) continue;
      if (open(x, y, 1)) out[y * width + x] = 1;
      else if (open(x, y, -1)) out[y * width + x] = -1;
    }
  return out;
}
