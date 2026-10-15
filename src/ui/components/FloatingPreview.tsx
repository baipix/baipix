import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { alpha, toCss } from '../../engine/color';
import { flatten } from '../../engine/composite';
import type { Point } from '../../engine/math';
import { useT } from '../../i18n';
import { useEditor, useEditorState } from '../EditorContext';
import { RULER } from '../render/drawScene';
import { checkerPattern, readTheme } from '../render/theme';
import { uiStore, type PreviewWindow } from '../uiStore';
import { viewport } from '../viewport';
import { IconButton } from './IconButton';
import { openMenu } from './Menu';

/** Zoom steps of the preview, in %. */
const ZOOMS = [200, 300, 400, 500, 600, 800, 1000];
const MIN = { w: 140, h: 100 };
const HEADER = 32;

const setPreview = (patch: Partial<PreviewWindow>) =>
  uiStore.set((s) => ({ preview: { ...s.preview, ...patch } }));

/**
 * The live preview of the artwork, in a small window floating over the canvas: drag it by its
 * title, resize it by its corner, fold or close it. Its own zoom (fit, or 100% to 1000%) lets you
 * look at a detail while the canvas stays at another scale; drag to pan when zoomed.
 */
export function FloatingPreview() {
  const preview = uiStore.use((s) => s.preview);
  return preview.open ? <Window preview={preview} /> : null;
}

