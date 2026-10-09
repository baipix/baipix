import { useEffect, useReducer, useRef, useState } from 'react';
import { pack, toHex } from '../../engine/color';
import { flatten } from '../../engine/composite';
import type { Point, Rect } from '../../engine/math';
import { pixelBounds } from '../../engine/region';
import { isShown } from '../../engine/groups';
import type { Layer, PixelDoc } from '../../engine/document';
import { gridInk } from '../render/grid';
import type { ToolId } from '../../engine/tools';
import { t as translate, useT } from '../../i18n';
import { useActions } from '../ActionsContext';
import { useEditor, useEditorState } from '../EditorContext';
import { keyState } from '../keyState';
import {
  AXIS_GRIP,
  axisPositions,
  drawScene,
  LABEL,
  labelRect,
  type BrushPreview,
  type SceneReference,
  drawRulers,
  guidePosition,
  RULER,
} from '../render/drawScene';
import { readTheme, type Theme } from '../render/theme';
import { BRUSH_TOOLS, SHAPE_IDS } from '../tools';
import { hoverStore, uiStore } from '../uiStore';
import { COMPONENT_MIME } from '../dragTypes';
import { viewport } from '../viewport';

const DRAWING_TOOLS: ToolId[] = [
  'pencil',
  'lassoFill',
  'eraser',
  ...SHAPE_IDS,
  'bucket',
  'gradient',
  'shade',
  'lighten',
  'blur',
];

interface Pinch {
  distance: number;
  cx: number;
  cy: number;
  zoom: number;
  panX: number;
  panY: number;
}

/** The smallest rectangle around the pixels of several layers, or null when none has any. */
function unionBounds(layers: Layer[], width: number, height: number): Rect | null {
  let box: Rect | null = null;
  for (const l of layers) {
    const r = pixelBounds(l.pixels, width, height);
    if (!r) continue;
    if (!box) box = { ...r };
    else {
      const x = Math.min(box.x, r.x);
      const y = Math.min(box.y, r.y);
      box = { x, y, w: Math.max(box.x + box.w, r.x + r.w) - x, h: Math.max(box.y + box.h, r.y + r.h) - y };
    }
  }
  return box;
}

