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

/**
 * Small preview of a pixel buffer, with the drawing's proportions: a wide drawing gets a wide
 * thumbnail instead of a thin strip in a square. Very wide or tall ones are capped and fitted.
 */
export function Thumbnail({ pixels, width, height, version, fit = false }: ThumbnailProps) {
  const ref = useRef<HTMLCanvasElement>(null);
  useLayoutEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ratio = Math.min(MAX_RATIO, Math.max(MIN_RATIO, width / height));
    const h = 20 * DENSITY;
    const w = Math.round(h * ratio);
    canvas.width = w;
    canvas.height = h;
    canvas.style.width = `${w / DENSITY}px`;
    const ctx = canvas.getContext('2d')!;
    const src = document.createElement('canvas');
    src.width = width;
    src.height = height;
    const sctx = src.getContext('2d')!;
    const image = sctx.createImageData(width, height);
    const data = pixels();
    new Uint32Array(image.data.buffer).set(data);
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
