import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { alpha, toCss } from '../../engine/color';
import { gradientColor, type GradientStop } from '../../engine/gradient';
import { stopsOf } from '../../engine/tools/gradient';
import { useT } from '../../i18n';
import { useEditor, useEditorState } from '../EditorContext';

/** The bar's preview, in art pixels: dithered as the canvas will be. */
const PREVIEW_W = 48;
const PREVIEW_H = 4;

/**
 * The gradient, edited like in Figma: a bar showing it with a handle per stop. Drag a handle to
 * move its stop; click it to pick its color from the palette (or transparent), or remove it; click
 * the bar to add a stop there. Stops only take palette colors, so a gradient never brings new ones.
 */
export function GradientEditor() {
  const t = useT();
  const editor = useEditor();
  const options = useEditorState((s) => s.options);
  const primary = useEditorState((s) => s.primary);
  const secondary = useEditorState((s) => s.secondary);
  const palette = useEditorState((s) => s.palette.colors);
  const stops = stopsOf(options, primary, secondary);
  const [open, setOpen] = useState<number | null>(null);
  // Fixed, above the bar: the options bar scrolls sideways and would cut it off.
  const [at, setAt] = useState({ left: 0, bottom: 0 });
  const openAt = (k: number | null) => {
    const r = barRef.current?.getBoundingClientRect();
    if (r) setAt({ left: r.left, bottom: window.innerHeight - r.top + 10 });
    setOpen(k);
  };
  const barRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const popRef = useRef<HTMLDivElement>(null);

  // The preview: the same dithering as on the canvas.
  useEffect(() => {
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    const image = ctx.createImageData(PREVIEW_W, PREVIEW_H);
    const view = new Uint32Array(image.data.buffer);
    for (let y = 0; y < PREVIEW_H; y++)
      for (let x = 0; x < PREVIEW_W; x++)
        view[y * PREVIEW_W + x] = gradientColor(stops, (x + 0.5) / PREVIEW_W, options.gradientDither, x, y);
    ctx.putImageData(image, 0, 0);
  });

  // A click outside the color popover closes it.
  useEffect(() => {
    if (open === null) return;
    const onDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (!popRef.current?.contains(target) && !barRef.current?.contains(target)) setOpen(null);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(null);
    window.addEventListener('pointerdown', onDown, true);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const save = (next: GradientStop[]) => editor.setOption('gradientStops', next);
  const atX = (clientX: number) => {
    const r = barRef.current!.getBoundingClientRect();
    return Math.min(1, Math.max(0, (clientX - r.left) / r.width));
  };

  const onHandleDown = (e: React.PointerEvent, k: number) => {
    e.preventDefault();
    e.stopPropagation();
    const x0 = e.clientX;
    let moved = false;
    const move = (ev: PointerEvent) => {
      if (!moved && Math.abs(ev.clientX - x0) < 3) return;
      moved = true;
      setOpen(null);
      save(stops.map((s, i) => (i === k ? { ...s, at: Math.round(atX(ev.clientX) * 100) / 100 } : s)));
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      if (!moved) openAt(open === k ? null : k);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  // A click on the bar adds a stop there, in the primary color, and opens its colors.
  const onBarDown = (e: React.PointerEvent) => {
    if (e.button !== 0 || stops.length >= 16) return;
    const where = Math.round(atX(e.clientX) * 100) / 100;
    const next = [...stops, { at: where, color: primary }].sort((p, q) => p.at - q.at);
    save(next);
    openAt(next.findIndex((s) => s.at === where && s.color === primary));
  };

  const swatch = (c: number) => (alpha(c) ? toCss(c) : undefined);
  const stop = open !== null ? stops[open] : null;
  return (
    <div className="gradient-editor">
      <div
        ref={barRef}
        className="gradient-bar"
        role="group"
        aria-label={t('gradient.stops')}
        data-tip={t('gradient.barHint')}
        onPointerDown={onBarDown}
      >
        <canvas ref={canvasRef} width={PREVIEW_W} height={PREVIEW_H} aria-hidden="true" />
        {stops.map((s, k) => (
          <button
            key={k}
            type="button"
            className={`gradient-stop${open === k ? ' is-open' : ''}${alpha(s.color) ? '' : ' is-clear'}`}
            style={{ left: `${s.at * 100}%`, background: swatch(s.color) }}
            aria-label={t('gradient.stop', { at: Math.round(s.at * 100) })}
            aria-expanded={open === k}
            onPointerDown={(e) => onHandleDown(e, k)}
          />
        ))}
      </div>
      {stop &&
        open !== null &&
        // In the body: the options bar is moved with a transform, which would move a fixed popover too.
        createPortal(
          <div
            ref={popRef}
            className="gradient-pop"
            role="dialog"
            aria-label={t('gradient.stopColor')}
            style={{ left: at.left, bottom: at.bottom }}
          >
            <div className="gradient-swatches">
              {palette.map((c, i) => (
                <button
                  key={i}
                  type="button"
                  className={`gradient-swatch${c === stop.color ? ' is-active' : ''}`}
                  style={{ background: toCss(c) }}
                  aria-label={toCss(c)}
                  onClick={() => save(stops.map((s, k) => (k === open ? { ...s, color: c } : s)))}
                />
              ))}
              <button
                type="button"
                className={`gradient-swatch is-clear${alpha(stop.color) ? '' : ' is-active'}`}
                aria-label={t('gradient.transparent')}
                data-tip={t('gradient.transparent')}
                onClick={() => save(stops.map((s, k) => (k === open ? { ...s, color: 0 } : s)))}
              />
            </div>
            <div className="gradient-pop-row">
              <span>{Math.round(stop.at * 100)} %</span>
              <button
                type="button"
                className="btn"
                disabled={stops.length <= 2}
                onClick={() => {
                  save(stops.filter((_, k) => k !== open));
                  setOpen(null);
                }}
              >
                {t('gradient.removeStop')}
              </button>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
