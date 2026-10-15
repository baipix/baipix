import { isoBox, type BoxFace } from './isoBox';
import type { Point } from './math';
import { polygonFilled } from './raster';

/**
 * Where a ramp (or a staircase) rises, by the screen corner its high end points to: up-left (nw),
 * up-right (ne), down-right (se) or down-left (sw).
 */
export type RampDirection = 'nw' | 'ne' | 'se' | 'sw';
export const RAMP_DIRECTIONS: RampDirection[] = ['nw', 'ne', 'se', 'sw'];

/**
 * An isometric ramp, in the same box as the box tool's: `top` its top corner at full height,
 * `width` along the front left face, `depth` along the front right one (in 2:1 steps), `height` in
 * pixels. It rises toward `direction`. With `steps`, it's a staircase of that many steps of equal
 * length and rise, each a box, drawn back to front; without, a smooth slope.
 *
 * `plot` gets each pixel and the face it shows, later pixels covering earlier ones: the slope is a
 * shade between the top and the side it leans toward (`bevelLeft`, `bevelRight`) when it faces the
 * viewer, the top's color when it faces away.
 */
export function isoRamp(
  top: Point,
  { width: w, depth: d, height: h }: { width: number; depth: number; height: number },
  direction: RampDirection,
  steps: number,
  plot: (x: number, y: number, face: BoxFace) => void,
): void {
  // Nothing to draw yet (the drag's first point): a ramp needs a length to rise along.
  if (w <= 0 || d <= 0) return;
  // The footprint's top corner on the ground; a point of the solid (u along the width, v along the
  // depth, z up) on screen.
  const ox = top.x;
  const oy = top.y + h;
  const P = (u: number, v: number, z: number): Point => ({ x: ox + 2 * u - 2 * v, y: oy + u + v - z });
  // Rising along the width (u) or the depth (v), toward their far end or their near one.
  const alongU = direction === 'nw' || direction === 'se';
  const length = alongU ? w : d;
  const towardFar = direction === 'se' || direction === 'sw';
  const rise = (t: number) => (towardFar ? t : length - t);

  if (steps > 0) {
    // A staircase: boxes back to front (the far end of either axis is nearer the viewer).
    const n = Math.max(1, Math.min(steps, length));
    for (let k = 0; k < n; k++) {
      const a = Math.round((k * length) / n);
      const b = Math.round(((k + 1) * length) / n);
      if (b <= a) continue;
      const stepHeight = Math.round((Math.max(rise(a), rise(b)) / length) * h);
      const corner = alongU ? P(a, 0, stepHeight) : P(0, a, stepHeight);
      isoBox(
        corner,
        { width: alongU ? b - a : w, depth: alongU ? d : b - a, height: stepHeight },
        false,
        plot,
      );
    }
    return;
  }

  // A smooth ramp: its faces as polygons, the back ones first.
  const z = (u: number, v: number) => (Math.max(0, alongU ? rise(u) : rise(v)) / length) * h;
  const face = (pts: [number, number][], f: BoxFace) =>
    polygonFilled(
      pts.map(([u, v]) => P(u, v, Math.round(z(u, v)))),
      (x, y) => plot(x, y, f),
    );
  const ground = (pts: [number, number, number][], f: BoxFace) =>
    polygonFilled(
      pts.map(([u, v, zz]) => P(u, v, zz)),
      (x, y) => plot(x, y, f),
    );
  // The slope faces away (rising toward the viewer) or toward the viewer, on one side or the other.
  const slope: BoxFace = towardFar ? 'top' : alongU ? 'bevelRight' : 'bevelLeft';
  // The high end's upright face, when it faces the viewer: on the right face's side (u = w) or the
  // left face's (v = d).
  if (towardFar && alongU)
    ground(
      [
        [w, 0, 0],
        [w, d, 0],
        [w, d, h],
        [w, 0, h],
      ],
      'right',
    );
  if (towardFar && !alongU)
    ground(
      [
        [0, d, 0],
        [w, d, 0],
        [w, d, h],
        [0, d, h],
      ],
      'left',
    );
  // The side the slope shows, a triangle: on the left face (v = d) for a ramp along u, on the right
  // face (u = w) for one along v.
  if (alongU)
    ground(
      [
        [0, d, 0],
        [w, d, 0],
        [towardFar ? w : 0, d, h],
      ],
      'left',
    );
  else
    ground(
      [
        [w, 0, 0],
        [w, d, 0],
        [w, towardFar ? d : 0, h],
      ],
      'right',
    );
  face(
    [
      [0, 0],
      [w, 0],
      [w, d],
      [0, d],
    ],
    slope,
  );
}
