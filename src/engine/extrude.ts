import { volumeColors, type BoxFace, type FaceColors } from './isoBox';
import type { PaletteIndex } from './palette';

/** How a flat shape is pulled up into a volume. */
export interface ExtrudeOptions {
  /** How far the shape goes up, in pixels: the height of its sides. */
  height: number;
  /** An outline around the volume, a step darker than its sides. */
  outline: boolean;
  /** The top's front edge one step lighter, like the box's. */
  light: boolean;
  /** The faces' colors picked by hand (the volume tools), instead of shaded from each pixel's color. */
  faces?: FaceColors | null;
}

export const DEFAULT_EXTRUDE: ExtrudeOptions = { height: 8, outline: false, light: false };

/**
 * Pulls a flat shape up into an isometric volume. `region` marks the shape's pixels on the canvas
 * (its top, as drawn): they go up by `height`, and under them each column gets a side face, from
 * the shape's lowest pixel in that column down to where it was. A column whose lower edge goes down
 * to the right shows the left face, one going up shows the right face, like the box's; the sides
 * take the color of the edge above them, one step darker on the left and two on the right.
 *
 * Writes into `pixels` (the layer as it was), and returns what the volume covers on the canvas,
 * and the pixels it puts outside it, as [x, y, color] triples.
 */
export function extrude(
  pixels: Uint32Array,
  width: number,
  height: number,
  region: Uint8Array,
  o: ExtrudeOptions,
  palette: PaletteIndex,
): { covered: Uint8Array; outside: number[] } {
  const h = Math.max(0, Math.round(o.height));
  const base = pixels.slice();
  // Each column of the shape: its lowest row, and the face its side shows.
  const bottom = new Int32Array(width).fill(-1);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) if (region[y * width + x]) bottom[x] = y;
  const faces: (BoxFace | null)[] = new Array(width).fill(null);
  let previous: BoxFace = 'left';
  for (let x = 0; x < width; x++) {
    if (bottom[x] < 0) continue;
    const before = x > 0 && bottom[x - 1] >= 0 ? bottom[x - 1] : bottom[x];
    const after = x + 1 < width && bottom[x + 1] >= 0 ? bottom[x + 1] : bottom[x];
    // Flat (the bottom corner, a front facing straight on): the same as the column before.
    const slope = after - before;
    faces[x] = previous = slope > 0 ? 'left' : slope < 0 ? 'right' : previous;
  }

  // The volume, laid out first so the outline can find its edge: color and tones by pixel.
  const placed = new Map<string, { x: number; y: number; color: number; tones: Record<BoxFace, number> }>();
  const key = (x: number, y: number) => `${x},${y}`;
  const tonesOf = new Map<number, Record<BoxFace, number>>();
  const tones = (c: number) => {
    let t = tonesOf.get(c);
    if (!t) tonesOf.set(c, (t = volumeColors(c, palette, o.faces)));
    return t;
  };
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      if (!region[i]) continue;
      pixels[i] = 0;
      const c = base[i];
      if (!(c >>> 24)) continue;
      // The top, gone up; its front edge lit if asked.
      const front = o.light && h > 0 && y === bottom[x];
      placed.set(key(x, y - h), { x, y: y - h, color: front ? tones(c).light : c, tones: tones(c) });
    }
  for (let x = 0; x < width; x++) {
    const face = faces[x];
    const c = face && base[bottom[x] * width + x];
    if (!face || !c || !(c >>> 24)) continue;
    const t = tones(c);
    for (let y = bottom[x] - h + 1; y <= bottom[x]; y++)
      placed.set(key(x, y), { x, y, color: t[face], tones: t });
  }

  const covered = new Uint8Array(width * height);
  const outside: number[] = [];
  for (const { x, y, color, tones: t } of placed.values()) {
    const edge =
      o.outline &&
      [
        [x - 1, y],
        [x + 1, y],
        [x, y - 1],
        [x, y + 1],
      ].some(([nx, ny]) => !placed.has(key(nx, ny)));
    const c = edge ? t.edge : color;
    if (x >= 0 && y >= 0 && x < width && y < height) {
      pixels[y * width + x] = c;
      covered[y * width + x] = 1;
    } else outside.push(x, y, c);
  }
  return { covered, outside };
}