function Window({ preview }: { preview: PreviewWindow }) {
  const t = useT();
  const ref = useRef<HTMLDivElement>(null);
  const [label, setLabel] = useState('');
  // Where the zoomed view is centered, in art pixels (null: the drawing's center).
  const [center, setCenter] = useState<Point | null>(null);
  const rulers = useEditorState((s) => s.view.rulers);

  // The default spot: bottom left of the workspace, clear of the left panel and the toolbars.
  const place = () => {
    const parent = ref.current?.parentElement?.getBoundingClientRect();
    if (!parent) return { x: 0, y: 0 };
    const left = (uiStore.get().uiHidden ? 0 : uiStore.get().panelWidths.left) + 24;
    const x = preview.x ?? left;
    // Above the toolbar and the tool options, which sit at the bottom center.
    const y = preview.y ?? parent.height - (preview.collapsed ? HEADER : preview.h) - 132;
    // Always kept inside the workspace, even after the window shrinks, and off the rulers.
    const edge = rulers ? RULER + 6 : 0;
    return {
      x: Math.max(edge, Math.min(x, parent.width - preview.w)),
      y: Math.max(edge, Math.min(y, parent.height - HEADER)),
    };
  };
  const [, rerender] = useState(0);
  // The workspace's size is only known once mounted: place the window again then.
  useLayoutEffect(() => rerender((n) => n + 1), []);
  useEffect(() => {
    const onResize = () => rerender((n) => n + 1);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  const pos = place();

  /** Drags the window (by its title) or resizes it (by its corner). */
  const drag = (e: ReactPointerEvent, mode: 'move' | 'resize') => {
    if (e.button !== 0 || (mode === 'move' && (e.target as HTMLElement).closest('button'))) return;
    e.preventDefault();
    const from = { pointerX: e.clientX, pointerY: e.clientY, x: pos.x, y: pos.y, w: preview.w, h: preview.h };
    const move = (ev: PointerEvent) => {
      const dx = ev.clientX - from.pointerX;
      const dy = ev.clientY - from.pointerY;
      if (mode === 'move') setPreview({ x: from.x + dx, y: from.y + dy });
      else setPreview({ w: Math.max(MIN.w, from.w + dx), h: Math.max(MIN.h, from.h + dy) });
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const zoomTo = useCallback((z: number | null, c: Point | null) => {
    setPreview({ zoom: z });
    setCenter(c);
  }, []);

  const zoomMenu = (anchor: HTMLElement) =>
    openMenu(anchor, [
      {
        label: `${t('preview.fit')} (100 %)`,
        checked: preview.zoom === null,
        onSelect: () => {
          setPreview({ zoom: null });
          setCenter(null);
        },
      },
      '-',
      ...ZOOMS.map((z) => ({
        label: `${z} %`,
        checked: preview.zoom === z,
        onSelect: () => setPreview({ zoom: z }),
      })),
    ]);

  return (
    <div
      ref={ref}
      className={`floating-preview${preview.collapsed ? ' is-collapsed' : ''}`}
      style={{ left: pos.x, top: pos.y, width: preview.w, height: preview.collapsed ? undefined : preview.h }}
      role="dialog"
      aria-label={t('section.preview')}
    >
      <div className="floating-preview-header" onPointerDown={(e) => drag(e, 'move')}>
        <span className="floating-preview-title">{t('section.preview')}</span>
        <button
          type="button"
          className="select-plain floating-preview-zoom"
          onClick={(e) => zoomMenu(e.currentTarget)}
        >
          {preview.zoom === null ? label || t('preview.fit') : `${preview.zoom} %`} ▾
        </button>
        <IconButton
          icon={preview.collapsed ? 'down' : 'up'}
          label={preview.collapsed ? t('preview.expand') : t('preview.collapse')}
          onClick={() => setPreview({ collapsed: !preview.collapsed })}
        />
        <IconButton icon="close" label={t('common.close')} onClick={() => setPreview({ open: false })} />
      </div>
      {!preview.collapsed && (
        <>
          <PreviewCanvas
            zoom={preview.zoom}
            center={center}
            onCenter={setCenter}
            onLabel={setLabel}
            onFit={() => {
              setPreview({ zoom: null });
              setCenter(null);
            }}
            onZoom={zoomTo}
          />
          <div
            className="floating-preview-resize"
            aria-hidden="true"
            onPointerDown={(e) => drag(e, 'resize')}
          />
        </>
      )}
    </div>
  );
}

function PreviewCanvas({
  zoom,
  center,
  onCenter,
  onLabel,
  onFit,
  onZoom,
}: {
  zoom: number | null;
  center: Point | null;
  onCenter: (c: Point) => void;
  onLabel: (label: string) => void;
  onFit: () => void;
  onZoom: (zoom: number | null, center: Point | null) => void;
}) {
  const t = useT();
  const editor = useEditor();
  const ref = useRef<HTMLCanvasElement>(null);
  const view = useRef({ zoom, center });
  // CSS pixels per art pixel as last drawn, for panning, and the fitted scale, for the wheel.
  const scale = useRef(1);
  const fitScale = useRef(1);
  // Where the drawing was drawn (device px) and whether the canvas shows only part of it.
  const drawn = useRef({ x: 0, y: 0, f: 1, framed: false });
  view.current = { zoom, center };

  useEffect(() => {
    let frame = 0;
    const draw = () => {
      frame = 0;
      const canvas = ref.current;
      if (!canvas) return;
      const { doc } = editor.getLive();
      const dpr = window.devicePixelRatio || 1;
      const r = canvas.getBoundingClientRect();
      if (!r.width) return;
      canvas.width = Math.round(r.width * dpr);
      canvas.height = Math.round(r.height * dpr);
      const ctx = canvas.getContext('2d')!;
      const theme = readTheme();
      ctx.imageSmoothingEnabled = false;
      ctx.fillStyle = theme.canvas;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      const { zoom: z, center: c } = view.current;
      // Fit: the largest whole scale that shows the whole drawing (or smaller, for big ones).
      const fit = Math.min((canvas.width - 16) / doc.width, (canvas.height - 16) / doc.height);
      // Zooms are relative to the fit: 200% shows the drawing twice as large as fitted.
      const fitted = fit >= 1 ? Math.floor(fit) : fit;
      const f = z === null ? fitted : fitted * (z / 100);
      scale.current = f / dpr;
      fitScale.current = fitted / dpr;
      const at = c ?? { x: doc.width / 2, y: doc.height / 2 };
      const w = doc.width * f;
      const h = doc.height * f;
      const x = Math.round(z === null ? (canvas.width - w) / 2 : canvas.width / 2 - at.x * f);
      const y = Math.round(z === null ? (canvas.height - h) / 2 : canvas.height / 2 - at.y * f);
      ctx.save();
      ctx.translate(x, y);
      ctx.fillStyle = checkerPattern(ctx, Math.max(3, Math.round(5 * dpr)), theme.checkA, theme.checkB);
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
      if (doc.backgroundVisible && alpha(doc.background) > 0) {
        ctx.fillStyle = toCss(doc.background);
        ctx.fillRect(x, y, w, h);
      }
      const { gap, pixelSize } = doc.render;
      const pixels = flatten(doc, { includeBackground: false });
      const k = Math.floor(f);
      if (gap > 0 && k >= 3 && k === f && doc.width * doc.height <= 16384) {
        // The render gap, as it will be exported.
        const gp = Math.max(1, Math.round((k * gap) / (pixelSize + gap)));
        const size = Math.max(1, k - gp);
        for (let py = 0; py < doc.height; py++)
          for (let px = 0; px < doc.width; px++) {
            const color = pixels[py * doc.width + px];
            if (!alpha(color)) continue;
            ctx.fillStyle = toCss(color);
            ctx.fillRect(x + px * k, y + py * k, size, size);
          }
      } else {
        const src = document.createElement('canvas');
        src.width = doc.width;
        src.height = doc.height;
        const sctx = src.getContext('2d')!;
        const image = sctx.createImageData(doc.width, doc.height);
        new Uint32Array(image.data.buffer).set(pixels);
        sctx.putImageData(image, 0, 0);
        ctx.drawImage(src, x, y, w, h);
      }
      // Minimap: when the canvas shows only part of the drawing, a frame around that part.
      const v = viewport.visibleArea();
      const framed =
        viewport.width > 0 && (v.x0 > 0.5 || v.y0 > 0.5 || v.x1 < doc.width - 0.5 || v.y1 < doc.height - 0.5);
      drawn.current = { x, y, f, framed };
      canvas.classList.toggle('is-navigable', framed && z === null);
      if (framed) {
        const fx0 = x + Math.max(0, v.x0) * f;
        const fy0 = y + Math.max(0, v.y0) * f;
        const fx1 = x + Math.min(doc.width, v.x1) * f;
        const fy1 = y + Math.min(doc.height, v.y1) * f;
        if (fx1 > fx0 && fy1 > fy0) {
          const line = Math.max(1, Math.round(1.5 * dpr));
          ctx.lineWidth = line + 2 * dpr;
          ctx.strokeStyle = 'rgba(0, 0, 0, 0.45)';
          ctx.strokeRect(fx0, fy0, fx1 - fx0, fy1 - fy0);
          ctx.lineWidth = line;
          ctx.strokeStyle =
            getComputedStyle(document.documentElement).getPropertyValue('--glow') || '#66c4ff';
          ctx.strokeRect(fx0, fy0, fx1 - fx0, fy1 - fy0);
        }
      }
      onLabel(
        z !== null
          ? ''
          : gap > 0 && k >= 3
            ? t('preview.gap', { gap })
            : f >= 1
              ? `${k}×`
              : t('preview.reduced'),
      );
    };
    const request = () => {
      if (!frame) frame = requestAnimationFrame(draw);
    };
    request();
    const offPixels = editor.onPixels(request);
    const offState = editor.subscribe(request);
    const offView = viewport.subscribe(request);
    const ro = new ResizeObserver(request);
    if (ref.current) ro.observe(ref.current);
    // Redraw on theme changes (OS setting or the theme menu), like the main canvas.
    const media = matchMedia('(prefers-color-scheme: dark)');
    media.addEventListener('change', request);
    const mo = new MutationObserver(request);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => {
      offPixels();
      offState();
      offView();
      ro.disconnect();
      media.removeEventListener('change', request);
      mo.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [editor, t, onLabel, zoom, center]);

  // The wheel (or a trackpad pinch) zooms toward the pointer, from the fit up to 1000%.
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const { doc } = editor.getLive();
      const { zoom: z, center: c } = view.current;
      const current = z ?? 100;
      const next = Math.min(1000, current * Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.002)));
      if (next <= 101) return onZoom(null, null);
      // Keep the pixel under the pointer where it is.
      const r = canvas.getBoundingClientRect();
      const mx = e.clientX - r.left - r.width / 2;
      const my = e.clientY - r.top - r.height / 2;
      const at = c ?? { x: doc.width / 2, y: doc.height / 2 };
      const before = fitScale.current * (current / 100);
      const after = fitScale.current * (next / 100);
      const px = at.x + mx / before;
      const py = at.y + my / before;
      onZoom(Math.round(next), {
        x: Math.max(0, Math.min(doc.width, px - mx / after)),
        y: Math.max(0, Math.min(doc.height, py - my / after)),
      });
    };
    canvas.addEventListener('wheel', onWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', onWheel);
  }, [editor, onZoom]);

  /** At the fit, with the canvas zoomed in: click or drag to move the canvas's view there. */
  const navigate = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const canvas = e.currentTarget;
    const go = (ev: { clientX: number; clientY: number }) => {
      const r = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const { x, y, f } = drawn.current;
      viewport.centerOn(((ev.clientX - r.left) * dpr - x) / f, ((ev.clientY - r.top) * dpr - y) / f);
    };
    go(e);
    const up = () => {
      window.removeEventListener('pointermove', go);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', go);
    window.addEventListener('pointerup', up);
  };

  /** Zoomed in: drag to look around. */
  const pan = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (e.button !== 0) return;
    if (zoom === null) return drawn.current.framed ? navigate(e) : undefined;
    const { doc } = editor.getLive();
    const f = scale.current;
    const start = { x: e.clientX, y: e.clientY, c: center ?? { x: doc.width / 2, y: doc.height / 2 } };
    const move = (ev: PointerEvent) =>
      onCenter({
        x: Math.max(0, Math.min(doc.width, start.c.x - (ev.clientX - start.x) / f)),
        y: Math.max(0, Math.min(doc.height, start.c.y - (ev.clientY - start.y) / f)),
      });
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  return (
    <div className="preview floating-preview-body">
      <canvas
        ref={ref}
        className={zoom !== null ? 'is-pannable' : undefined}
        onPointerDown={pan}
        onDoubleClick={onFit}
      />
    </div>
  );
}
