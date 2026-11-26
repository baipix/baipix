import { useLayoutEffect, useRef } from 'react';
import { pixelBounds } from '../../engine/region';

interface ThumbnailProps {
  pixels: () => Uint32Array;
  width: number;
  height: number;
  /** Bump to redraw. */
  version: number;
  /**
   * Shows what's drawn, not the whole canvas: the pixels' bounds fill the thumbnail (a small
   * character on a big board is seen, not a dot). The thumbnail keeps the canvas's proportions.
   */
  fit?: boolean;
}

/** Thumbnails are 20px high; their width follows the drawing, between these ratios. */
const MIN_RATIO = 0.5;
const MAX_RATIO = 2;
/** Canvas pixels per CSS pixel, so thumbnails stay sharp on 2× screens. */
const DENSITY = 2;

/** One canvas the pixels go through on their way to every thumbnail, drawn one after the other. */
let scratch: HTMLCanvasElement | null = null;

const sameContent = (a: Uint32Array, b: Uint32Array): boolean => {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
};

/**
 * Small preview of a pixel buffer, with the drawing's proportions: a wide drawing gets a wide
 * thumbnail instead of a thin strip in a square. Very wide or tall ones are capped and fitted.
 */
export function Thumbnail({ pixels, width, height, version, fit = false }: ThumbnailProps) {
  const ref = useRef<HTMLCanvasElement>(null);
  /** What was drawn last, and how: a new version with the same pixels draws nothing. */
  const drawn = useRef<{ pixels: Uint32Array; width: number; height: number; fit: boolean } | null>(null);
  useLayoutEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const data = pixels();
    const last = drawn.current;
    if (
      last &&
      last.width === width &&
      last.height === height &&
      last.fit === fit &&
      sameContent(last.pixels, data)
    )
      return;
    const copy = data.slice();
    drawn.current = { pixels: copy, width, height, fit };
    const ratio = Math.min(MAX_RATIO, Math.max(MIN_RATIO, width / height));
    const h = 20 * DENSITY;
    const w = Math.round(h * ratio);
    canvas.width = w;
    canvas.height = h;
    canvas.style.width = `${w / DENSITY}px`;
    const ctx = canvas.getContext('2d')!;
    const src = (scratch ??= document.createElement('canvas'));
    if (src.width !== width || src.height !== height) {
      src.width = width;
      src.height = height;
    }
    const sctx = src.getContext('2d')!;
    // The kept copy, seen as bytes: no other buffer to fill.
    const image = new ImageData(new Uint8ClampedArray(copy.buffer as ArrayBuffer), width, height);
    sctx.putImageData(image, 0, 0);
    const box = (fit && pixelBounds(data, width, height)) || { x: 0, y: 0, w: width, h: height };
    // Fitted, a pixel's margin around what's drawn, whole pixels when they're big enough.
    const pad = fit && (box.w < width || box.h < height) ? 2 * DENSITY : 0;
    let k = Math.min((w - pad * 2) / box.w, (h - pad * 2) / box.h);
    if (k >= 1) k = Math.floor(k);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(
      src,
      box.x,
      box.y,
      box.w,
      box.h,
      (w - box.w * k) / 2,
      (h - box.h * k) / 2,
      box.w * k,
      box.h * k,
    );
    // `pixels` is intentionally read lazily; `version` drives redraws.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [width, height, version, fit]);
  return <canvas ref={ref} className="thumb" aria-hidden="true" />;
}
