import { useEffect, useMemo, useRef, useState } from 'react';
import type { PixelBlock } from '../../engine/region';
import { downscaleToGrid, gridSize, type PixelGrid } from '../../engine/upscale';
import { useT } from '../../i18n';
import { checkerPattern, readTheme } from '../render/theme';
import { closeDialog } from '../uiStore';
import { Dialog } from './Dialog';

const PREVIEW = { w: 352, h: 220 };

/**
 * An imported image looks like pixel art scaled up: shows it with the grid found in it, lets the
 * grid be adjusted, and brings it back to its real pixels (or keeps it as it is).
 */
export function UpscaledDialog({
  image,
  grid: found,
  onRecover,
  onKeep,
}: {
  image: PixelBlock;
  grid: PixelGrid;
  onRecover: (block: PixelBlock, grid: PixelGrid) => void;
  onKeep: () => void;
}) {
  const t = useT();
  const [grid, setGrid] = useState(found);
  const decided = useRef(false);
  const canvas = useRef<HTMLCanvasElement>(null);
  const size = gridSize(image.width, image.height, grid);
  const source = useMemo(() => {
    const c = document.createElement('canvas');
    c.width = image.width;
    c.height = image.height;
    const ctx = c.getContext('2d')!;
    const data = ctx.createImageData(image.width, image.height);
    new Uint32Array(data.data.buffer).set(image.pixels);
    ctx.putImageData(data, 0, 0);
    return c;
  }, [image]);

  // The image fitted in the preview, with the grid's lines over it.
  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const dpr = window.devicePixelRatio || 1;
    el.width = PREVIEW.w * dpr;
    el.height = PREVIEW.h * dpr;
    const ctx = el.getContext('2d')!;
    const theme = readTheme();
    const k = Math.min(el.width / image.width, el.height / image.height);
    const w = image.width * k;
    const h = image.height * k;
    const x = Math.round((el.width - w) / 2);
    const y = Math.round((el.height - h) / 2);
    ctx.fillStyle = theme.canvas;
    ctx.fillRect(0, 0, el.width, el.height);
    ctx.fillStyle = checkerPattern(ctx, Math.round(5 * dpr), theme.checkA, theme.checkB);
    ctx.fillRect(x, y, w, h);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(source, x, y, w, h);
    const step = grid.scale * k;
    if (step < 3) return;
    ctx.fillStyle = theme.highlight;
    ctx.globalAlpha = 0.7;
    for (let gx = grid.offsetX; gx <= image.width; gx += grid.scale)
      ctx.fillRect(Math.round(x + gx * k), y, 1, h);
    for (let gy = grid.offsetY; gy <= image.height; gy += grid.scale)
      ctx.fillRect(x, Math.round(y + gy * k), w, 1);
    ctx.globalAlpha = 1;
  }, [image, source, grid]);

  const set = (key: keyof PixelGrid, value: number) =>
    setGrid((g) => {
      const next = { ...g, [key]: value };
      // The offset stays within one cell.
      next.offsetX = Math.min(next.offsetX, next.scale - 1);
      next.offsetY = Math.min(next.offsetY, next.scale - 1);
      return next;
    });
  const field = (key: keyof PixelGrid, label: string, min: number, max: number) => (
    <label className="field">
      <span className="field-label">{label}</span>
      <input
        type="number"
        min={min}
        max={max}
        value={grid[key]}
        aria-label={label}
        onChange={(e) => set(key, Math.max(min, Math.min(max, Math.round(Number(e.target.value) || min))))}
      />
    </label>
  );

  return (
    <Dialog
      title={t('upscaled.title')}
      submitLabel={t('upscaled.recover')}
      cancelLabel={t('upscaled.keep')}
      onSubmit={() => {
        decided.current = true;
        onRecover(downscaleToGrid(image.pixels, image.width, image.height, grid), grid);
      }}
      onClose={() => {
        // Closing without recovering imports the image as it is: it was still wanted.
        if (!decided.current) onKeep();
        decided.current = true;
        closeDialog();
      }}
    >
      <p className="muted">{t('upscaled.hint', { scale: found.scale })}</p>
      <canvas ref={canvas} className="upscaled-preview" style={{ width: PREVIEW.w, height: PREVIEW.h }} />
      <div className="three-columns">
        {field('scale', t('upscaled.scale'), 2, 64)}
        {field('offsetX', t('upscaled.offsetX'), 0, grid.scale - 1)}
        {field('offsetY', t('upscaled.offsetY'), 0, grid.scale - 1)}
      </div>
      <p className="muted">
        {t('upscaled.result', { w: image.width, h: image.height, rw: size.width, rh: size.height })}
      </p>
    </Dialog>
  );
}
