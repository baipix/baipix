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
 * An isometric box, dragged from one corner of its top to the opposite one, redrawn on every move.
 * The drag sets its width and depth; its height comes from the options. The editor keeps the last
 * box editable from there.
 */
function drawBox(s: Stroke, p: Point, mods: Modifiers): void {
  const { top, width, depth } = boxFromDrag(s.start, p, mods.shift);
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
