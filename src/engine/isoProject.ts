/**
 * Laying a flat image (a logo, a texture) onto a face of an isometric box, kept crisp: no pixel is
 * blended, each one lands on, or is picked for, whole pixels.
 */
export type IsoFace = 'left' | 'right' | 'top';

/**
 * Where each pixel of the image lands: the size of the result, and for each of its pixels the
 * index of the image pixel it shows, or -1.
 * - `left`: the front left face. Columns slide down one pixel every two, so its top edge goes
 *   down to the right at 2:1, like the box's. Nothing is lost.
 * - `right`: the front right face, going up to the right the same way.
 * - `top`: the top, the image turned by 45° and flattened to half its height, at twice its size:
 *   each pixel becomes a little 2:1 diamond of four, since at its own size some pixels would be
 *   lost. Its top left corner becomes the top corner, its top row the edge going down to the
 *   right, in clean 2:1 steps.
 */
export function isoFaceMapping(
  face: IsoFace,
  w: number,
  h: number,
): { width: number; height: number; source: Int32Array } {
  if (face === 'top') {
    // Its corners are pairs of pixels: the outermost columns would stay empty.
    const width = 2 * (w + h) - 2;
    const height = w + h;
    const source = new Int32Array(width * height).fill(-1);
    // Each pixel of the result shows the image pixel its center falls in. No center is ever on
    // the edge of one: every image pixel gets exactly four.
    for (let Y = 0; Y < height; Y++)
      for (let X = 0; X < width; X++) {
        const x = X + 1.5 - 2 * h;
        const y = Y + 0.5;
        const u = Math.floor((y + x / 2) / 2);
        const v = Math.floor((y - x / 2) / 2);
        if (u >= 0 && u < w && v >= 0 && v < h) source[Y * width + X] = v * w + u;
      }
    return { width, height, source };
  }
  const width = w;
  const height = h + Math.floor((w - 1) / 2);
  const source = new Int32Array(width * height).fill(-1);
  for (let x = 0; x < w; x++) {
    const drop = Math.floor((face === 'left' ? x : w - 1 - x) / 2);
    for (let y = 0; y < h; y++) source[(y + drop) * width + x] = y * w + x;
  }
  return { width, height, source };
}
