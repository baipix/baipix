import type { PixelDoc } from './document';

/**
 * Isometric tiles: a diamond filling the canvas, repeated staggered (half a tile across and down)
 * rather than side by side. The canvas then holds two kinds of pixels: the diamond's, and the
 * corners', which belong to its neighbors. Each corner pixel has its twin in the diamond, half a
 * tile away.
 */

/** Whether the tile preview repeats `doc` as isometric tiles: its isometric grid is on, its size even. */
export const tilesIsometric = (doc: PixelDoc): boolean =>
  !!doc.isoGrid && doc.width % 2 === 0 && doc.height % 2 === 0;

/**
 * Whether pixel (x, y) is in the diamond inscribed in a `width` × `height` canvas, by its center.
 * A center right on its edge (never on a 2:1 canvas) counts in the top half only, so that of a
 * pixel and its twin, one is always in.
 */
export function inDiamond(x: number, y: number, width: number, height: number): boolean {
  const d = Math.abs(2 * x + 1 - width) * height + Math.abs(2 * y + 1 - height) * width;
  return d < width * height || (d === width * height && 2 * y + 1 < height);
}

const mod = (a: number, n: number) => ((a % n) + n) % n;

/** Where a pixel anywhere around lands in the diamond: the same spot of the tile it's in. */
export function inTile(x: number, y: number, width: number, height: number): { x: number; y: number } {
  const qx = mod(x, width);
  const qy = mod(y, height);
  if (inDiamond(qx, qy, width, height)) return { x: qx, y: qy };
  return { x: mod(qx + width / 2, width), y: mod(qy + height / 2, height) };
}

/** The diamond's pixels row by row, as [first, last] columns (empty rows: first > last). */
export function diamondRows(width: number, height: number): [number, number][] {
  const key = `${width}x${height}`;
  const known = rowsCache.get(key);
  if (known) return known;
  const rows: [number, number][] = [];
  for (let y = 0; y < height; y++) {
    let first = width;
    let last = -1;
    for (let x = 0; x < width; x++)
      if (inDiamond(x, y, width, height)) {
        first = Math.min(first, x);
        last = x;
      }
    rows.push([first, last]);
  }
  rowsCache.set(key, rows);
  return rows;
}

/** The diamond's rows by canvas size: the renderer asks on every frame. */
const rowsCache = new Map<string, [number, number][]>();
