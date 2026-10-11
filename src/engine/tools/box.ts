import { boxColors, boxFromDrag, isoBox } from '../isoBox';
import type { Point } from '../math';
import { stamp, strokeColors } from './paint';
import type { Modifiers, Stroke, Tool } from './types';

/** Paints a box from the stroke's original pixels: `top` its top corner, the size in the options. */
export function paintBox(s: Stroke, top: Point): void {
  s.layer.pixels.set(s.base);
  s.visited.fill(0);
  const { boxWidth: width, boxDepth: depth, boxHeight: height, boxOutline } = s.options;
  const colors = boxColors(strokeColors(s)[0], s.palette);
  isoBox(top, { width, depth, height }, boxOutline, (x, y, face) =>
    stamp(s, x, y, colors[face], colors[face], false, 1),
  );
}

/**
 * With the isometric grid on, a box sits on it: its top corner on a corner of the diamonds (every
 * half cell across, every quarter cell down, alternately), its sides a whole number of diamond
 * edges, a quarter cell in 2:1 steps.
 */
function snapBox(box: { top: Point; width: number; depth: number }, cell: number) {
  const across = cell / 2;
  const down = cell / 4;
  const { x, y } = box.top;
  let best = { x, y };
  let distance = Infinity;
  const m0 = Math.round(x / across);
  const n0 = Math.round(y / down);
  for (let m = m0 - 1; m <= m0 + 1; m++)
    for (let n = n0 - 1; n <= n0 + 1; n++) {
      if ((m + n) % 2) continue;
      const d = Math.hypot(m * across - x, n * down - y);
      if (d < distance) [distance, best] = [d, { x: m * across, y: n * down }];
    }
  const edges = (steps: number) => Math.round(steps / down) * down;
  return { top: best, width: edges(box.width), depth: edges(box.depth) };
}

/**
 * An isometric box, dragged from one corner of its top to the opposite one, redrawn on every move.
 * The drag sets its width and depth; its height comes from the options. The editor keeps the last
 * box editable from there.
 */
function drawBox(s: Stroke, p: Point, mods: Modifiers): void {
  const drag = boxFromDrag(s.start, p, mods.shift);
  const { top, width, depth } = s.doc.isoGrid ? snapBox(drag, s.doc.isoGrid) : drag;
  s.options = { ...s.options, boxWidth: width, boxDepth: depth };
  s.scratch.top = top;
  paintBox(s, top);
}

export const boxTool: Tool = {
  id: 'box',
  editsPixels: true,
  paintsColor: true,
  onDown: drawBox,
  onMove: drawBox,
};
