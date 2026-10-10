import type { Point } from '../math';
import {
  constrainAngle,
  constrainSquare,
  ellipseFilled,
  ellipseOutline,
  heartFilled,
  heartOutline,
  line,
  mirroredHalf,
  polygonFilled,
  polygonOutline,
  rectOutline,
  roundRectFilled,
  roundRectOutline,
  starPoints,
  trianglePoints,
  type PlotFn,
} from '../raster';
import { stamp, strokeColors } from './paint';
import type { Modifiers, Stroke, Tool, ToolId } from './types';

type ShapeKind = 'line' | 'rect' | 'roundRect' | 'ellipse' | 'triangle' | 'star' | 'heart';

/** Shapes are redrawn from the original pixels on every move, so they can be previewed live. */
function drawShape(kind: ShapeKind, s: Stroke, p: Point, mods: Modifiers): void {
  s.layer.pixels.set(s.base);
  const [color] = strokeColors(s);
  const a = s.start;
  if (kind === 'line') {
    const b = mods.shift ? constrainAngle(a, p) : p;
    line(a.x, a.y, b.x, b.y, (x, y) => stamp(s, x, y, color));
    return;
  }
  const b = mods.shift ? constrainSquare(a, p) : p;
  const x0 = Math.min(a.x, b.x);
  const y0 = Math.min(a.y, b.y);
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  // Outlines use the brush size; fills are painted pixel by pixel.
  const outline: PlotFn = (x, y) => stamp(s, x, y, color);
  const fill: PlotFn = (x, y) => stamp(s, x, y, color, color, false, 1);
  const filled = s.options.filled;
  switch (kind) {
    case 'rect':
      if (filled) {
        for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) fill(x, y);
      } else rectOutline(x0, y0, x1, y1, outline);
      return;
    case 'roundRect':
      (filled ? roundRectFilled : roundRectOutline)(
        x0,
        y0,
        x1,
        y1,
        s.options.radius,
        filled ? fill : outline,
      );
      return;
    case 'ellipse':
      (filled ? ellipseFilled : ellipseOutline)(x0, y0, x1, y1, filled ? fill : outline);
      return;
    case 'heart':
      (filled ? heartFilled : heartOutline)(x0, y0, x1, y1, filled ? fill : outline);
      return;
    case 'triangle':
    case 'star': {
      const points = (kind === 'star' ? starPoints : trianglePoints)(x0, y0, x1, y1);
      if (filled) polygonFilled(points, mirroredHalf(x0, x1, fill));
      else polygonOutline(points, mirroredHalf(x0, x1, outline));
    }
  }
}

const shapeTool = (kind: ShapeKind): Tool => ({
  id: kind as ToolId,
  editsPixels: true,
  paintsColor: true,
  onDown: (s, p, mods) => drawShape(kind, s, p, mods),
  onMove: (s, p, mods) => drawShape(kind, s, p, mods),
});

export const lineTool = shapeTool('line');
export const rectTool = shapeTool('rect');
export const roundRectTool = shapeTool('roundRect');
export const ellipseTool = shapeTool('ellipse');
export const triangleTool = shapeTool('triangle');
export const starTool = shapeTool('star');
export const heartTool = shapeTool('heart');
