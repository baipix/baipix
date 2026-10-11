import { boxFromDrag, isoBox } from './isoBox';
import type { Point } from './math';
import {
  cleanEllipse,
  heartFilled,
  mirroredHalf,
  polygonFilled,
  roundRectFilled,
  starPoints,
  trianglePoints,
  type PlotFn,
} from './raster';

/**
 * Where a shape is drawn in an isometric drawing: flat on the screen as usual, on the left or the
 * right wall (their horizontal edges go down, or up, to the right at 2:1), or on the ground.
 */
export type IsoPlane = 'flat' | 'left' | 'right' | 'ground';
export const ISO_PLANES: IsoPlane[] = ['flat', 'left', 'right', 'ground'];

/** The shapes that can go on a plane: all but the line, which has its own iso angles. */
export type PlaneKind = 'rect' | 'roundRect' | 'ellipse' | 'triangle' | 'star' | 'heart';

/**
 * Smooths the top and bottom of a shape that is one run per column, slid onto a wall. Where its
 * own curve slopes against the wall's 2:1, the two two-pixel steps fall a column apart and the
 * edge alternates pixel by pixel; a column out of line with both its neighbors joins them.
 */
function evenOut(cells: Set<string>, x0: number, w: number): void {
  const top: number[] = [];
  const bottom: number[] = [];
  for (let i = 0; i < w; i++) {
    const ys = [...cells].filter((c) => +c.split(',')[0] === x0 + i).map((c) => +c.split(',')[1]);
    top.push(Math.min(...ys));
    bottom.push(Math.max(...ys));
  }
  for (const edge of [top, bottom])
    for (let i = 1; i + 1 < w; i++)
      if (edge[i - 1] === edge[i + 1] && edge[i] !== edge[i - 1]) edge[i] = edge[i - 1];
  cells.clear();
  for (let i = 0; i < w; i++) for (let y = top[i]; y <= bottom[i]; y++) cells.add(`${x0 + i},${y}`);
}

/** The shape filled flat in a `w` × `h` box from (0, 0), as the other shape tools draw it. */
function flatShape(kind: PlaneKind, w: number, h: number, radius: number, plot: PlotFn): void {
  const [x1, y1] = [w - 1, h - 1];
  switch (kind) {
    case 'rect':
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) plot(x, y);
      return;
    case 'roundRect':
      return roundRectFilled(0, 0, x1, y1, radius, plot);
    case 'ellipse':
      return cleanEllipse(0, 0, x1, y1, true, plot);
    case 'heart':
      return heartFilled(0, 0, x1, y1, plot);
    case 'triangle':
    case 'star':
      return polygonFilled(
        (kind === 'star' ? starPoints : trianglePoints)(0, 0, x1, y1),
        mirroredHalf(0, x1, plot),
      );
  }
}

/**
 * A shape on an isometric plane, from a drag between two corners. `regular` (Shift) makes it
 * square, round or regular in its plane.
 * - On a wall, it fits in the dragged box: drawn flat as wide as the drag, then its columns slide
 *   down one pixel every two, so its top and bottom go along the wall at 2:1 and its sides stay
 *   upright, as on the box's faces.
 * - On the ground, it's dragged from the top corner of the diamond it lies in to the bottom one,
 *   like the box's top. The rectangle is exactly that top; the ellipse is the clean 2:1 ellipse,
 *   dragged across like the ellipse; the others are the flat shape laid down, each pixel showing
 *   the spot of the shape under its center, so their edges stay clean.
 * `plot` gets each pixel, and whether it's on the outline (the shape's edge) or inside it.
 */
export function planeShape(
  kind: PlaneKind,
  plane: Exclude<IsoPlane, 'flat'>,
  a: Point,
  b: Point,
  filled: boolean,
  plot: (x: number, y: number, outline: boolean) => void,
  { regular = false, radius = 2 }: { regular?: boolean; radius?: number } = {},
): void {
  const cells = new Set<string>();
  const add = (x: number, y: number) => cells.add(`${x},${y}`);
  if (plane === 'ground' && kind === 'ellipse') {
    const half = Math.max(Math.abs(b.y - a.y) + 1, Math.round((Math.abs(b.x - a.x) + 1) / 2));
    const bx = a.x + (b.x < a.x ? -1 : 1) * (2 * half - 1);
    const by = a.y + (b.y < a.y ? -1 : 1) * (half - 1);
    cleanEllipse(a.x, a.y, bx, by, true, add);
  } else if (plane === 'ground') {
    const { top, width, depth } = boxFromDrag(a, b, regular);
    if (kind === 'rect') isoBox(top, { width, depth, height: 0 }, false, add);
    else {
      // The flat shape at two of its pixels per 2:1 step, the diamond's size along each edge.
      const [n, m] = [2 * width, 2 * depth];
      const flat = new Set<string>();
      flatShape(kind, n, m, radius, (u, v) => flat.add(`${u},${v}`));
      // Over the diamond's box: each pixel shows the spot of the ground under its center.
      for (let Y = top.y; Y <= top.y + width + depth; Y++)
        for (let X = top.x - 2 * depth - 1; X <= top.x + 2 * width; X++) {
          const x = X + 0.5 - top.x;
          const y = Y + 0.5 - top.y;
          if (flat.has(`${Math.floor(y + x / 2)},${Math.floor(y - x / 2)}`)) add(X, Y);
        }
    }
  } else {
    const x0 = Math.min(a.x, b.x);
    const y0 = Math.min(a.y, b.y);
    const w = Math.abs(b.x - a.x) + 1;
    const drop = Math.floor((w - 1) / 2);
    const h = regular ? w : Math.max(1, Math.abs(b.y - a.y) + 1 - drop);
    flatShape(kind, w, h, radius, (lx, ly) =>
      add(x0 + lx, y0 + ly + Math.floor((plane === 'left' ? lx : w - 1 - lx) / 2)),
    );
    if (kind === 'ellipse' || kind === 'roundRect') evenOut(cells, x0, w);
  }
  // The outline is the shape's edge, so a slid or laid-down shape stays in one piece.
  for (const c of cells) {
    const [x, y] = c.split(',').map(Number);
    const edge = [`${x - 1},${y}`, `${x + 1},${y}`, `${x},${y - 1}`, `${x},${y + 1}`].some(
      (k) => !cells.has(k),
    );
    if (edge || filled) plot(x, y, edge);
  }
}
