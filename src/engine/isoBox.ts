import type { Color } from './color';
import type { Point } from './math';
import { shiftLightness, type PaletteIndex } from './palette';

/**
 * The faces of an isometric box, lit from the top left; `edge` is its outline and `light` the
 * top's front edges, if it has them.
 */
export type BoxFace = 'top' | 'left' | 'right' | 'edge' | 'light';

/**
 * The size of an isometric box, in steps of its 2:1 edges (two pixels across, one down) and in
 * pixels for its height. `width` runs along its front left face, `depth` along its front right one.
 */
export interface BoxSize {
  width: number;
  depth: number;
  height: number;
}

/**
 * The size of the box dragged from one corner of its top to the opposite one, top to bottom: the
 * vertical distance is width + depth, the horizontal one twice their difference. Shift: as deep as
 * wide. Dragged upwards, the end is the top corner.
 */
export function boxFromDrag(
  start: Point,
  end: Point,
  square: boolean,
): { top: Point; width: number; depth: number } {
  const [top, bottom] = end.y < start.y ? [end, start] : [start, end];
  const dy = bottom.y - top.y;
  const dx = bottom.x - top.x;
  if (square) {
    const half = Math.round(dy / 2);
    return { top, width: half, depth: half };
  }
  const width = Math.max(0, Math.min(dy, Math.round((dy + dx / 2) / 2)));
  return { top, width, depth: dy - width };
}

/**
 * Plots an isometric box whose top corner is the pair of pixels left of and at `top`. Its top is
 * a diamond with edges of exactly two pixels per step; under it hang the left and right faces,
 * `height` pixels tall. With `outline`, the pixels on its outer edge are `edge` instead; with
 * `light`, the top's pixels along its two front edges (over the sides) are `light`; with `edges`,
 * the lines between the faces (under the top, and the front corner) are `edge` too.
 */
export function isoBox(
  top: Point,
  { width: w, depth: d, height: h }: BoxSize,
  outline: boolean,
  plot: (x: number, y: number, face: BoxFace) => void,
  light = false,
  edges = false,
): void {
  const cx = top.x;
  // The top face, row by row: its left edge goes down-left for `depth` steps then down-right,
  // its right edge down-right for `width` steps then down-left.
  const rows = w + d + 1;
  const left = (k: number) => (k <= d ? cx - 1 - 2 * k : cx - 1 - 2 * d + 2 * (k - d));
  const right = (k: number) => (k <= w ? cx + 2 * k : cx + 2 * w - 2 * (k - w));
  const x0 = cx - 1 - 2 * d;
  const x1 = cx + 2 * w;
  // Each column: the face it shows and the rows it covers, top first.
  const columns: { face: BoxFace; from: number; to: number }[][] = [];
  for (let x = x0; x <= x1; x++) {
    let from = -1;
    let to = -1;
    for (let k = 0; k < rows; k++)
      if (left(k) <= x && x <= right(k)) {
        if (from < 0) from = k;
        to = k;
      }
    // The bottom corner's pair: columns left of its right pixel are on the left face.
    const side: BoxFace = x < cx + 2 * w - 2 * d ? 'left' : 'right';
    columns.push([
      { face: 'top', from, to },
      { face: side, from: to + 1, to: to + h },
    ]);
  }
  const inside = (x: number, y: number) => {
    const col = columns[x - x0];
    return !!col && y >= col[0].from && y <= col[1].to;
  };
  // The front corner, where the left face meets the right one: its left column carries the line.
  const corner = cx + 2 * w - 2 * d - 1;
  columns.forEach((col, i) => {
    const x = x0 + i;
    for (const { face, from, to } of col)
      for (let k = from; k <= to; k++) {
        // Inner edges: the sides' first row under the top, and the front corner, top to bottom.
        const inner = edges && h > 0 && face !== 'top' && (k === from || x === corner);
        const edge =
          inner ||
          (outline && (!inside(x - 1, k) || !inside(x + 1, k) || !inside(x, k - 1) || !inside(x, k + 1)));
        const front = light && face === 'top' && k === to && h > 0;
        plot(x, top.y + k, edge ? 'edge' : front ? 'light' : face);
      }
  });
}

/**
 * One step darker (`dir` -1) or lighter (1): the next color along the palette's ramp when the color
 * is in the palette, otherwise the color itself made darker or lighter. A color from elsewhere
 * would otherwise borrow the closest palette ramp, whatever its hue: a blue box with green sides.
 */
function step(c: Color, palette: PaletteIndex, dir: 1 | -1): Color {
  const inPalette = palette.size > 0 && palette.nearest(c) === c;
  return (inPalette && palette.shade(c, dir, 'ramp')) || shiftLightness(c, dir, 2, true);
}

/**
 * The colors of the faces: the top in `color`, the left one step darker, the right two, the edge
 * three, and the light edge one step lighter.
 */
export function boxColors(color: Color, palette: PaletteIndex): Record<BoxFace, Color> {
  const left = step(color, palette, -1);
  const right = step(left, palette, -1);
  return { top: color, left, right, edge: step(right, palette, -1), light: step(color, palette, 1) };
}

/** A volume's three faces picked by hand, instead of shaded from one color. */
export interface FaceColors {
  top: Color;
  left: Color;
  right: Color;
}

/**
 * The colors of a volume's faces: shaded from `color` (see `boxColors`), or the faces picked by
 * hand, the outline a step darker than the right face and the light edge a step lighter than the top.
 */
export function volumeColors(
  color: Color,
  palette: PaletteIndex,
  faces?: FaceColors | null,
): Record<BoxFace, Color> {
  if (!faces) return boxColors(color, palette);
  const { top, left, right } = faces;
  return { top, left, right, edge: step(right, palette, -1), light: step(top, palette, 1) };
}
