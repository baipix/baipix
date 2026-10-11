/**
 * The part of a layer that lies outside the canvas, kept so that moving the layer back (or making
 * the canvas bigger) brings those pixels back. `x`, `y` are in canvas pixels and can be negative;
 * whatever of it falls inside the canvas is ignored (and kept transparent). Treated as immutable:
 * operations replace it, so history snapshots can share it.
 *
 * Only moving a whole layer and resizing the canvas fill it. Everything else (drawing, exports,
 * merges, the color count) only sees `layer.pixels`, the part inside the canvas.
 */
export interface Outside {
  x: number;
  y: number;
  w: number;
  h: number;
  pixels: Uint32Array;
}

/** How far outside the canvas pixels are kept, on each side. Beyond that they are dropped. */
export const OUTSIDE_MARGIN = 512;

/**
 * Lays a layer's content (its pixels, width × height, plus what's outside) shifted by `dx`, `dy`
 * onto a canvas of `toWidth` × `toHeight`: what lands inside becomes the new pixels, the rest the
 * new outside part (undefined when nothing is left out).
 */
export function reframe(
  pixels: Uint32Array,
  width: number,
  height: number,
  outside: Outside | undefined,
  dx: number,
  dy: number,
  toWidth: number,
  toHeight: number,
): { pixels: Uint32Array; outside?: Outside } {
  const inside = new Uint32Array(toWidth * toHeight);
  // Pixels that end up outside, as flat [x, y, color] triples, and their bounds.
  const out: number[] = [];
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const place = (x: number, y: number, c: number) => {
    const tx = x + dx;
    const ty = y + dy;
    if (tx >= 0 && ty >= 0 && tx < toWidth && ty < toHeight) {
      inside[ty * toWidth + tx] = c;
      return;
    }
    if (tx < -OUTSIDE_MARGIN || ty < -OUTSIDE_MARGIN || tx >= toWidth + OUTSIDE_MARGIN) return;
    if (ty >= toHeight + OUTSIDE_MARGIN) return;
    out.push(tx, ty, c);
    if (tx < minX) minX = tx;
    if (ty < minY) minY = ty;
    if (tx > maxX) maxX = tx;
    if (ty > maxY) maxY = ty;
  };
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const c = pixels[y * width + x];
      if (c >>> 24) place(x, y, c);
    }
  if (outside)
    for (let j = 0; j < outside.h; j++)
      for (let i = 0; i < outside.w; i++) {
        const x = outside.x + i;
        const y = outside.y + j;
        if (x >= 0 && y >= 0 && x < width && y < height) continue;
        const c = outside.pixels[j * outside.w + i];
        if (c >>> 24) place(x, y, c);
      }
  if (!out.length) return { pixels: inside };
  const w = maxX - minX + 1;
  const h = maxY - minY + 1;
  const kept = new Uint32Array(w * h);
  for (let k = 0; k < out.length; k += 3) kept[(out[k + 1] - minY) * w + (out[k] - minX)] = out[k + 2];
  return { pixels: inside, outside: { x: minX, y: minY, w, h, pixels: kept } };
}

/**
 * The outside part with more pixels laid over it, given as flat [x, y, color] triples in canvas
 * pixels (all outside the canvas). Pixels past `OUTSIDE_MARGIN` are dropped, like anywhere else.
 */
export function addOutside(
  outside: Outside | undefined,
  extra: number[],
  width: number,
  height: number,
): Outside | undefined {
  const kept: number[] = [];
  for (let k = 0; k < extra.length; k += 3) {
    const [x, y] = [extra[k], extra[k + 1]];
    const far =
      x < -OUTSIDE_MARGIN ||
      y < -OUTSIDE_MARGIN ||
      x >= width + OUTSIDE_MARGIN ||
      y >= height + OUTSIDE_MARGIN;
    if (!far) kept.push(x, y, extra[k + 2]);
  }
  if (!kept.length) return outside;
  let [minX, minY, maxX, maxY] = outside
    ? [outside.x, outside.y, outside.x + outside.w - 1, outside.y + outside.h - 1]
    : [Infinity, Infinity, -Infinity, -Infinity];
  for (let k = 0; k < kept.length; k += 3) {
    minX = Math.min(minX, kept[k]);
    maxX = Math.max(maxX, kept[k]);
    minY = Math.min(minY, kept[k + 1]);
    maxY = Math.max(maxY, kept[k + 1]);
  }
  const w = maxX - minX + 1;
  const h = maxY - minY + 1;
  const pixels = new Uint32Array(w * h);
  if (outside)
    for (let j = 0; j < outside.h; j++)
      pixels.set(
        outside.pixels.subarray(j * outside.w, (j + 1) * outside.w),
        (outside.y - minY + j) * w + (outside.x - minX),
      );
  for (let k = 0; k < kept.length; k += 3) pixels[(kept[k + 1] - minY) * w + (kept[k] - minX)] = kept[k + 2];
  return { x: minX, y: minY, w, h, pixels };
}

/** Mirrors the outside part along with a whole layer flipped across the canvas. */
export function flipOutside(o: Outside, width: number, height: number, horizontal: boolean): Outside {
  const pixels = new Uint32Array(o.w * o.h);
  for (let j = 0; j < o.h; j++)
    for (let i = 0; i < o.w; i++) {
      const si = horizontal ? o.w - 1 - i : i;
      const sj = horizontal ? j : o.h - 1 - j;
      pixels[j * o.w + i] = o.pixels[sj * o.w + si];
    }
  return horizontal ? { ...o, x: width - (o.x + o.w), pixels } : { ...o, y: height - (o.y + o.h), pixels };
}

/**
 * All of a layer's content, inside and outside the canvas, as one block with its rectangle in
 * canvas pixels (null when the layer is empty): what resizing a whole layer works on.
 */
export function layerContent(
  pixels: Uint32Array,
  width: number,
  height: number,
  outside: Outside | undefined,
): { rect: { x: number; y: number; w: number; h: number }; pixels: Uint32Array } | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const grow = (x: number, y: number) => {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  };
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) if (pixels[y * width + x] >>> 24) grow(x, y);
  const outsideAt = (x: number, y: number) =>
    !(x >= 0 && y >= 0 && x < width && y < height) && outside
      ? outside.pixels[(y - outside.y) * outside.w + (x - outside.x)]
      : 0;
  if (outside)
    for (let j = 0; j < outside.h; j++)
      for (let i = 0; i < outside.w; i++)
        if (outsideAt(outside.x + i, outside.y + j) >>> 24) grow(outside.x + i, outside.y + j);
  if (maxX < minX) return null;
  const w = maxX - minX + 1;
  const h = maxY - minY + 1;
  const block = new Uint32Array(w * h);
  for (let j = 0; j < h; j++)
    for (let i = 0; i < w; i++) {
      const x = minX + i;
      const y = minY + j;
      block[j * w + i] =
        x >= 0 && y >= 0 && x < width && y < height
          ? pixels[y * width + x]
          : outside &&
              x >= outside.x &&
              y >= outside.y &&
              x < outside.x + outside.w &&
              y < outside.y + outside.h
            ? outsideAt(x, y)
            : 0;
    }
  return { rect: { x: minX, y: minY, w, h }, pixels: block };
}
