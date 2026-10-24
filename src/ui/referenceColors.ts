import { pack, type Color } from '../engine/color';
import type { PixelDoc } from '../engine/document';

/** Each reference image's pixels, read once its picture has loaded (null meanwhile). */
const pixels = new Map<string, { data: Uint8ClampedArray; width: number; height: number } | null>();

function read(src: string): { data: Uint8ClampedArray; width: number; height: number } | null {
  const known = pixels.get(src);
  if (known !== undefined) return known;
  pixels.set(src, null);
  const img = new Image();
  img.onload = () => {
    const c = document.createElement('canvas');
    c.width = img.naturalWidth;
    c.height = img.naturalHeight;
    const ctx = c.getContext('2d', { willReadFrequently: true })!;
    ctx.drawImage(img, 0, 0);
    pixels.set(src, {
      data: ctx.getImageData(0, 0, c.width, c.height).data,
      width: c.width,
      height: c.height,
    });
  };
  img.src = src;
  return null;
}

/**
 * The reference image's color under the art pixel (x, y) of `doc`, in full (its opacity is for seeing
 * the drawing over it), or 0 outside it, where it's transparent, or before its picture has loaded.
 */
export function referenceColorAt(doc: PixelDoc, x: number, y: number): Color {
  const r = doc.reference;
  if (!r) return 0;
  const u = (x + 0.5 - r.x) / r.w;
  const v = (y + 0.5 - r.y) / r.h;
  if (u < 0 || v < 0 || u >= 1 || v >= 1) return 0;
  const p = read(r.src);
  if (!p) return 0;
  const i = (Math.floor(v * p.height) * p.width + Math.floor(u * p.width)) * 4;
  return p.data[i + 3] ? pack(p.data[i], p.data[i + 1], p.data[i + 2]) : 0;
}
