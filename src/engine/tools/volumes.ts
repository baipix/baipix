import { isoGridOrigin } from '../document';
import { extrude } from '../extrude';
import { boxFromDrag, volumeColors, type BoxFace } from '../isoBox';
import { isoRamp } from '../isoRamp';
import { planeShape } from '../isoPlane';
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
  if (s.options.cylinderAxis !== 'up') return paintLyingCylinder(s, a, b);
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
    {
      height: h,
      outline: s.options.boxOutline,
      light: s.options.boxLight,
      edges: s.options.boxEdges,
      faces: s.options.boxFaces,
    },
    s.palette,
  );
  lay(s, drawn);
}

/**
 * A cylinder lying on its side, for barrels, logs and wheels: its round end dragged on a wall like
 * the shapes on an isometric plane (the right wall for one lying along the left axis, the left wall
 * along the right one), and its body Height steps long behind it. The body's upper half is lit like a
 * top, its lower half shaded like the side it shows; the round end in front is the color of the face
 * it stands on.
 */
function paintLyingCylinder(s: Stroke, a: Point, b: Point): void {
  s.layer.pixels.set(s.base);
  s.visited.fill(0);
  const { width: W, height: H } = s.doc;
  const tones = volumeColors(strokeColors(s)[0], s.palette, s.options.boxFaces);
  const alongLeft = s.options.cylinderAxis === 'left';
  // The round end, on the wall facing along the axis.
  const end: Point[] = [];
  planeShape('ellipse', alongLeft ? 'right' : 'left', a, b, true, (x, y) => end.push({ x, y }));
  if (!end.length) return;
  const middle = (Math.min(...end.map((p) => p.y)) + Math.max(...end.map((p) => p.y))) / 2;
  const drawn = new Uint32Array(W * H);
  const put = (x: number, y: number, c: number) => {
    if (x >= 0 && y >= 0 && x < W && y < H) drawn[y * W + x] = c;
  };
  // Back to front: the body, one 2:1 step at a time away from the end, then the end over it.
  const length = Math.max(0, Math.round(s.options.boxHeight));
  const [dx, dy] = alongLeft ? [-2, -1] : [2, -1];
  const side = alongLeft ? tones.left : tones.right;
  for (let t = length; t >= 1; t--)
    for (const p of end) put(p.x + dx * t, p.y + dy * t, p.y < middle ? tones.top : side);
  for (const p of end) put(p.x, p.y, alongLeft ? tones.right : tones.left);
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
  const tones = volumeColors(strokeColors(s)[0], s.palette, s.options.boxFaces);
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
  // Which face shows at each pixel (1 to 4, front faces drawn last so they cover the back ones).
  const shown = new Uint8Array(W * H);
  faces.forEach(([ps, face], k) =>
    polygonFilled(ps, (x, y) => {
      if (x < 0 || y < 0 || x >= W || y >= H) return;
      put(x, y, tones[face]);
      shown[y * W + x] = k + 1;
    }),
  );
  // The ridges between the faces that show, in the outline's color: where a pixel's face differs
  // from the one left of it or above it.
  if (s.options.boxEdges)
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const f = shown[y * W + x];
        const left = x > 0 ? shown[y * W + x - 1] : 0;
        const up = y > 0 ? shown[(y - 1) * W + x] : 0;
        if (f && ((left && left !== f) || (up && up !== f))) drawn[y * W + x] = tones.edge;
      }
  // The front ridge lit, then the outline around the whole pyramid.
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
  id: 'cylinder' | 'pyramid' | 'ramp',
  draw: (s: Stroke, p: Point, mods: Modifiers) => void,
): Tool => ({
  id,
  editsPixels: true,
  paintsColor: true,
  onDown: draw,
  onMove: draw,
});

/**
 * An isometric ramp or staircase in the box the drag sets, like the box's (Shift: square), Height
 * tall, rising toward the direction in the options, in as many steps as asked (0: a smooth slope).
 */
export function paintRamp(s: Stroke, top: Point, width: number, depth: number): void {
  s.layer.pixels.set(s.base);
  s.visited.fill(0);
  const { width: W, height: H } = s.doc;
  const tones = volumeColors(strokeColors(s)[0], s.palette, s.options.boxFaces);
  const drawn = new Uint32Array(W * H);
  const put = (x: number, y: number, c: number) => {
    if (x >= 0 && y >= 0 && x < W && y < H) drawn[y * W + x] = c;
  };
  isoRamp(
    top,
    { width, depth, height: Math.max(0, Math.round(s.options.boxHeight)) },
    s.options.rampDirection,
    Math.max(0, Math.round(s.options.rampSteps)),
    (x, y, face) => put(x, y, tones[face]),
  );
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

function drawRamp(s: Stroke, p: Point, mods: Modifiers): void {
  const drag = boxFromDrag(s.start, p, mods.shift);
  const { top, width, depth } = s.doc.isoGrid
    ? snapBox(drag, s.doc.isoGrid, isoGridOrigin(s.doc.width))
    : drag;
  s.scratch.repaint = () => paintRamp(s, top, width, depth);
  paintRamp(s, top, width, depth);
}

export const cylinderTool = volumeTool('cylinder', drawCylinder);
export const rampTool = volumeTool('ramp', drawRamp);
export const pyramidTool = volumeTool('pyramid', drawPyramid);
