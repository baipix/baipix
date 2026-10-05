import type { PixelBlock } from './region';

/**
 * Scale2x (EPX): doubles a block, rounding diagonal edges instead of making them blocky, and only
 * ever reusing its own colors. Three passes give the 8× image RotSprite samples from.
 */
export function scale2x(src: PixelBlock): PixelBlock {
  const { width: w, height: h, pixels } = src;
  const out = new Uint32Array(w * h * 4);
  const ow = w * 2;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const p = pixels[y * w + x];
      // Outside the block counts as the pixel itself, so the edges don't grow corners.
      const a = y > 0 ? pixels[(y - 1) * w + x] : p;
      const b = x < w - 1 ? pixels[y * w + x + 1] : p;
      const c = x > 0 ? pixels[y * w + x - 1] : p;
      const d = y < h - 1 ? pixels[(y + 1) * w + x] : p;
      const i = y * 2 * ow + x * 2;
      out[i] = c === a && c !== d && a !== b ? a : p;
      out[i + 1] = a === b && a !== c && b !== d ? b : p;
      out[i + ow] = d === c && d !== b && c !== a ? c : p;
      out[i + ow + 1] = b === d && b !== a && d !== c ? d : p;
    }
  return { width: ow, height: h * 2, pixels: out };
}

/** Above this many source pixels, the 8× image would be too big: sample the block itself. */
const MAX_UPSCALED = 256 * 256;

/** The block's size once rotated by `degrees` (its bounding box). */
export function rotatedSize(
  width: number,
  height: number,
  degrees: number,
): { width: number; height: number } {
  const r = (degrees * Math.PI) / 180;
  const c = Math.abs(Math.cos(r));
  const s = Math.abs(Math.sin(r));
  // A hair under, so 90° turns don't gain a pixel from rounding.
  return {
    width: Math.max(1, Math.ceil(width * c + height * s - 1e-6)),
    height: Math.max(1, Math.ceil(width * s + height * c - 1e-6)),
  };
}

/** A rotation prepared for one block: the 8× image is made once, then any angle is quick. */
export interface Rotator {
  rotate(degrees: number): PixelBlock;
}

/**
 * Rotates a block by any angle, clockwise, the RotSprite way: the block is scaled up 8× with
 * Scale2x, then each pixel of the result takes the color under its center in that big image. Lines
 * stay clean and no new colors appear. Right angles are turned exactly.
 */
export function rotator(block: PixelBlock): Rotator {
  let big: PixelBlock | null = null;
  const source = () => {
    if (big) return big;
    // Three Scale2x passes: 8×.
    big = block.width * block.height > MAX_UPSCALED ? block : scale2x(scale2x(scale2x(block)));
    return big;
  };
  return {
    rotate(degrees) {
      const turns = (((Math.round(degrees) % 360) + 360) % 360) / 90;
      if (Number.isInteger(turns) && Math.abs(degrees - Math.round(degrees)) < 1e-9)
        return quarterTurns(block, turns);
      const src = source();
      const k = src.width / block.width;
      const size = rotatedSize(block.width, block.height, degrees);
      const out = new Uint32Array(size.width * size.height);
      const r = (degrees * Math.PI) / 180;
      const cos = Math.cos(r);
      const sin = Math.sin(r);
      for (let oy = 0; oy < size.height; oy++)
        for (let ox = 0; ox < size.width; ox++) {
          // From the result's pixel center back into the block (turned the other way).
          const vx = ox + 0.5 - size.width / 2;
          const vy = oy + 0.5 - size.height / 2;
          const sx = (vx * cos + vy * sin + block.width / 2) * k;
          const sy = (-vx * sin + vy * cos + block.height / 2) * k;
          const x = Math.floor(sx);
          const y = Math.floor(sy);
          if (x >= 0 && y >= 0 && x < src.width && y < src.height)
            out[oy * size.width + ox] = src.pixels[y * src.width + x];
        }
      return { ...size, pixels: out };
    },
  };
}

/** Exact quarter turns, clockwise. */
function quarterTurns(block: PixelBlock, turns: number): PixelBlock {
  const { width: w, height: h, pixels } = block;
  if (turns % 4 === 0) return { width: w, height: h, pixels: pixels.slice() };
  const odd = turns % 2 === 1;
  const ow = odd ? h : w;
  const oh = odd ? w : h;
  const out = new Uint32Array(ow * oh);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const c = pixels[y * w + x];
      const [tx, ty] = turns === 1 ? [h - 1 - y, x] : turns === 2 ? [w - 1 - x, h - 1 - y] : [y, w - 1 - x];
      out[ty * ow + tx] = c;
    }
  return { width: ow, height: oh, pixels: out };
}
