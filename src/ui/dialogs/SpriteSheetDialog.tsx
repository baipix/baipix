import { useEffect, useRef, useState } from 'react';
import { MAX_SIZE } from '../../engine/document';
import type { PixelBlock } from '../../engine/region';
import { clampDuration, DEFAULT_DURATION, DURATION, MAX_FRAMES } from '../../engine/frames';
import { useT } from '../../i18n';
import { closeDialog } from '../uiStore';
import { Dialog } from './Dialog';

const PREVIEW_W = 360;
const PREVIEW_H = 180;

function positiveInt(value: string): number | null {
  const n = Math.floor(Number(value));
  return Number.isFinite(n) && n >= 1 ? n : null;
}

/**
 * Splits an imported image into animation frames by cell size or column/row count,
 * or keeps it as a single frame.
 */
export function SpriteSheetDialog({
  image,
  onSlice,
  onSingleImage,
  onCancel,
}: {
  image: PixelBlock;
  onSlice: (cellWidth: number, cellHeight: number, cols: number, rows: number, duration: number) => void;
  onSingleImage: () => void;
  onCancel: () => void;
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

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const scale = Math.min(PREVIEW_W / image.width, PREVIEW_H / image.height);
    const cw = Math.max(1, Math.round(image.width * scale));
    const ch = Math.max(1, Math.round(image.height * scale));
    canvas.width = cw;
    canvas.height = ch;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const offscreen = document.createElement('canvas');
    offscreen.width = image.width;
    offscreen.height = image.height;
    const offCtx = offscreen.getContext('2d');
    if (!offCtx) return;

    const imgData = offCtx.createImageData(image.width, image.height);
    imgData.data.set(
      new Uint8ClampedArray(image.pixels.buffer, image.pixels.byteOffset, image.pixels.byteLength),
    );
    offCtx.putImageData(imgData, 0, 0);

    ctx.clearRect(0, 0, cw, ch);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(offscreen, 0, 0, cw, ch);

    if (!valid) return;

    const sx = cw / image.width;
    const sy = ch / image.height;
    const usedW = cols * cellWidth * sx;
    const usedH = rows * cellHeight * sy;

    if (usedW < cw) {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
      ctx.fillRect(usedW, 0, cw - usedW, ch);
    }
    if (usedH < ch) {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
      ctx.fillRect(0, usedH, usedW, ch - usedH);
    }

    ctx.save();
    ctx.strokeStyle = 'rgba(255, 90, 50, 0.9)';
    ctx.lineWidth = 1;
    for (let c = 0; c <= cols; c++) {
      const x = Math.min(cw - 0.5, Math.round(c * cellWidth * sx) + 0.5);
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, usedH);
      ctx.stroke();
    }
    for (let r = 0; r <= rows; r++) {
      const y = Math.min(ch - 0.5, Math.round(r * cellHeight * sy) + 0.5);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(usedW, y);
      ctx.stroke();
    }
    ctx.restore();
  }, [image, cols, rows, cellWidth, cellHeight, valid]);

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
      submitDisabled={!valid}
      onSubmit={() => {
        if (!valid) return;
        decided.current = true;
        onSlice(cellWidth, cellHeight, cols, rows, duration);
      }}
      onClose={() => {
        closeDialog();
        if (!decided.current) onCancel();
      }}
      footer={
        <button
          type="button"
          className="link-btn"
          onClick={() => {
            decided.current = true;
            onSingleImage();
            closeDialog();
          }}
        >
          {t('spriteSheet.singleImage')}
        </button>
      }
    >
      <p className="muted">{t('spriteSheet.hint')}</p>
      <canvas ref={canvasRef} className="upscaled-preview" />
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
