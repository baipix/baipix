import { useEffect, useMemo, useRef, useState } from 'react';
import { MAX_SIZE } from '../../engine/document';
import type { PixelBlock } from '../../engine/region';
import { clampDuration, DEFAULT_DURATION, DURATION, MAX_FRAMES } from '../../engine/frames';
import { useT } from '../../i18n';
import { checkerPattern, readTheme } from '../render/theme';
import { closeDialog } from '../uiStore';
import { Dialog } from './Dialog';

const PREVIEW = { w: 352, h: 220 };

function positiveInt(value: string): number | null {
  const n = Math.floor(Number(value));
  return Number.isFinite(n) && n >= 1 ? n : null;
}

/**
 * Splits an imported image into animation frames by cell size or column/row count,
 * or imports it as a single image.
 */
export function SpriteSheetDialog({
  image,
  onSlice,
  onSingleImage,
}: {
  image: PixelBlock;
  onSlice: (cellWidth: number, cellHeight: number, cols: number, rows: number, duration: number) => void;
  onSingleImage: () => void;
}) {
  const t = useT();
  const [cellWText, setCellWText] = useState(String(Math.min(image.width, MAX_SIZE)));
  const [cellHText, setCellHText] = useState(String(Math.min(image.height, MAX_SIZE)));
  const [colsText, setColsText] = useState(String(Math.max(1, Math.ceil(image.width / MAX_SIZE))));
  const [rowsText, setRowsText] = useState(String(Math.max(1, Math.ceil(image.height / MAX_SIZE))));
  const [durationText, setDurationText] = useState(String(DEFAULT_DURATION));
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const decided = useRef(false);

  const cellWidth = positiveInt(cellWText) ?? 0;
  const cellHeight = positiveInt(cellHText) ?? 0;
  const cols = positiveInt(colsText) ?? 0;
  const rows = positiveInt(rowsText) ?? 0;
  const duration = clampDuration(Number(durationText) || DEFAULT_DURATION);
  const frameCount = cols * rows;

  const fitsBounds =
    cellWidth >= 1 &&
    cellHeight >= 1 &&
    cols >= 1 &&
    rows >= 1 &&
    cols * cellWidth <= image.width &&
    rows * cellHeight <= image.height;
  const withinMaxSize = cellWidth <= MAX_SIZE && cellHeight <= MAX_SIZE;
  const withinMaxFrames = frameCount >= 1 && frameCount <= MAX_FRAMES;
  const valid = fitsBounds && withinMaxSize && withinMaxFrames;

  const updateCols = (raw: string) => {
    setColsText(raw);
    const n = positiveInt(raw);
    if (n !== null) {
      const clampedCols = Math.min(n, image.width);
      setCellWText(String(Math.max(1, Math.floor(image.width / clampedCols))));
    }
  };

  const updateRows = (raw: string) => {
    setRowsText(raw);
    const n = positiveInt(raw);
    if (n !== null) {
      const clampedRows = Math.min(n, image.height);
      setCellHText(String(Math.max(1, Math.floor(image.height / clampedRows))));
    }
  };

  const updateCellWidth = (raw: string) => {
    setCellWText(raw);
    const n = positiveInt(raw);
    if (n !== null) {
      const clampedW = Math.min(n, image.width);
      setColsText(String(Math.max(1, Math.floor(image.width / clampedW))));
    }
  };

  const updateCellHeight = (raw: string) => {
    setCellHText(raw);
    const n = positiveInt(raw);
    if (n !== null) {
      const clampedH = Math.min(n, image.height);
      setRowsText(String(Math.max(1, Math.floor(image.height / clampedH))));
    }
  };

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

  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const dpr = window.devicePixelRatio || 1;
    el.width = PREVIEW.w * dpr;
    el.height = PREVIEW.h * dpr;
    const ctx = el.getContext('2d');
    if (!ctx) return;

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

    if (!valid) return;

    const usedW = cols * cellWidth * k;
    const usedH = rows * cellHeight * k;

    // Dim the unused image area outside the active sprite sheet cells.
    ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
    if (usedW < w) {
      ctx.fillRect(Math.round(x + usedW), y, Math.round(w - usedW), Math.round(h));
    }
    if (usedH < h) {
      ctx.fillRect(x, Math.round(y + usedH), Math.round(usedW), Math.round(h - usedH));
    }

    // Grid lines matching theme highlight color.
    ctx.fillStyle = theme.highlight;
    ctx.globalAlpha = 0.8;
    for (let c = 0; c <= cols; c++) {
      ctx.fillRect(Math.round(x + c * cellWidth * k), y, 1, Math.round(usedH));
    }
    for (let r = 0; r <= rows; r++) {
      ctx.fillRect(x, Math.round(y + r * cellHeight * k), Math.round(usedW), 1);
    }
    ctx.globalAlpha = 1;
  }, [image, source, cols, rows, cellWidth, cellHeight, valid]);

  let summary: string;
  if (!withinMaxSize) {
    summary = t('spriteSheet.tooLarge', { max: MAX_SIZE });
  } else if (!withinMaxFrames) {
    summary = t('spriteSheet.tooManyFrames', { max: MAX_FRAMES });
  } else if (!fitsBounds) {
    summary = `${image.width} × ${image.height} px`;
  } else if (frameCount === 1) {
    summary = t('spriteSheet.summarySingle', { w: cellWidth, h: cellHeight });
  } else {
    summary = t('spriteSheet.summary', { count: frameCount, w: cellWidth, h: cellHeight });
  }

  return (
    <Dialog
      title={t('spriteSheet.title')}
      className="sprite-sheet-dialog"
      submitLabel={
        valid && frameCount > 1
          ? t('spriteSheet.importFrames', { count: frameCount })
          : t('spriteSheet.import')
      }
      cancelLabel={t('spriteSheet.singleImage')}
      submitDisabled={!valid}
      onSubmit={() => {
        if (!valid) return;
        decided.current = true;
        onSlice(cellWidth, cellHeight, cols, rows, duration);
      }}
      onClose={() => {
        // Closing without slicing imports the image as it is: it was still wanted.
        if (!decided.current) onSingleImage();
        decided.current = true;
        closeDialog();
      }}
    >
      <p className="muted">{t('spriteSheet.hint')}</p>
      <canvas ref={canvasRef} className="upscaled-preview" style={{ width: PREVIEW.w, height: PREVIEW.h }} />
      <div className="sprite-sheet-fields">
        <label className="field">
          <span className="field-label">{t('spriteSheet.cellWidth')}</span>
          <input
            type="number"
            min={1}
            max={Math.min(MAX_SIZE, image.width)}
            value={cellWText}
            onChange={(e) => updateCellWidth(e.target.value)}
            required
          />
        </label>
        <label className="field">
          <span className="field-label">{t('spriteSheet.cellHeight')}</span>
          <input
            type="number"
            min={1}
            max={Math.min(MAX_SIZE, image.height)}
            value={cellHText}
            onChange={(e) => updateCellHeight(e.target.value)}
            required
          />
        </label>
        <label className="field">
          <span className="field-label">{t('spriteSheet.columns')}</span>
          <input
            type="number"
            min={1}
            max={image.width}
            value={colsText}
            onChange={(e) => updateCols(e.target.value)}
            required
          />
        </label>
        <label className="field">
          <span className="field-label">{t('spriteSheet.rows')}</span>
          <input
            type="number"
            min={1}
            max={image.height}
            value={rowsText}
            onChange={(e) => updateRows(e.target.value)}
            required
          />
        </label>
        <label className="field sprite-sheet-duration">
          <span className="field-label">{t('spriteSheet.duration')}</span>
          <input
            type="number"
            min={DURATION.min}
            max={DURATION.max}
            step={10}
            value={durationText}
            onChange={(e) => setDurationText(e.target.value)}
            required
          />
        </label>
      </div>
      <p className={valid ? 'muted' : 'sprite-sheet-error'}>{summary}</p>
    </Dialog>
  );
}
