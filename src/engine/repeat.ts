import { addInstance } from './components';
import type { Layer, PixelDoc } from './document';
import { extractBlock } from './region';
import { maskBlock, type Selection } from './selection';

/** A repeat grid, like in Adobe XD and Figma: columns × rows copies, with a gap between them. */
export interface RepeatGrid {
  cols: number;
  rows: number;
  /** Pixels between two copies (can be negative, for copies that overlap). */
  gapX: number;
  gapY: number;
}

export const DEFAULT_REPEAT: RepeatGrid = { cols: 3, rows: 1, gapX: 1, gapY: 1 };

/** What gets repeated: pixels of a layer inside a rectangle, or a component's sprite as instances. */
export type RepeatSource =
  | { kind: 'pixels'; layer: Layer; rect: Selection }
  | { kind: 'instances'; layer: Layer; of: string; x: number; y: number; w: number; h: number };

/** Keeps a grid sensible: 1 to 64 copies each way, gaps no smaller than overlapping a whole copy. */
export function clampGrid(g: RepeatGrid, w: number, h: number): RepeatGrid {
  const int = (n: number, min: number, max: number) => Math.min(max, Math.max(min, Math.round(n) || 0));
  return {
    cols: int(g.cols, 1, 64),
    rows: int(g.rows, 1, 64),
    gapX: int(g.gapX, 1 - w, 256),
    gapY: int(g.gapY, 1 - h, 256),
  };
}

/** Where each copy goes, the original (0, 0) left out: offsets from it, row by row. */
export function gridOffsets(g: RepeatGrid, w: number, h: number): { dx: number; dy: number }[] {
  const out: { dx: number; dy: number }[] = [];
  for (let r = 0; r < g.rows; r++)
    for (let c = 0; c < g.cols; c++) if (r || c) out.push({ dx: c * (w + g.gapX), dy: r * (h + g.gapY) });
  return out;
}

/**
 * Lays the copies out. Pixels: the rectangle's drawn pixels stamped on the same layer (empty
 * pixels don't erase), from `base`, its pixels before. Instances: new instance layers right above
 * the source, in its group. Returns the ids of the layers added.
 */
export function applyRepeat(
  doc: PixelDoc,
  source: RepeatSource,
  base: Uint32Array,
  grid: RepeatGrid,
): string[] {
  const { width: W, height: H } = doc;
  if (source.kind === 'pixels') {
    const { rect } = source;
    // A selection of any shape repeats its own pixels only.
    const block = maskBlock(extractBlock(base, W, H, rect), rect);
    const pixels = source.layer.pixels;
    pixels.set(base);
    for (const { dx, dy } of gridOffsets(grid, block.width, block.height))
      for (let y = 0; y < block.height; y++) {
        const ty = rect.y + dy + y;
        if (ty < 0 || ty >= H) continue;
        for (let x = 0; x < block.width; x++) {
          const tx = rect.x + dx + x;
          const c = block.pixels[y * block.width + x];
          if (tx >= 0 && tx < W && c >>> 24) pixels[ty * W + tx] = c;
        }
      }
    return [];
  }
  const ids: string[] = [];
  let at = doc.layers.indexOf(source.layer) + 1;
  for (const { dx, dy } of gridOffsets(grid, source.w, source.h)) {
    const k = addInstance(doc, source.of, source.x + dx, source.y + dy, at++);
    const copy = doc.layers[k];
    copy.name = source.layer.name;
    if (source.layer.group) copy.group = source.layer.group;
    else delete copy.group;
    ids.push(copy.id);
  }
  return ids;
}
