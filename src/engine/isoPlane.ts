import { boxFromDrag, isoBox } from './isoBox';
import type { Point } from './math';
import { cleanEllipse, type PlotFn } from './raster';

/**
 * Where a shape is drawn in an isometric drawing: flat on the screen as usual, on the left or the
 * right wall (their horizontal edges go down, or up, to the right at 2:1), or on the ground.
 */
export type IsoPlane = 'flat' | 'left' | 'right' | 'ground';
export const ISO_PLANES: IsoPlane[] = ['flat', 'left', 'right', 'ground'];

/**
 * A rectangle or an ellipse on an isometric plane, from a drag between two corners. On a wall, the
 * shape fits in the dragged box: its columns slide down one pixel every two, so its top and bottom
 * edges are 2:1 steps and its sides stay upright, as on the box's faces. On the ground, the
 * rectangle is a diamond like the box's top (dragged from its top corner to its bottom one), and
 * the ellipse lies flat, twice as wide as tall. `plot` gets each pixel, and whether it's part of
 * the outline (false: inside a filled shape).
 */
export function planeShape(
  kind: 'rect' | 'ellipse',
  plane: Exclude<IsoPlane, 'flat'>,
  a: Point,
  b: Point,
  filled: boolean,
  plot: (x: number, y: number, outline: boolean) => void,
): void {
  if (plane === 'ground') {
    if (kind === 'rect') {
      const { top, width, depth } = boxFromDrag(a, b, false);
      const cells = new Set<string>();
      isoBox(top, { width, depth, height: 0 }, false, (x, y) => cells.add(`${x},${y}`));
      for (const c of cells) {
        const [x, y] = c.split(',').map(Number);
        const edge = [`${x - 1},${y}`, `${x + 1},${y}`, `${x},${y - 1}`, `${x},${y + 1}`].some(
          (n) => !cells.has(n),
        );
        if (edge || filled) plot(x, y, edge);
      }
      return;
    }
    const half = Math.max(Math.abs(b.y - a.y) + 1, Math.round((Math.abs(b.x - a.x) + 1) / 2));
    const bx = a.x + (b.x < a.x ? -1 : 1) * (2 * half - 1);
    const by = a.y + (b.y < a.y ? -1 : 1) * (half - 1);
    return onOutline(
      filled,
      (p) => cleanEllipse(a.x, a.y, bx, by, false, p),
      (p) => cleanEllipse(a.x, a.y, bx, by, true, p),
      plot,
    );
  }
  const x0 = Math.min(a.x, b.x);
  const y0 = Math.min(a.y, b.y);
  const w = Math.abs(b.x - a.x) + 1;
  const drop = Math.floor((w - 1) / 2);
  const h = Math.max(1, Math.abs(b.y - a.y) + 1 - drop);
  // The shape filled flat in a w × h box, each column slid down along the wall; its outline is
  // then its edge, so it stays unbroken where the ellipse is steep.
  const cells = new Set<string>();
  const slid: PlotFn = (lx, ly) =>
    cells.add(`${x0 + lx},${y0 + ly + Math.floor((plane === 'left' ? lx : w - 1 - lx) / 2)}`);
  if (kind === 'ellipse') cleanEllipse(0, 0, w - 1, h - 1, true, slid);
  else for (let ly = 0; ly < h; ly++) for (let lx = 0; lx < w; lx++) slid(lx, ly);
  plotRegion(cells, filled, plot);
}

/** A region's pixels: its edge (a side touching the outside) as the outline, the rest if filled. */
function plotRegion(
  cells: Set<string>,
  filled: boolean,
  plot: (x: number, y: number, outline: boolean) => void,
) {
  for (const c of cells) {
    const [x, y] = c.split(',').map(Number);
    const edge = [`${x - 1},${y}`, `${x + 1},${y}`, `${x},${y - 1}`, `${x},${y + 1}`].some(
      (n) => !cells.has(n),
    );
    if (edge || filled) plot(x, y, edge);
  }
}

/** Plots the outline, and the inside too when filled, each pixel once, telling which is which. */
function onOutline(
  filled: boolean,
  outline: (p: PlotFn) => void,
  inside: (p: PlotFn) => void,
  plot: (x: number, y: number, outline: boolean) => void,
): void {
  const edge = new Set<string>();
  outline((x, y) => edge.add(`${x},${y}`));
  for (const c of edge) {
    const [x, y] = c.split(',').map(Number);
    plot(x, y, true);
  }
  if (!filled) return;
  const done = new Set(edge);
  inside((x, y) => {
    const k = `${x},${y}`;
    if (done.has(k)) return;
    done.add(k);
    plot(x, y, false);
  });
}
