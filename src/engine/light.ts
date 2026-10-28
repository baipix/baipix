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
}

/** How high a light can be: never flat on the ground, never straight above. */
export const LIGHT_HEIGHT = { min: 10, max: 80 };

/** A new light: from the top left, halfway up, the most common choice in pixel art. */
export const DEFAULT_LIGHT: BoardLight = { angle: 135, height: 45, direction: true };

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
  };
}

/** The unit step toward the light, in canvas pixels (y down). */
export function towardLight(angle: number): { x: number; y: number } {
  const a = (angle * Math.PI) / 180;
  return { x: Math.cos(a), y: -Math.sin(a) };
}

/** The longest shadow a light casts, in pixels: a grazing light stops there. */
export const MAX_LIGHT_SHADOW = 6;

/**
 * Where a drop shadow falls under this light, as an offset in pixels: away from the light, longer
 * the lower it is (2 pixels at 45°, up to `MAX_LIGHT_SHADOW`), never under the drawing itself.
 */
export function shadowOffset(light: Pick<BoardLight, 'angle' | 'height'>): { x: number; y: number } {
  const { x: ux, y: uy } = towardLight(light.angle);
  const length = Math.min(MAX_LIGHT_SHADOW, Math.max(1, 2 / Math.tan((light.height * Math.PI) / 180)));
  // `|| 0`: no -0 from a light straight along an axis.
  const x = Math.round(-ux * length) || 0;
  const y = Math.round(-uy * length) || 0;
  if (x || y) return { x, y };
  // Too short to round to a pixel: one step along the light's main axis.
  return Math.abs(ux) > Math.abs(uy) ? { x: -Math.sign(ux) || 0, y: 0 } : { x: 0, y: -Math.sign(uy) || 0 };
}
