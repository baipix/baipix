import { isoGridOrigin } from '../document';
import { extrude } from '../extrude';
import { boxColors, boxFromDrag, type BoxFace } from '../isoBox';
import type { Point } from '../math';
import { cleanEllipse, line, polygonFilled } from '../raster';
import { snapBox } from './box';
import { stamp, strokeColors } from './paint';
import type { Modifiers, Stroke, Tool } from './types';

/** Lays pixels of a volume drawn aside (`canvas`-sized, 0: none) onto the layer, through the stroke. */
function lay(s: Stroke, drawn: Uint32Array): void {
  const { width } = s.doc;
  drawn.forEach((c, i) => {
    if (c) stamp(s, i % width, Math.floor(i / width), c, c, false, 1);
  });
}

/**
 * An isometric cylinder: an ellipse lying flat, twice as wide as tall, dragged across from its top
 * left (Shift: by its width, like the ellipse), pulled down by the height. It's an extrusion of
 * that ellipse, so its sides are shaded like the box's.
 */
export function paintCylinder(s: Stroke, a: Point, b: Point): void {
  s.layer.pixels.set(s.base);
  s.visited.fill(0);
  const { width: W, height: H } = s.doc;
  const h = Math.max(0, s.options.boxHeight);
  const half = Math.max(Math.abs(b.y - a.y) + 1, Math.round((Math.abs(b.x - a.x) + 1) / 2));
  const bx = a.x + (b.x < a.x ? -1 : 1) * (2 * half - 1);
  const by = a.y + (b.y < a.y ? -1 : 1) * (half - 1);
  // The ellipse drawn where the bottom goes, then pulled up into the cylinder.
  const drawn = new Uint32Array(W * H);
  const region = new Uint8Array(W * H);
  const color = strokeColors(s)[0];
  cleanEllipse(a.x, a.y + h, bx, by + h, true, (x, y) => {
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    drawn[y * W + x] = color;
    region[y * W + x] = 1;
  });
  extrude(
    drawn,
    W,
    H,
    region,
    { height: h, outline: s.options.boxOutline, light: s.options.boxLight },
    s.palette,
  );
  lay(s, drawn);
}

/**
 * An isometric pyramid on a diamond base, dragged from the base's top corner to its bottom one
 * like the box (Shift: square), its apex `height` above the base's middle. Its four faces are lit
 * from the top left: the back left one lightest, the back right one in the color, the front left
 * one a step darker and the front right one two. The back faces show when the pyramid is low,
 * like a roof seen from above; the front ones cover them.
 */
export function paintPyramid(s: Stroke, top: Point, width: number, depth: number): void {
  s.layer.pixels.set(s.base);
  s.visited.fill(0);
  const { width: W, height: H } = s.doc;
  const tones = boxColors(strokeColors(s)[0], s.palette);
  // The base's corners, on pixel corners, and the apex over its middle.
  const t = top;
  const r = { x: t.x + 2 * width, y: t.y + width };
  const b = { x: t.x + 2 * width - 2 * depth, y: t.y + width + depth };
  const l = { x: t.x - 2 * depth, y: t.y + depth };
  const apex = {
    x: Math.round((t.x + b.x) / 2),
    y: Math.round((t.y + b.y) / 2) - Math.max(0, Math.round(s.options.boxHeight)),
  };
  const faces: [Point[], BoxFace][] = [
    [[l, t, apex], 'light'],
    [[t, r, apex], 'top'],
    [[l, b, apex], 'left'],
    [[b, r, apex], 'right'],
  ];
  const drawn = new Uint32Array(W * H);
  const put = (x: number, y: number, c: number) => {
    if (x >= 0 && y >= 0 && x < W && y < H) drawn[y * W + x] = c;
  };
  for (const [ps, face] of faces) polygonFilled(ps, (x, y) => put(x, y, tones[face]));
  // The front ridge, lit, then the outline around the whole pyramid.
  if (s.options.boxLight) line(b.x, b.y - 1, apex.x, apex.y, (x, y) => put(x, y, tones.light));
  if (s.options.boxOutline) {
    const inside = drawn.slice();
    const at = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H && inside[y * W + x] !== 0;
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++)
        if (at(x, y) && (!at(x - 1, y) || !at(x + 1, y) || !at(x, y - 1) || !at(x, y + 1)))
          drawn[y * W + x] = tones.edge;
  }
  lay(s, drawn);
}

function drawCylinder(s: Stroke, p: Point): void {
  const a = s.start;
  s.scratch.repaint = () => paintCylinder(s, a, p);
  paintCylinder(s, a, p);
}

function drawPyramid(s: Stroke, p: Point, mods: Modifiers): void {
  const drag = boxFromDrag(s.start, p, mods.shift);
  const { top, width, depth } = s.doc.isoGrid
    ? snapBox(drag, s.doc.isoGrid, isoGridOrigin(s.doc.width))
    : drag;
  s.scratch.repaint = () => paintPyramid(s, top, width, depth);
  paintPyramid(s, top, width, depth);
}

const volumeTool = (
  id: 'cylinder' | 'pyramid',
  draw: (s: Stroke, p: Point, mods: Modifiers) => void,
): Tool => ({
  id,
  editsPixels: true,
  paintsColor: true,
  onDown: draw,
  onMove: draw,
});

export const cylinderTool = volumeTool('cylinder', drawCylinder);
export const pyramidTool = volumeTool('pyramid', drawPyramid);
