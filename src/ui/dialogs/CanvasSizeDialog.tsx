import { useEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import { toCss } from '../../engine/color';
import { flatten } from '../../engine/composite';
import { hasBackground, MAX_SIZE } from '../../engine/document';
import { clamp } from '../../engine/math';
import { useT } from '../../i18n';
import { useEditor } from '../EditorContext';
import { AnchorGrid, type Anchor } from '../components/AnchorGrid';
import { checkerPattern, readTheme } from '../render/theme';
import { closeDialog } from '../uiStore';
import { Dialog } from './Dialog';

const PREVIEW = { w: 368, h: 240 };
/** Room around the drawing and the frame in the preview, in CSS px. */
const PAD = 20;
/** How close to a handle the pointer grabs it, in CSS px. */
const GRAB = 10;

/** The new canvas, and where the old one's top-left lands in it (in art pixels). */
interface Frame {
  w: number;
  h: number;
  ox: number;
  oy: number;
}
/** Where the new canvas's top-left sits in the preview, and CSS px per art pixel. */
interface View {
  x0: number;
  y0: number;
  k: number;
}
/** Which edges a handle moves: -1 the left / top one, 1 the right / bottom one, 0 neither. */
type Handle = { dx: -1 | 0 | 1; dy: -1 | 0 | 1 };

const HANDLES: Handle[] = [-1, 0, 1].flatMap((dy) =>
  [-1, 0, 1].filter((dx) => dx || dy).map((dx) => ({ dx, dy }) as Handle),
);
const CURSORS: Record<string, string> = {
  '-1,-1': 'nwse-resize',
  '1,1': 'nwse-resize',
  '1,-1': 'nesw-resize',
  '-1,1': 'nesw-resize',
  '-1,0': 'ew-resize',
  '1,0': 'ew-resize',
  '0,-1': 'ns-resize',
  '0,1': 'ns-resize',
};

/** The offset that puts the old canvas at an anchor of the new one, on one axis. */
const anchored = (a: 0 | 1 | 2, size: number, old: number) =>
  a === 0 ? 0 : a === 1 ? Math.floor((size - old) / 2) : size - old;

/** Fits both the drawing and the frame in the preview, at a whole scale when zoomed in. */
function fit(f: Frame, oldW: number, oldH: number): View {
  const minX = Math.min(0, f.ox);
  const minY = Math.min(0, f.oy);
  const maxX = Math.max(f.w, f.ox + oldW);
  const maxY = Math.max(f.h, f.oy + oldH);
  let k = Math.min((PREVIEW.w - 2 * PAD) / (maxX - minX), (PREVIEW.h - 2 * PAD) / (maxY - minY));
  if (k > 1) k = Math.floor(k);
  return {
    k,
    x0: Math.round(PREVIEW.w / 2 - ((minX + maxX) / 2) * k),
    y0: Math.round(PREVIEW.h / 2 - ((minY + maxY) / 2) * k),
  };
}

/**
 * Resizes the canvas on a preview: the frame's handles make it bigger or smaller, the drawing is
 * dragged inside it, and the anchor grid or the fields set it precisely. One undo step on Apply.
 */
export function CanvasSizeDialog() {
  const t = useT();
  const editor = useEditor();
  const doc = editor.getState().doc;
  const oldW = doc.width;
  const oldH = doc.height;
  const [frame, setFrame] = useState<Frame>({ w: oldW, h: oldH, ox: 0, oy: 0 });
  const [anchor, setAnchor] = useState<Anchor | null>({ x: 1, y: 1 });
  // Frozen while dragging, so what is under the pointer stays there; fitted again on release.
  const [dragView, setDragView] = useState<View | null>(null);
  const view = dragView ?? fit(frame, oldW, oldH);
  const drag = useRef<{ handle: Handle | null; px: number; py: number; frame: Frame; view: View } | null>(
    null,
  );
  const canvas = useRef<HTMLCanvasElement>(null);
  // Typed values, kept while a field is being edited (it may be empty or out of range for a moment).
  const [draft, setDraft] = useState<{ w?: string; h?: string }>({});

  const source = useMemo(() => {
    const c = document.createElement('canvas');
    c.width = oldW;
    c.height = oldH;
    const ctx = c.getContext('2d')!;
    const data = ctx.createImageData(oldW, oldH);
    new Uint32Array(data.data.buffer).set(flatten(doc, { includeBackground: false }));
    ctx.putImageData(data, 0, 0);
    return c;
  }, [doc, oldW, oldH]);

  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const dpr = window.devicePixelRatio || 1;
    el.width = PREVIEW.w * dpr;
    el.height = PREVIEW.h * dpr;
    const ctx = el.getContext('2d')!;
    ctx.scale(dpr, dpr);
    ctx.imageSmoothingEnabled = false;
    const theme = readTheme();
    const { x0, y0, k } = view;
    const fw = frame.w * k;
    const fh = frame.h * k;
    ctx.fillStyle = theme.canvas;
    ctx.fillRect(0, 0, PREVIEW.w, PREVIEW.h);
    // The new canvas: its background, or the transparency checkerboard.
    ctx.fillStyle = hasBackground(doc)
      ? toCss(doc.background)
      : checkerPattern(ctx, 5, theme.checkA, theme.checkB);
    ctx.fillRect(x0, y0, fw, fh);
    ctx.drawImage(source, x0 + frame.ox * k, y0 + frame.oy * k, oldW * k, oldH * k);
    // What falls outside the new canvas is dimmed: it's kept, but out of view.
    ctx.fillStyle = theme.canvas;
    ctx.globalAlpha = 0.6;
    ctx.beginPath();
    ctx.rect(0, 0, PREVIEW.w, PREVIEW.h);
    ctx.rect(x0, y0, fw, fh);
    ctx.fill('evenodd');
    ctx.globalAlpha = 1;
    // The frame and its handles, like the selection's on the canvas.
    ctx.strokeStyle = theme.highlight;
    ctx.lineWidth = 1;
    ctx.strokeRect(x0 - 0.5, y0 - 0.5, fw + 1, fh + 1);
    const hs = 8;
    for (const h of HANDLES) {
      const hx = Math.round(x0 + ((h.dx + 1) / 2) * fw - hs / 2);
      const hy = Math.round(y0 + ((h.dy + 1) / 2) * fh - hs / 2);
      ctx.fillStyle = theme.handle;
      ctx.fillRect(hx, hy, hs, hs);
      ctx.strokeRect(hx + 0.5, hy + 0.5, hs - 1, hs - 1);
    }
  }, [doc, source, frame, view, oldW, oldH]);

  const handleAt = (x: number, y: number): Handle | null => {
    const { x0, y0, k } = view;
    for (const h of HANDLES) {
      const hx = x0 + ((h.dx + 1) / 2) * frame.w * k;
      const hy = y0 + ((h.dy + 1) / 2) * frame.h * k;
      if (Math.abs(x - hx) <= GRAB && Math.abs(y - hy) <= GRAB) return h;
    }
    return null;
  };
  const local = (e: PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const onPointerDown = (e: PointerEvent<HTMLCanvasElement>) => {
    if (e.button !== 0) return;
    const p = local(e);
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { handle: handleAt(p.x, p.y), px: p.x, py: p.y, frame, view };
    setDragView(view);
  };
  const onPointerMove = (e: PointerEvent<HTMLCanvasElement>) => {
    const p = local(e);
    const d = drag.current;
    if (!d) {
      const h = handleAt(p.x, p.y);
      e.currentTarget.style.cursor = h ? CURSORS[`${h.dx},${h.dy}`] : 'move';
      return;
    }
    // Whole art pixels.
    const mx = Math.round((p.x - d.px) / d.view.k);
    const my = Math.round((p.y - d.py) / d.view.k);
    const s = d.frame;
    if (!d.handle) {
      // The drawing moves, as long as some of it stays in the frame.
      setFrame({ ...s, ox: clamp(s.ox + mx, 1 - oldW, s.w - 1), oy: clamp(s.oy + my, 1 - oldH, s.h - 1) });
    } else {
      const { dx, dy } = d.handle;
      // Moving the left / top edge moves the frame's corner: the drawing stays put on screen.
      const w = dx ? clamp(s.w + dx * mx, 1, MAX_SIZE) : s.w;
      const h = dy ? clamp(s.h + dy * my, 1, MAX_SIZE) : s.h;
      const shiftX = dx < 0 ? s.w - w : 0;
      const shiftY = dy < 0 ? s.h - h : 0;
      setFrame({ w, h, ox: s.ox - shiftX, oy: s.oy - shiftY });
      setDragView({ ...d.view, x0: d.view.x0 + shiftX * d.view.k, y0: d.view.y0 + shiftY * d.view.k });
    }
    setAnchor(null);
    setDraft({});
  };
  const onPointerUp = () => {
    drag.current = null;
    setDragView(null);
  };

  /** A new size from the fields: the drawing keeps its anchor, or its place if it was dragged. */
  const setSize = (w: number, h: number, a = anchor) =>
    setFrame((f) => ({
      w,
      h,
      ox: a ? anchored(a.x, w, oldW) : f.ox,
      oy: a ? anchored(a.y, h, oldH) : f.oy,
    }));
  const field = (key: 'w' | 'h', label: string, aria: string) => (
    <label className="field">
      <span className="field-label">{label}</span>
      <input
        type="number"
        min={1}
        max={MAX_SIZE}
        value={draft[key] ?? frame[key]}
        aria-label={aria}
        required
        onChange={(e) => {
          setDraft((x) => ({ ...x, [key]: e.target.value }));
          const n = Math.round(Number(e.target.value));
          if (!e.target.value || n < 1 || n > MAX_SIZE) return;
          if (key === 'w') setSize(n, frame.h);
          else setSize(frame.w, n);
        }}
        onBlur={() => setDraft({})}
      />
    </label>
  );

  return (
    <Dialog
      title={t('resize.title')}
      submitLabel={t('common.apply')}
      onClose={closeDialog}
      onSubmit={() => editor.resize(frame.w, frame.h, { x: frame.ox, y: frame.oy })}
    >
      <p className="muted">{t('resize.hint')}</p>
      <canvas
        ref={canvas}
        className="resize-preview"
        style={{ width: PREVIEW.w, height: PREVIEW.h }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      />
      <div className="resize-controls">
        <div className="resize-fields">
          {field('w', 'W', t('canvas.width'))}
          {field('h', 'H', t('canvas.height'))}
          <p className="muted">{t('resize.result', { w: oldW, h: oldH, rw: frame.w, rh: frame.h })}</p>
        </div>
        <AnchorGrid
          value={anchor}
          label={t('resize.anchor')}
          onChange={(a) => {
            setAnchor(a);
            setSize(frame.w, frame.h, a);
          }}
        />
      </div>
    </Dialog>
  );
}