export function CanvasView() {
  const editor = useEditor();
  const actions = useActions();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [dropping, setDropping] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const renamingRef = useRef(false);
  const redrawRef = useRef(() => {});
  const [, follow] = useReducer((n: number) => n + 1, 0);
  const tool = useEditorState((s) => s.tool);
  const docId = useEditorState((s) => s.doc.id);
  const docName = useEditorState((s) => s.doc.name);
  const t = useT();

  useEffect(() => {
    renamingRef.current = renaming;
    redrawRef.current();
    // Keep the field glued to the frame while zooming or panning.
    return renaming ? viewport.subscribe(follow) : undefined;
  }, [renaming]);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const wrap = wrapRef.current!;
    const ctx = canvas.getContext('2d')!;
    const composite = document.createElement('canvas');
    const cctx = composite.getContext('2d')!;
    // Grid line colors, one per art pixel (see render/grid.ts).
    const ink = document.createElement('canvas');
    const ictx = ink.getContext('2d')!;
    let theme: Theme = readTheme();
    let hover: { x: number; y: number } | null = null;
    let compositeDirty = true;
    let frame = 0;
    const motionMedia = matchMedia('(prefers-reduced-motion: reduce)');
    let reduceMotion = motionMedia.matches;
    let panStart: { x: number; y: number; panX: number; panY: number } | null = null;
    let pinch: Pinch | null = null;
    const pointers = new Map<number, { x: number; y: number; touch: boolean }>();
    // Alt held: drawing tools pick colors, so the loupe shows (even before the pointer moves).
    let altHeld = false;
    // Dragging a symmetry axis by its grip.
    let axisDrag: 'x' | 'y' | null = null;
    // Dragging a guide out of a ruler (index null) or an existing one (with the Move tool).
    let guideDrag: { axis: 'x' | 'y'; index: number | null; at: number } | null = null;
    let sprayTimer = 0;
    // Adjusting the reference image: moving it, or resizing it from a corner (the opposite one stays).
    let refDrag: {
      mode: 'move' | 'resize';
      start: Point;
      rect: { x: number; y: number; w: number; h: number };
      anchor: Point;
    } | null = null;
    const refImages = new Map<string, HTMLImageElement>();
    const refImage = (src: string): HTMLImageElement | null => {
      let img = refImages.get(src);
      if (!img) {
        img = new Image();
        img.onload = () => request();
        img.src = src;
        refImages.set(src, img);
      }
      return img.complete && img.naturalWidth ? img : null;
    };
    /** Pointer position in art pixels, not rounded. */
    const artPoint = (l: { x: number; y: number }): Point => ({
      x: (l.x * viewport.dpr - viewport.originX) / viewport.scale,
      y: (l.y * viewport.dpr - viewport.originY) / viewport.scale,
    });
    /** The reference the Move tool can take: visible and unlocked, with no selection in the way. */
    const movableReference = () => {
      const st = editor.getState();
      const r = st.doc.reference;
      return st.tool === 'move' && !st.selection && r?.visible && !r.locked ? r : null;
    };
    const insideReference = (r: Rect, p: Point) =>
      p.x >= r.x && p.y >= r.y && p.x <= r.x + r.w && p.y <= r.y + r.h;
    /**
     * Move tool on the reference: a corner of the selected reference resizes it, and the reference
     * itself is taken where no layer has a pixel (or anywhere with Cmd/Ctrl once it's selected).
     */
    const beginRefDrag = (l: { x: number; y: number }, keep: boolean): boolean => {
      const r = movableReference();
      if (!r) return false;
      const selected = editor.getState().referenceSelected;
      const p = artPoint(l);
      const rect = { x: r.x, y: r.y, w: r.w, h: r.h };
      if (selected) {
        const reach = (10 * viewport.dpr) / viewport.scale;
        const corners: Point[] = [
          { x: r.x, y: r.y },
          { x: r.x + r.w, y: r.y },
          { x: r.x, y: r.y + r.h },
          { x: r.x + r.w, y: r.y + r.h },
        ];
        const i = corners.findIndex((c) => Math.abs(c.x - p.x) <= reach && Math.abs(c.y - p.y) <= reach);
        if (i >= 0) {
          refDrag = { mode: 'resize', start: p, rect, anchor: corners[3 - i] };
          return true;
        }
      }
      if (!insideReference(r, p)) return false;
      if (keep ? !selected : editor.layerAt(viewport.toPixel(l.x, l.y)) >= 0) return false;
      editor.selectReference();
      refDrag = { mode: 'move', start: p, rect, anchor: p };
      return true;
    };
    const dragRef = (l: { x: number; y: number }, final: boolean) => {
      if (!refDrag) return;
      const p = artPoint(l);
      const { rect, anchor } = refDrag;
      if (refDrag.mode === 'move') {
        editor.updateReference(
          { x: rect.x + p.x - refDrag.start.x, y: rect.y + p.y - refDrag.start.y },
          final,
        );
        return;
      }
      // Keep the proportions: the larger of the two drag distances wins.
      const ratio = rect.w / rect.h;
      const w = Math.max(1, Math.abs(p.x - anchor.x), Math.abs(p.y - anchor.y) * ratio);
      const h = w / ratio;
      editor.updateReference(
        { x: p.x < anchor.x ? anchor.x - w : anchor.x, y: p.y < anchor.y ? anchor.y - h : anchor.y, w, h },
        final,
      );
    };

    /** The symmetry axis whose grip (the part outside the canvas) is under the pointer, if any. */
    const axisAt = (l: { x: number; y: number }): 'x' | 'y' | null => {
      const { doc, view } = editor.getState();
      const cam = camera();
      const { x: ax, y: ay } = axisPositions(doc, cam);
      const px = l.x * cam.dpr;
      const py = l.y * cam.dpr;
      const reach = AXIS_GRIP * cam.dpr;
      const near = 6 * cam.dpr;
      const right = cam.originX + doc.width * cam.scale - cam.gap;
      const bottom = cam.originY + doc.height * cam.scale - cam.gap;
      const outsideY =
        (py >= cam.originY - reach && py < cam.originY) || (py > bottom && py <= bottom + reach);
      const outsideX = (px >= cam.originX - reach && px < cam.originX) || (px > right && px <= right + reach);
      if (view.mirrorX && Math.abs(px - ax) <= near && outsideY) return 'x';
      if (view.mirrorY && Math.abs(py - ay) <= near && outsideX) return 'y';
      return null;
    };
    /** With rulers shown: the ruler under the pointer, by the guides it makes (left: x, top: y). */
    const rulerAt = (l: { x: number; y: number }): 'x' | 'y' | null => {
      if (!editor.getState().view.rulers) return null;
      if (l.y <= RULER && l.x > RULER) return 'y';
      if (l.x <= RULER && l.y > RULER) return 'x';
      return null;
    };
    /** The guide under the pointer, with the Move tool (the one that moves things). */
    const guideAt = (l: { x: number; y: number }): { axis: 'x' | 'y'; index: number } | null => {
      const { doc, view, tool } = editor.getState();
      if (!view.rulers || tool !== 'move' || !doc.guides) return null;
      const cam = camera();
      const near = 4 * cam.dpr;
      const ix = doc.guides.x.findIndex(
        (g) => Math.abs(guidePosition(g, cam.originX, cam) - l.x * cam.dpr) <= near,
      );
      if (ix >= 0) return { axis: 'x', index: ix };
      const iy = doc.guides.y.findIndex(
        (g) => Math.abs(guidePosition(g, cam.originY, cam) - l.y * cam.dpr) <= near,
      );
      return iy >= 0 ? { axis: 'y', index: iy } : null;
    };
    /** The pixel edge nearest the pointer, along `axis`. */
    const edgeAt = (axis: 'x' | 'y', l: { x: number; y: number }) => {
      const cam = camera();
      const at = axis === 'x' ? l.x * cam.dpr - cam.originX : l.y * cam.dpr - cam.originY;
      return Math.round((at + cam.gap / 2) / cam.scale);
    };

    const dragAxis = (l: { x: number; y: number }) => {
      const cam = camera();
      if (axisDrag === 'x')
        editor.setMirrorAxis('x', (l.x * cam.dpr - cam.originX + cam.gap / 2) / cam.scale);
      if (axisDrag === 'y')
        editor.setMirrorAxis('y', (l.y * cam.dpr - cam.originY + cam.gap / 2) / cam.scale);
    };

    const updateComposite = () => {
      const { doc } = editor.getLive();
      if (composite.width !== doc.width || composite.height !== doc.height) {
        composite.width = ink.width = doc.width;
        composite.height = ink.height = doc.height;
      }
      const pixels = flatten(doc);
      // A visible reference sits between the background and the layers: the renderer paints the
      // background itself, under it.
      const layers = doc.reference?.visible ? flatten(doc, { includeBackground: false }) : pixels;
      const image = cctx.createImageData(doc.width, doc.height);
      new Uint32Array(image.data.buffer).set(layers);
      cctx.putImageData(image, 0, 0);
      const lines = ictx.createImageData(doc.width, doc.height);
      new Uint32Array(lines.data.buffer).set(gridInk(pixels, theme.checkA));
      ictx.putImageData(lines, 0, 0);
      compositeDirty = false;
    };

    const sceneReference = (doc: PixelDoc): SceneReference | null => {
      const r = doc.reference;
      if (!r?.visible) return null;
      const image = refImage(r.src);
      if (!image) return null;
      return { image, rect: r, opacity: r.opacity, selected: editor.getState().referenceSelected };
    };

    const draw = (now = performance.now()) => {
      frame = 0;
      if (compositeDirty) updateComposite();
      const live = editor.getLive();
      const state = editor.getState();
      const tool = state.tool;
      // Picking a color: the eyedropper, or Alt held with a drawing tool. Shows the loupe, not the brush.
      const picking =
        tool === 'picker' || live.stroking === 'picker' || (altHeld && DRAWING_TOOLS.includes(tool));
      let brush: BrushPreview | null = null;
      const shapeInProgress = live.stroking !== null && SHAPE_IDS.includes(live.stroking);
      if (hover && !panStart && !pinch && BRUSH_TOOLS.includes(tool) && !shapeInProgress && !picking) {
        const paints = !['eraser', 'shade', 'lighten', 'blur'].includes(tool);
        brush =
          tool === 'spray' || tool === 'liquify'
            ? {
                at: hover,
                size: 1,
                color: null,
                circle: tool === 'spray' ? state.options.spraySize : state.options.liquifySize,
              }
            : tool === 'jumble'
              ? { at: hover, size: state.options.jumbleSize, color: null }
              : {
                  at: hover,
                  size: state.options.size,
                  color: paints ? state.primary : null,
                  round: state.options.roundTip,
                  // A custom brush shows its pixels: its own colors, or the primary as a stencil.
                  ...((tool === 'pencil' || tool === 'lassoFill') &&
                    state.options.customBrush && {
                      block: editor.brushPixels(state.options.customBrush) ?? undefined,
                      color: state.options.brushOwnColors ? null : state.primary,
                    }),
                };
      }
      const { doc } = live;
      let loupe = null;
      if (
        picking &&
        hover &&
        !panStart &&
        !pinch &&
        hover.x >= 0 &&
        hover.y >= 0 &&
        hover.x < doc.width &&
        hover.y < doc.height
      ) {
        const color = hoverStore.get().color;
        loupe = {
          at: hover,
          color,
          text: color ? toHex(color).slice(1).toUpperCase() : translate('coordinates.transparent'),
        };
      }
      drawScene(
        ctx,
        canvas.width,
        canvas.height,
        {
          doc: live.doc,
          composite,
          gridInk: ink,
          reference: sceneReference(live.doc),
          view: live.view,
          selection: live.selection,
          selectionDashOffset: reduceMotion ? 0 : (now / 80) % 8,
          brush,
          moveTarget: editor.isStroking ? null : moveTargetAt(hover, lastMods),
          layerBox: activeLayerBox(),
          sizeNote: scaleNote,
          loupe,
          label: renamingRef.current ? '' : live.doc.name,
        },
        camera(),
        theme,
      );
      if (live.view.rulers) {
        const guides = { x: [...(live.doc.guides?.x ?? [])], y: [...(live.doc.guides?.y ?? [])] };
        if (guideDrag) {
          const list = guides[guideDrag.axis];
          if (guideDrag.index === null) list.push(guideDrag.at);
          else list[guideDrag.index] = guideDrag.at;
        }
        drawRulers(
          ctx,
          canvas.width,
          canvas.height,
          live.doc,
          { guides, active: guideDrag && { axis: guideDrag.axis, at: guideDrag.at } },
          camera(),
          theme,
        );
      }
      if (live.selection && !reduceMotion) frame = requestAnimationFrame(draw);
    };

    const camera = () => ({
      dpr: viewport.dpr,
      scale: viewport.scale,
      gap: viewport.gap,
      originX: viewport.originX,
      originY: viewport.originY,
    });
    const onLabel = (l: { x: number; y: number }) => {
      const r = labelRect(ctx, editor.getState().doc.name, camera());
      const x = l.x * viewport.dpr;
      const y = l.y * viewport.dpr;
      return x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;
    };

    const request = () => {
      if (!frame) frame = requestAnimationFrame(draw);
    };
    redrawRef.current = request;
    const pixelsChanged = () => {
      compositeDirty = true;
      request();
    };

    const resize = () => {
      const r = wrap.getBoundingClientRect();
      viewport.setSize(r.width, r.height, r.left, r.top);
      // Resizing clears the canvas, so skip it when nothing changed and redraw right away
      // (not on the next frame): otherwise a blank frame flashes while dragging a panel.
      const w = Math.max(1, Math.round(r.width * viewport.dpr));
      const h = Math.max(1, Math.round(r.height * viewport.dpr));
      if (canvas.width !== w) canvas.width = w;
      if (canvas.height !== h) canvas.height = h;
      cancelAnimationFrame(frame);
      draw();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);
    // The side panels float over the workspace: fitting centers the drawing in the space between.
    viewport.covered = () => {
      const r = wrap.getBoundingClientRect();
      const edge = (selector: string, side: 'left' | 'right') => {
        const panel = document.querySelector(selector);
        if (!panel || getComputedStyle(panel).position === 'fixed') return 0;
        const p = panel.getBoundingClientRect();
        if (!p.width) return 0;
        return side === 'left' ? Math.max(0, p.right - r.left) : Math.max(0, r.right - p.left);
      };
      return { left: edge('.panel-left', 'left'), right: edge('.panel-right', 'right') };
    };

    const onTheme = () => {
      theme = readTheme();
      compositeDirty = true;
      request();
    };
    const media = matchMedia('(prefers-color-scheme: dark)');
    media.addEventListener('change', onTheme);

    const onMotion = (e: MediaQueryListEvent) => {
      reduceMotion = e.matches;
      request();
    };
    motionMedia.addEventListener('change', onMotion);

    const mo = new MutationObserver(onTheme);
    mo.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme', 'class', 'style'],
    });

    // The render gap spreads pixels on the canvas, as in the exported file.
    const syncGap = () => {
      const { doc } = editor.getState();
      const { gap, pixelSize } = doc.render;
      viewport.setGapRatio(gap > 0 ? gap / pixelSize : 0, doc.width, doc.height);
    };

    const unsubs = [
      editor.onPixels(pixelsChanged),
      viewport.subscribe(request),
      editor.subscribe(() => {
        viewport.showDocument(editor.getState().doc);
        syncGap();
      }),
    ];
    viewport.showDocument(editor.getState().doc);
    syncGap();

    const local = (e: { clientX: number; clientY: number }) => {
      const r = canvas.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };

    const updateHover = (p: { x: number; y: number } | null) => {
      hover = p;
      const doc = editor.getLive().doc;
      if (!p || p.x < 0 || p.y < 0 || p.x >= doc.width || p.y >= doc.height) {
        hoverStore.set({ x: null, y: null, color: null });
        return;
      }
      if (compositeDirty) updateComposite();
      const d = cctx.getImageData(p.x, p.y, 1, 1).data;
      hoverStore.set({ x: p.x, y: p.y, color: d[3] ? pack(d[0], d[1], d[2], d[3]) : null });
    };

    // Bounds of the layer the Move tool would take, cached until the drawing changes.
    let boundsCache: { key: string; rect: Rect | null } | null = null;
    const moveTargetAt = (p: Point | null, mods: { metaKey: boolean; ctrlKey: boolean }): Rect | null => {
      const state = editor.getState();
      // With a selection, or Cmd/Ctrl held, nothing is picked: no outline.
      if (!p || state.tool !== 'move' || state.selection || panStart || pinch) return null;
      if (mods.metaKey || mods.ctrlKey) return null;
      const k = editor.layerAt(p);
      if (k < 0) {
        const r = movableReference();
        return r && insideReference(r, artPoint(lastLocal)) ? r : null;
      }
      const { doc } = state;
      // A layer in a group outlines the whole group: that's what a drag would move.
      const layers = editor.moveTargetLayers(p);
      const key = `${layers.map((l) => l.id).join()}:${state.revision}`;
      if (boundsCache?.key !== key) boundsCache = { key, rect: unionBounds(layers, doc.width, doc.height) };
      return boundsCache.rect;
    };
    let lastMods = { metaKey: false, ctrlKey: false };
    /**
     * With the Move tool, the active layer is framed like a selected object: the bounds of its
     * pixels, live while it's being moved, cached otherwise.
     */
    // Resizing by a corner handle (Move tool): the rectangle it started from and the corner held.
    let scaleDrag: { from: Rect; corner: number } | null = null;
    // Rotating by dragging outside a corner: the center it turns around and the pointer's start angle.
    let rotateDrag: { center: Point; start: number } | null = null;
    let scaleNote: string | null = null;
    /** Corners of a rectangle, in the order top-left, top-right, bottom-left, bottom-right. */
    const cornersOf = (r: Rect): Point[] => [
      { x: r.x, y: r.y },
      { x: r.x + r.w, y: r.y },
      { x: r.x, y: r.y + r.h },
      { x: r.x + r.w, y: r.y + r.h },
    ];
    /** The handle under the pointer: a corner of the selection, or of the framed active layer. */
    const handleAt = (l: { x: number; y: number }): { rect: Rect; corner: number } | null => {
      const state = editor.getState();
      if (state.tool !== 'move' || state.referenceSelected || editor.isStroking) return null;
      const rect = state.selection ?? activeLayerBox();
      if (!rect) return null;
      const p = artPoint(l);
      const reach = (7 * viewport.dpr) / viewport.scale;
      const corner = cornersOf(rect).findIndex(
        (c) => Math.abs(c.x - p.x) <= reach && Math.abs(c.y - p.y) <= reach,
      );
      return corner < 0 ? null : { rect, corner };
    };
    /** Just outside a corner of the frame (beyond its handle): where dragging rotates. */
    const rotateZoneAt = (l: { x: number; y: number }): Rect | null => {
      const state = editor.getState();
      if (state.tool !== 'move' || state.referenceSelected || editor.isStroking) return null;
      const rect = state.selection ?? activeLayerBox();
      if (!rect || handleAt(l)) return null;
      const p = artPoint(l);
      const inside = p.x >= rect.x && p.y >= rect.y && p.x <= rect.x + rect.w && p.y <= rect.y + rect.h;
      const reach = (22 * viewport.dpr) / viewport.scale;
      const near = cornersOf(rect).some((c) => Math.hypot(c.x - p.x, c.y - p.y) <= reach);
      return near && !inside ? rect : null;
    };
    const pointerAngle = (center: Point, l: { x: number; y: number }) => {
      const p = artPoint(l);
      return Math.atan2(p.y - center.y, p.x - center.x);
    };

    /**
     * The rectangle while dragging a corner: the opposite corner stays (the center with Alt), Shift
     * keeps the proportions, and sizes snap to whole multiples (×2, ×3, ×½…) unless Cmd/Ctrl is held.
     */
    const scaleRect = (
      from: Rect,
      corner: number,
      l: { x: number; y: number },
      mods: { shiftKey: boolean; altKey: boolean; metaKey: boolean; ctrlKey: boolean },
    ): Rect => {
      const p = artPoint(l);
      const center = { x: from.x + from.w / 2, y: from.y + from.h / 2 };
      const anchor = mods.altKey ? center : cornersOf(from)[3 - corner];
      const span = mods.altKey ? 2 : 1;
      let fx = (Math.abs(p.x - anchor.x) * span) / from.w;
      let fy = (Math.abs(p.y - anchor.y) * span) / from.h;
      if (mods.shiftKey) fx = fy = Math.max(fx, fy);
      const reach = (6 * viewport.dpr) / viewport.scale;
      const snap = (f: number, size: number) => {
        if (mods.metaKey || mods.ctrlKey) return f;
        const candidates = [1, 2, 3, 4, 5, 6, 8, 1 / 2, 1 / 3, 1 / 4];
        const best = candidates.reduce((a, c) => (Math.abs(c - f) < Math.abs(a - f) ? c : a));
        return Math.abs(best - f) * size <= reach ? best : f;
      };
      fx = snap(fx, from.w);
      fy = mods.shiftKey ? fx : snap(fy, from.h);
      const w = Math.max(1, Math.round(from.w * fx));
      const h = Math.max(1, Math.round(from.h * fy));
      const fmt = (f: number) => (f >= 1 ? `×${+f.toFixed(2)}` : `×1/${Math.round(1 / f)}`);
      const exact = (f: number) => [1, 2, 3, 4, 5, 6, 8, 1 / 2, 1 / 3, 1 / 4].includes(f);
      scaleNote = exact(fx) && exact(fy) ? (fx === fy ? fmt(fx) : `${fmt(fx)} · ${fmt(fy)}`) : null;
      const x = mods.altKey ? center.x - w / 2 : p.x < anchor.x ? anchor.x - w : anchor.x;
      const y = mods.altKey ? center.y - h / 2 : p.y < anchor.y ? anchor.y - h : anchor.y;
      return { x: Math.round(x), y: Math.round(y), w, h };
    };
    let activeBoxCache: { key: string; rect: Rect | null } | null = null;
    const activeLayerBox = (): Rect | null => {
      const state = editor.getState();
      if (state.tool !== 'move' || state.selection || state.referenceSelected || !state.layerFramed)
        return null;
      const { doc } = editor.getLive();
      // Several layers selected (a group): framed together.
      const layers = doc.layers.filter((l) => state.selectedLayers.includes(l.id) && isShown(doc, l));
      if (!layers.length) return null;
      if (editor.isStroking || editor.isScaling) return unionBounds(layers, doc.width, doc.height);
      const key = `${layers.map((l) => l.id).join()}:${state.revision}`;
      if (activeBoxCache?.key !== key)
        activeBoxCache = { key, rect: unionBounds(layers, doc.width, doc.height) };
      return activeBoxCache.rect;
    };
    // Last pointer position over the canvas (CSS px), for the reference hit test.
    let lastLocal = { x: 0, y: 0 };

    const touches = () => [...pointers.values()].filter((p) => p.touch);
    const pinchInfo = () => {
      const [a, b] = touches();
      const r = canvas.getBoundingClientRect();
      return {
        distance: Math.hypot(a.x - b.x, a.y - b.y),
        cx: (a.x + b.x) / 2 - r.left,
        cy: (a.y + b.y) / 2 - r.top,
      };
    };

    const onDown = (e: PointerEvent) => {
      canvas.setPointerCapture(e.pointerId);
      // Back on the canvas, Delete clears pixels again rather than removing the layer clicked in the list.
      const focused = document.activeElement;
      if (focused instanceof HTMLElement && focused.closest('.item-list')) focused.blur();
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, touch: e.pointerType === 'touch' });
      if (e.pointerType === 'touch' && touches().length >= 2) {
        editor.cancelStroke();
        pinch = { ...pinchInfo(), zoom: viewport.zoom, panX: viewport.panX, panY: viewport.panY };
        updateHover(null);
        return;
      }
      if (pinch) return;
      // Pan: the middle button, Space held, or the hand tool.
      if (e.button === 1 || keyState.space || (e.button === 0 && editor.getState().tool === 'hand')) {
        panStart = { x: e.clientX, y: e.clientY, panX: viewport.panX, panY: viewport.panY };
        canvas.style.cursor = 'grabbing';
        e.preventDefault();
        return;
      }
      if (e.button !== 0 && e.button !== 2) return;
      const l = local(e);
      const ruler = e.button === 0 ? rulerAt(l) : null;
      const guide = e.button === 0 && !ruler ? guideAt(l) : null;
      if (ruler || guide) {
        const axis = ruler ?? guide!.axis;
        guideDrag = { axis, index: guide ? guide.index : null, at: edgeAt(axis, l) };
        request();
        return;
      }
      const axis = e.button === 0 ? axisAt(l) : null;
      if (axis) {
        axisDrag = axis;
        return;
      }
      // The frame name is renamed by double-click, so clicking it never draws.
      if (onLabel(l)) return;
      const p = viewport.toPixel(l.x, l.y);
      updateHover(p);
      if (e.button === 0 && beginRefDrag(l, e.metaKey || e.ctrlKey)) return;
      if (e.button === 0) {
        const handle = handleAt(l);
        const from = handle && editor.beginScale();
        if (handle && from) {
          scaleDrag = { from, corner: handle.corner };
          return;
        }
        const zone = rotateZoneAt(l);
        const rotating = zone && editor.beginRotate();
        if (rotating) {
          const center = { x: rotating.x + rotating.w / 2, y: rotating.y + rotating.h / 2 };
          rotateDrag = { center, start: pointerAngle(center, l) };
          scaleNote = '0°';
          request();
          return;
        }
      }
      const tool = editor.getState().tool;
      const override = e.altKey && DRAWING_TOOLS.includes(tool) ? 'picker' : undefined;
      const started = editor.beginStroke(
        p,
        e.button === 2,
        { shift: e.shiftKey, keepLayer: e.metaKey || e.ctrlKey, duplicate: e.altKey, add: e.shiftKey },
        override,
      );
      // The spray and the jumble keep going while the pointer holds still, like a real can.
      if (started && !override && (tool === 'spray' || tool === 'jumble' || tool === 'liquify')) {
        clearInterval(sprayTimer);
        sprayTimer = window.setInterval(() => {
          if (editor.isStroking && hover) editor.moveStroke(hover, { shift: false });
          else clearInterval(sprayTimer);
        }, 50);
      }
    };

    const onMove = (e: PointerEvent) => {
      if (pointers.has(e.pointerId))
        pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, touch: e.pointerType === 'touch' });
      if (pinch) {
        const info = pinchInfo();
        const zoom = Math.min(96, Math.max(1, (pinch.zoom * info.distance) / Math.max(1, pinch.distance)));
        const k = viewport.stepFactor;
        const px = (pinch.cx - pinch.panX) / (pinch.zoom * k);
        const py = (pinch.cy - pinch.panY) / (pinch.zoom * k);
        viewport.set({ zoom, panX: info.cx - px * zoom * k, panY: info.cy - py * zoom * k });
        pinch = { ...pinch, cx: pinch.cx, cy: pinch.cy };
        return;
      }
      if (panStart) {
        viewport.set({
          zoom: viewport.zoom,
          panX: panStart.panX + e.clientX - panStart.x,
          panY: panStart.panY + e.clientY - panStart.y,
        });
        return;
      }
      if (guideDrag) {
        guideDrag.at = edgeAt(guideDrag.axis, local(e));
        request();
        return;
      }
      if (axisDrag) {
        dragAxis(local(e));
        return;
      }
      if (refDrag) {
        dragRef(local(e), false);
        return;
      }
      if (rotateDrag) {
        // Degrees, clockwise on screen, in -180..180; Shift snaps to 15°.
        let deg = ((pointerAngle(rotateDrag.center, local(e)) - rotateDrag.start) * 180) / Math.PI;
        deg = ((((deg + 180) % 360) + 360) % 360) - 180;
        deg = e.shiftKey ? Math.round(deg / 15) * 15 : Math.round(deg);
        if (deg === -180) deg = 180;
        scaleNote = `${deg}°`;
        editor.previewRotate(deg);
        request();
        return;
      }
      if (scaleDrag) {
        editor.previewScale(scaleRect(scaleDrag.from, scaleDrag.corner, local(e), e));
        request();
        return;
      }
      const here = local(e);
      const onAxis = editor.isStroking ? null : (axisAt(here) ?? guideAt(here)?.axis ?? null);
      canvas.classList.toggle('on-axis-x', onAxis === 'x');
      canvas.classList.toggle('on-axis-y', onAxis === 'y');
      canvas.classList.toggle('on-ruler', !editor.isStroking && rulerAt(here) !== null);
      const events = editor.isStroking && e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
      for (const ev of events.length ? events : [e]) {
        const l = local(ev);
        const p = viewport.toPixel(l.x, l.y);
        if (editor.isStroking) editor.moveStroke(p, { shift: ev.shiftKey });
        hover = p;
      }
      updateHover(hover);
      if (!editor.isStroking) canvas.classList.toggle('on-label', onLabel(local(e)));
      lastMods = { metaKey: e.metaKey, ctrlKey: e.ctrlKey };
      lastLocal = local(e);
      // Over a corner handle, the cursor says it resizes.
      const handle = editor.isStroking ? null : handleAt(lastLocal);
      canvas.classList.toggle('on-handle-nwse', !!handle && (handle.corner === 0 || handle.corner === 3));
      canvas.classList.toggle('on-handle-nesw', !!handle && (handle.corner === 1 || handle.corner === 2));
      canvas.classList.toggle('on-rotate', !editor.isStroking && !handle && rotateZoneAt(lastLocal) !== null);
      // Alt picks a color with drawing tools: show the eyedropper while it is held.
      canvas.classList.toggle('alt-pick', e.altKey && DRAWING_TOOLS.includes(editor.getState().tool));
      request();
    };

    const onUp = (e: PointerEvent) => {
      clearInterval(sprayTimer);
      pointers.delete(e.pointerId);
      if (pinch) {
        if (touches().length < 2) {
          const info = { cx: pinch.cx, cy: pinch.cy };
          pinch = null;
          viewport.settle(info.cx, info.cy);
        }
        return;
      }
      if (panStart) {
        panStart = null;
        canvas.style.cursor = '';
        return;
      }
      if (guideDrag) {
        // Dropped back on its ruler: no guide (a new one is dropped, an existing one removed).
        const { axis, index, at } = guideDrag;
        guideDrag = null;
        if (rulerAt(local(e)) === axis) {
          if (index !== null) editor.setGuide(axis, index, null);
        } else editor.setGuide(axis, index, at);
        request();
        return;
      }
      if (axisDrag) {
        axisDrag = null;
        return;
      }
      if (refDrag) {
        dragRef(local(e), true);
        refDrag = null;
        return;
      }
      if (scaleDrag || rotateDrag) {
        editor.endScale();
        scaleDrag = null;
        rotateDrag = null;
        scaleNote = null;
        request();
        return;
      }
      editor.endStroke();
    };

    const onCancel = (e: PointerEvent) => {
      clearInterval(sprayTimer);
      pointers.delete(e.pointerId);
      editor.cancelStroke();
      panStart = null;
      pinch = null;
      axisDrag = null;
      guideDrag = null;
      if (refDrag) editor.updateReference(refDrag.rect);
      refDrag = null;
      if (scaleDrag || rotateDrag) editor.cancelScale();
      scaleDrag = null;
      rotateDrag = null;
      scaleNote = null;
    };

    const onLeave = (e: PointerEvent) => {
      if (e.pointerType !== 'touch' && !editor.isStroking) {
        updateHover(null);
        request();
      }
    };

    let wheelAccumulator = 0;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const l = local(e);
      if (e.shiftKey && !e.ctrlKey) return viewport.panBy(-(e.deltaY || e.deltaX), 0);
      if (!e.ctrlKey && Math.abs(e.deltaX) > Math.abs(e.deltaY) * 1.2) return viewport.panBy(-e.deltaX, 0);
      wheelAccumulator += e.deltaMode === 1 ? e.deltaY * 30 : e.deltaY;
      const threshold = e.ctrlKey ? 12 : 50;
      while (Math.abs(wheelAccumulator) >= threshold) {
        viewport.step(wheelAccumulator < 0 ? 1 : -1, l.x, l.y);
        wheelAccumulator -= Math.sign(wheelAccumulator) * threshold;
      }
    };

    // Tapping the canvas closes the mobile sheets instead of drawing.
    const closeSheets = (e: PointerEvent) => {
      if (uiStore.get().sheet) {
        e.stopPropagation();
        uiStore.set({ sheet: null });
      }
    };

    const noMenu = (e: Event) => e.preventDefault();
    // Double-click: on the frame name, rename; on an axis grip, put the axis back in the middle;
    // with the Move tool on a group, go into it (to a subgroup, then a layer).
    const onDoubleClick = (e: MouseEvent) => {
      const l = local(e);
      const axis = axisAt(l);
      if (axis) editor.setMirrorAxis(axis, null);
      else if (onLabel(l)) setRenaming(true);
      else if (editor.getState().tool === 'move') editor.enterAt(viewport.toPixel(l.x, l.y));
    };
    wrap.addEventListener('pointerdown', closeSheets, true);
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onCancel);
    canvas.addEventListener('pointerleave', onLeave);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('contextmenu', noMenu);
    canvas.addEventListener('dblclick', onDoubleClick);
    const onAlt = (e: KeyboardEvent) => {
      if (e.key !== 'Alt' || altHeld === (e.type === 'keydown')) return;
      altHeld = e.type === 'keydown';
      request();
    };
    const onBlur = () => {
      altHeld = false;
      request();
    };
    window.addEventListener('keydown', onAlt);
    window.addEventListener('keyup', onAlt);
    window.addEventListener('blur', onBlur);

    return () => {
      window.removeEventListener('keydown', onAlt);
      window.removeEventListener('keyup', onAlt);
      window.removeEventListener('blur', onBlur);
      cancelAnimationFrame(frame);
      ro.disconnect();
      mo.disconnect();
      media.removeEventListener('change', onTheme);
      motionMedia.removeEventListener('change', onMotion);
      unsubs.forEach((u) => u());
      wrap.removeEventListener('pointerdown', closeSheets, true);
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onCancel);
      canvas.removeEventListener('pointerleave', onLeave);
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('contextmenu', noMenu);
      canvas.removeEventListener('dblclick', onDoubleClick);
    };
  }, [editor]);

  return (
    <div
      ref={wrapRef}
      className={`canvas-wrap${dropping ? ' is-dropping' : ''}`}
      data-tool={tool}
      data-drop-label={t('canvas.drop')}
      onDragOver={(e) => {
        e.preventDefault();
        // A component from the Components list isn't a file: no "drop an image" overlay.
        if (e.dataTransfer.types.includes(COMPONENT_MIME)) e.dataTransfer.dropEffect = 'copy';
        else setDropping(true);
      }}
      onDragLeave={() => setDropping(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDropping(false);
        const component = e.dataTransfer.getData(COMPONENT_MIME);
        const canvas = canvasRef.current;
        if (component && canvas) {
          const r = canvas.getBoundingClientRect();
          editor.addInstanceAt(component, viewport.toPixel(e.clientX - r.left, e.clientY - r.top));
          return;
        }
        const file = e.dataTransfer.files[0];
        if (file) void actions.importImage(file);
      }}
    >
      <canvas ref={canvasRef} className="canvas" />
      {renaming && (
        <input
          className="frame-name-input"
          defaultValue={docName}
          autoFocus
          onFocus={(e) => e.currentTarget.select()}
          style={{
            left: viewport.originX / viewport.dpr,
            top: viewport.originY / viewport.dpr - LABEL.gap,
          }}
          onBlur={(e) => {
            editor.renameFile(docId, e.currentTarget.value);
            setRenaming(false);
          }}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'Enter') e.currentTarget.blur();
            if (e.key === 'Escape') {
              e.currentTarget.value = docName;
              e.currentTarget.blur();
            }
          }}
        />
      )}
    </div>
  );
}
