import { alpha, toCss, type Color } from '../../engine/color';
import { hasBackground, mirrorAxes, type PixelDoc } from '../../engine/document';
import type { ViewSettings } from '../../engine/editor';
import type { Point, Rect } from '../../engine/math';
import { brush, mirrored } from '../../engine/raster';
import type { PixelBlock } from '../../engine/region';
import { checkerPattern, type Theme } from './theme';

export interface Camera {
  dpr: number;
  /** Device pixels from one art pixel to the next (pixel + gap). */
  scale: number;
  /** Render gap between art pixels, in device pixels (0 when hidden). */
  gap: number;
  originX: number;
  originY: number;
}

export interface BrushPreview {
  at: Point;
  size: number;
  /** Fill color of the footprint (null = outline only). */
  color: Color | null;
  /** Spray: diameter of the circle the pixels land in, outlined around the pointer. */
  circle?: number;
  /** Round brush tip. */
  round?: boolean;
  /** A custom brush, previewed as it will paint (its colors, or `color` as a stencil). */
  block?: PixelBlock;
}

/** The reference image, under the layers. `rect` is in art pixels. */
export interface SceneReference {
  image: CanvasImageSource;
  rect: Rect;
  opacity: number;
  /** Selected (like a layer): shown whole, with an outline and corner handles to resize it. */
  selected: boolean;
}

export interface Scene {
  doc: PixelDoc;
  /** Flattened image (doc size, background included). */
  composite: CanvasImageSource;
  /** Grid line color for each pixel, same size as `composite` (see grid.ts). */
  gridInk: CanvasImageSource;
  /** When set, `composite` leaves out the background: it is painted here, under the reference. */
  reference: SceneReference | null;
  view: ViewSettings;
  selection: Rect | null;
  /** Animated selection outline offset, in CSS pixels. */
  selectionDashOffset: number;
  brush: BrushPreview | null;
  /** Move tool: the bounds of the layer a click would move, outlined on hover. */
  moveTarget: Rect | null;
  /** Move tool: the bounds of the active layer's pixels, framed with handles and its size. */
  layerBox: Rect | null;
  /** While resizing by a handle and snapped: the factor, shown after the size ("×2"). */
  sizeNote?: string | null;
  /** Eyedropper loupe around the hovered pixel, with the text shown under it (the hex code). */
  loupe: { at: Point; color: Color | null; text: string } | null;
  label: string;
}

/** Pixels shown across the loupe (odd, so the picked pixel is in the middle), and their size. */
const LOUPE_PIXELS = 9;
const LOUPE_CELL = 12;

/** How far the symmetry axes (and their grips) reach outside the canvas, in CSS pixels. */
export const AXIS_GRIP = 14;

/**
 * Where the symmetry axes are on screen, in device pixels. An axis between two pixels sits in the
 * middle of the gap between them, when there is one.
 */
export function axisPositions(doc: PixelDoc, camera: Camera): { x: number; y: number } {
  const { scale: s, gap, originX: X, originY: Y } = camera;
  const axes = mirrorAxes(doc);
  const at = (a: number, origin: number) => origin + a * s - (a > 0 ? gap / 2 : 0);
  return { x: at(axes.x, X), y: at(axes.y, Y) };
}

const FONT = 'Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

/** Frame name above the canvas, in CSS pixels. Shared with the inline rename field. */
export const LABEL = { size: 11, gap: 6 };
const labelFont = (dpr: number) => `500 ${Math.round(LABEL.size * dpr)}px ${FONT}`;

/**
 * Strokes the current path dark on a white halo, so a brush outline shows on any color: black
 * pixels, white pixels and the checkerboard alike.
 */
function strokeTwoTone(ctx: CanvasRenderingContext2D, lw: number, theme: Theme): void {
  ctx.lineWidth = lw * 3;
  ctx.strokeStyle = theme.handle;
  ctx.stroke();
  ctx.lineWidth = lw;
  ctx.strokeStyle = theme.highlightInk;
  ctx.stroke();
}

/**
 * A blue frame with white square handles on its corners, like a selected object in a design tool,
 * and an optional size badge under it. In device pixels.
 */
function drawFrame(
  ctx: CanvasRenderingContext2D,
  rx: number,
  ry: number,
  rw: number,
  rh: number,
  dpr: number,
  theme: Theme,
  label?: string,
): void {
  const lw = Math.max(1, Math.round(dpr));
  ctx.strokeStyle = theme.highlight;
  ctx.lineWidth = lw;
  ctx.strokeRect(rx - lw / 2, ry - lw / 2, rw + lw, rh + lw);
  const hs = Math.round(8 * dpr);
  for (const [cx, cy] of [
    [rx, ry],
    [rx + rw, ry],
    [rx, ry + rh],
    [rx + rw, ry + rh],
  ]) {
    const hx = Math.round(cx - hs / 2);
    const hy = Math.round(cy - hs / 2);
    ctx.fillStyle = theme.handle;
    ctx.fillRect(hx, hy, hs, hs);
    ctx.strokeRect(hx + lw / 2, hy + lw / 2, hs - lw, hs - lw);
  }
  if (!label) return;
  ctx.font = `600 ${Math.round(11 * dpr)}px ${FONT}`;
  const pw = Math.round(ctx.measureText(label).width + 10 * dpr);
  const ph = Math.round(18 * dpr);
  const bx = Math.round(rx + rw / 2 - pw / 2);
  const by = Math.round(ry + rh + 10 * dpr);
  ctx.fillStyle = theme.highlightFill;
  ctx.fillRect(bx, by, pw, ph);
  ctx.fillStyle = theme.highlightInk;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, bx + pw / 2, by + ph / 2 + Math.round(dpr / 2));
  ctx.textAlign = 'start';
}

/** Hit box of the frame name, in device pixels (a few pixels of slack around the text). */
export function labelRect(ctx: CanvasRenderingContext2D, label: string, camera: Camera): Rect {
  const { dpr, originX: X, originY: Y } = camera;
  ctx.save();
  ctx.font = labelFont(dpr);
  const w = ctx.measureText(label).width;
  ctx.restore();
  const pad = Math.round(4 * dpr);
  const h = Math.round((LABEL.size + LABEL.gap) * dpr);
  return { x: X - pad, y: Y - h - pad, w: w + pad * 2, h: h + pad };
}

export function drawScene(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  scene: Scene,
  camera: Camera,
  theme: Theme,
): void {
  const { doc, view } = scene;
  const { dpr, scale: s, originX: X, originY: Y } = camera;
  const W = doc.width;
  const H = doc.height;
  const cw = W * s;
  const ch = H * s;
  const lw = Math.max(1, Math.round(dpr));

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = theme.canvas;
  ctx.fillRect(0, 0, width, height);

  const checker = checkerPattern(ctx, Math.max(4, Math.round(8 * dpr)), theme.checkA, theme.checkB);

  // Tile preview: copies all around, as far as the view goes, drawn like the real canvas
  // (checkerboard included) so seams are easy to spot, then dimmed to keep the editable copy in
  // focus. Two pattern fills over the whole view, however many copies show when zoomed out.
  if (view.tile) {
    ctx.save();
    ctx.translate(X, Y);
    ctx.fillStyle = checker;
    ctx.fillRect(-X, -Y, width, height);
    const copies = ctx.createPattern(scene.composite, 'repeat');
    if (copies) {
      ctx.scale(s, s);
      ctx.fillStyle = copies;
      ctx.fillRect(-X / s, -Y / s, width / s, height / s);
    }
    ctx.restore();
    // The copies are dimmed so the editable one stands out, as much as the tile opacity says.
    const dim = 1 - view.tileOpacity;
    if (dim > 0) {
      ctx.save();
      ctx.globalAlpha = dim;
      ctx.fillStyle = theme.canvas;
      ctx.fillRect(0, 0, width, height);
      ctx.restore();
    }
  }

  ctx.save();
  ctx.translate(X, Y);
  ctx.fillStyle = checker;
  ctx.fillRect(0, 0, cw, ch);
  ctx.restore();
  const ref = scene.reference;
  if (ref) {
    if (hasBackground(doc)) {
      ctx.fillStyle = toCss(doc.background);
      ctx.fillRect(X, Y, cw, ch);
    }
    const r = ref.rect;
    ctx.save();
    // Clipped to the canvas, except when selected, so it can be placed from outside too.
    if (!ref.selected) {
      ctx.beginPath();
      ctx.rect(X, Y, cw, ch);
      ctx.clip();
    }
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.globalAlpha = ref.opacity;
    ctx.drawImage(ref.image, X + r.x * s, Y + r.y * s, r.w * s, r.h * s);
    ctx.restore();
  }
  ctx.drawImage(scene.composite, X, Y, cw, ch);

  // Render gap: paint strips between pixels with the background (or the checkerboard).
  const gap = camera.gap;
  if (gap) {
    ctx.save();
    ctx.translate(X, Y);
    ctx.fillStyle = doc.backgroundVisible && alpha(doc.background) ? toCss(doc.background) : checker;
    for (let i = 0; i < W; i++) ctx.fillRect(i * s + s - gap, 0, gap, ch);
    for (let j = 0; j < H; j++) ctx.fillRect(0, j * s + s - gap, cw, gap);
    ctx.restore();
  }

  // Frame name above the canvas.
  ctx.font = labelFont(dpr);
  ctx.fillStyle = theme.muted;
  ctx.textBaseline = 'bottom';
  ctx.fillText(scene.label, X, Y - Math.round(LABEL.gap * dpr));

  // Pixel grid (every pixel) and major grid (every 8 pixels, drawn twice to stand out). Each line
  // is a column or row of the ink image, stretched: its color follows the pixels it runs along.
  const ink = scene.gridInk;
  const col = (i: number) => ctx.drawImage(ink, i, 0, 1, H, X + i * s, Y, 1, ch);
  const row = (j: number) => ctx.drawImage(ink, 0, j, W, 1, X, Y + j * s, cw, 1);
  if (view.grid && s >= 6 && !gap) {
    for (let i = 1; i < W; i++) if (i % 8) col(i);
    for (let j = 1; j < H; j++) if (j % 8) row(j);
  }
  if (view.grid && s >= 2 && (W > 8 || H > 8)) {
    for (let k = 0; k < 2; k++) {
      for (let i = 8; i < W; i += 8) col(i);
      for (let j = 8; j < H; j += 8) row(j);
    }
  }
  ctx.strokeStyle = theme.frame;
  ctx.lineWidth = 1;
  ctx.strokeRect(X - 0.5, Y - 0.5, cw + 1, ch + 1);

  if (scene.moveTarget) {
    const r = scene.moveTarget;
    ctx.strokeStyle = theme.highlight;
    ctx.lineWidth = lw;
    ctx.strokeRect(X + r.x * s - lw / 2, Y + r.y * s - lw / 2, r.w * s - gap + lw, r.h * s - gap + lw);
  }

  // Brush footprint: one cell per pixel, shrunk by the gap so it matches what will be painted.
  if (scene.brush?.block) {
    const { at, block, color } = scene.brush;
    const ox = Math.floor((block.width - 1) / 2);
    const oy = Math.floor((block.height - 1) / 2);
    const cell = gap ? s - gap : s;
    ctx.globalAlpha = 0.6;
    for (let by = 0; by < block.height; by++)
      for (let bx = 0; bx < block.width; bx++) {
        const c = block.pixels[by * block.width + bx];
        if (!alpha(c)) continue;
        ctx.fillStyle = toCss(color ?? c);
        ctx.fillRect(X + (at.x - ox + bx) * s, Y + (at.y - oy + by) * s, cell, cell);
      }
    ctx.globalAlpha = 1;
    ctx.beginPath();
    ctx.rect(X + (at.x - ox) * s, Y + (at.y - oy) * s, block.width * s, block.height * s);
    strokeTwoTone(ctx, lw, theme);
  } else if (scene.brush?.circle) {
    const { at, circle } = scene.brush;
    const axes = mirrorAxes(doc);
    for (const m of mirrored(at.x, at.y, axes.x, axes.y, view.mirrorX, view.mirrorY)) {
      ctx.beginPath();
      ctx.arc(X + (m.x + 0.5) * s, Y + (m.y + 0.5) * s, (circle / 2) * s, 0, Math.PI * 2);
      strokeTwoTone(ctx, lw, theme);
    }
  } else if (scene.brush) {
    const { at, size, color } = scene.brush;
    const round = !!scene.brush.round && size > 2;
    const cell = gap ? s - gap : s;
    const o = Math.floor((size - 1) / 2);
    const axes = mirrorAxes(doc);
    for (const m of mirrored(at.x - o, at.y - o, axes.x, axes.y, view.mirrorX, view.mirrorY, size)) {
      brush(
        m.x + o,
        m.y + o,
        size,
        (x, y) => {
          const rx = X + x * s;
          const ry = Y + y * s;
          if (color !== null && alpha(color)) {
            ctx.fillStyle = toCss(color);
            ctx.globalAlpha = 0.6;
            ctx.fillRect(rx, ry, cell, cell);
            ctx.globalAlpha = 1;
          }
          if (gap || size === 1) {
            ctx.beginPath();
            ctx.rect(rx + lw / 2, ry + lw / 2, cell - lw, cell - lw);
            strokeTwoTone(ctx, lw, theme);
          }
        },
        round,
      );
      if (!gap && size > 1) {
        const w = size * s;
        ctx.beginPath();
        // A round tip is outlined by its circle, a square one by its square.
        if (round) ctx.arc(X + m.x * s + w / 2, Y + m.y * s + w / 2, w / 2, 0, Math.PI * 2);
        else ctx.rect(X + m.x * s + lw / 2, Y + m.y * s + lw / 2, w - lw, w - lw);
        strokeTwoTone(ctx, lw, theme);
      }
    }
  }

  // Symmetry axes, with a grip at each end (outside the canvas) to drag them.
  ctx.fillStyle = theme.axis;
  const ext = Math.round(AXIS_GRIP * dpr);
  const grip = Math.max(3, Math.round(5 * dpr));
  const { x: ax, y: ay } = axisPositions(doc, camera);
  if (view.mirrorX) {
    const x = Math.round(ax - lw / 2);
    ctx.fillRect(x, Y - ext, lw, ch + ext * 2);
    ctx.fillRect(Math.round(ax - grip / 2), Y - ext, grip, ext - Math.round(3 * dpr));
    ctx.fillRect(Math.round(ax - grip / 2), Y + ch + Math.round(3 * dpr), grip, ext - Math.round(3 * dpr));
  }
  if (view.mirrorY) {
    const y = Math.round(ay - lw / 2);
    ctx.fillRect(X - ext, y, cw + ext * 2, lw);
    ctx.fillRect(X - ext, Math.round(ay - grip / 2), ext - Math.round(3 * dpr), grip);
    ctx.fillRect(X + cw + Math.round(3 * dpr), Math.round(ay - grip / 2), ext - Math.round(3 * dpr), grip);
  }

  // Selected reference, or the active layer with the Move tool: a blue frame with white corner
  // handles, and the layer's size under it.
  if (ref?.selected) {
    const r = ref.rect;
    drawFrame(
      ctx,
      Math.round(X + r.x * s),
      Math.round(Y + r.y * s),
      Math.round(r.w * s),
      Math.round(r.h * s),
      dpr,
      theme,
    );
  } else if (scene.layerBox) {
    const r = scene.layerBox;
    const rw = r.w * s - gap;
    const rh = r.h * s - gap;
    const note = scene.sizeNote ? ` · ${scene.sizeNote}` : '';
    drawFrame(ctx, X + r.x * s, Y + r.y * s, rw, rh, dpr, theme, `${r.w} × ${r.h}${note}`);
  }

  // Selection: blue outline, corner handles and a size badge.
  const sel = scene.selection;
  if (sel) {
    const rx = X + sel.x * s;
    const ry = Y + sel.y * s;
    const rw = sel.w * s;
    const rh = sel.h * s;
    ctx.strokeStyle = theme.accent;
    ctx.lineWidth = lw;
    ctx.save();
    ctx.strokeStyle = theme.accentInk;
    ctx.strokeRect(rx + lw / 2, ry + lw / 2, rw - lw, rh - lw);
    ctx.strokeStyle = theme.accent;
    const dash = 4 * dpr;
    ctx.setLineDash([dash, dash]);
    ctx.lineDashOffset = -scene.selectionDashOffset * dpr;
    ctx.strokeRect(rx + lw / 2, ry + lw / 2, rw - lw, rh - lw);
    ctx.restore();
    const hs = Math.round(7 * dpr);
    for (const [cx, cy] of [
      [rx, ry],
      [rx + rw, ry],
      [rx, ry + rh],
      [rx + rw, ry + rh],
    ]) {
      const hx = Math.round(cx - hs / 2);
      const hy = Math.round(cy - hs / 2);
      ctx.fillStyle = theme.handle;
      ctx.fillRect(hx, hy, hs, hs);
      ctx.strokeRect(hx + lw / 2, hy + lw / 2, hs - lw, hs - lw);
    }
    const text = `${sel.w} × ${sel.h}${scene.sizeNote ? ` · ${scene.sizeNote}` : ''}`;
    ctx.font = `500 ${Math.round(11 * dpr)}px ${FONT}`;
    const pw = Math.round(ctx.measureText(text).width + 10 * dpr);
    const ph = Math.round(16 * dpr);
    const bx = Math.round(rx + rw / 2 - pw / 2);
    const by = Math.round(ry + rh + 8 * dpr);
    ctx.fillStyle = theme.accent;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(bx, by, pw, ph, Math.round(2 * dpr));
    else ctx.rect(bx, by, pw, ph);
    ctx.fill();
    ctx.fillStyle = theme.accentInk;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    ctx.fillText(text, bx + pw / 2, by + ph / 2 + 0.5 * dpr);
    ctx.textAlign = 'start';
  }

  if (scene.loupe) drawLoupe(ctx, width, scene.composite, scene.loupe, camera, theme, checker);
}

/**
 * Eyedropper loupe: the pixels around the cursor, magnified in a circle, the picked pixel framed in
 * the middle, a ring in the picked color and the hex code under it. It floats above the cursor so a
 * finger doesn't hide it, and goes below near the top edge.
 */
function drawLoupe(
  ctx: CanvasRenderingContext2D,
  width: number,
  composite: CanvasImageSource,
  loupe: NonNullable<Scene['loupe']>,
  camera: Camera,
  theme: Theme,
  checker: CanvasPattern,
): void {
  const { dpr, scale: s, originX: X, originY: Y } = camera;
  const cell = Math.round(LOUPE_CELL * dpr);
  const size = cell * LOUPE_PIXELS;
  const r = size / 2;
  const margin = Math.round(8 * dpr);
  const offset = Math.round(28 * dpr);
  const cx = X + (loupe.at.x + 0.5) * s;
  const cy = Y + (loupe.at.y + 0.5) * s;
  const x = Math.round(Math.min(Math.max(cx, r + margin), width - r - margin) - r);
  let y = Math.round(cy - offset - size);
  if (y < margin) y = Math.round(cy + offset);
  const half = (LOUPE_PIXELS - 1) / 2;

  ctx.save();
  ctx.beginPath();
  ctx.arc(x + r, y + r, r, 0, Math.PI * 2);
  ctx.clip();
  ctx.fillStyle = checker;
  ctx.fillRect(x, y, size, size);
  ctx.drawImage(
    composite,
    loupe.at.x - half,
    loupe.at.y - half,
    LOUPE_PIXELS,
    LOUPE_PIXELS,
    x,
    y,
    size,
    size,
  );
  ctx.fillStyle = theme.grid;
  for (let i = 1; i < LOUPE_PIXELS; i++) {
    ctx.fillRect(x + i * cell, y, 1, size);
    ctx.fillRect(x, y + i * cell, size, 1);
  }
  // The picked pixel: a dark and a light frame, readable on any color.
  const lw = Math.max(1, Math.round(dpr));
  const px = x + half * cell;
  const py = y + half * cell;
  ctx.lineWidth = lw * 2;
  ctx.strokeStyle = theme.accentInk;
  ctx.strokeRect(px - lw, py - lw, cell + lw * 2, cell + lw * 2);
  ctx.lineWidth = lw;
  ctx.strokeStyle = theme.accent;
  ctx.strokeRect(px - lw / 2, py - lw / 2, cell + lw, cell + lw);
  ctx.restore();

  // Ring in the picked color, with a thin edge so light colors stand out.
  const ring = Math.round(4 * dpr);
  ctx.beginPath();
  ctx.arc(x + r, y + r, r - ring / 2, 0, Math.PI * 2);
  ctx.lineWidth = ring;
  ctx.strokeStyle = loupe.color !== null && alpha(loupe.color) ? toCss(loupe.color) : theme.checkB;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(x + r, y + r, r, 0, Math.PI * 2);
  ctx.lineWidth = lw;
  ctx.strokeStyle = theme.frame;
  ctx.stroke();

  ctx.font = `500 ${Math.round(11 * dpr)}px ${FONT}`;
  const pw = Math.round(ctx.measureText(loupe.text).width + 10 * dpr);
  const ph = Math.round(16 * dpr);
  const bx = Math.round(x + r - pw / 2);
  const by = Math.round(y + size - ph / 2);
  ctx.fillStyle = theme.accent;
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(bx, by, pw, ph, Math.round(2 * dpr));
  else ctx.rect(bx, by, pw, ph);
  ctx.fill();
  ctx.fillStyle = theme.accentInk;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  ctx.fillText(loupe.text, bx + pw / 2, by + ph / 2 + 0.5 * dpr);
  ctx.textAlign = 'start';
}

/** How thick the rulers are, in CSS pixels. */
export const RULER = 18;
/** Ruler steps, in art pixels: the first one far enough apart for its labels. */
const RULER_STEPS = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000];

/** Where a guide on pixel edge `at` is on screen, in device pixels (in the gap's middle, if any). */
export const guidePosition = (at: number, origin: number, camera: Camera): number =>
  origin + at * camera.scale - (at > 0 ? camera.gap / 2 : 0);

export interface RulerScene {
  guides: { x: number[]; y: number[] };
  /** The guide being dragged, labeled with its position on its ruler. */
  active: { axis: 'x' | 'y'; at: number } | null;
}

/**
 * Guides across the workspace, and rulers along its top and left edges in art pixels, with the
 * drawing's extent shaded. Drawn over the scene; the panels move aside to show them.
 */
export function drawRulers(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  doc: PixelDoc,
  rulers: RulerScene,
  camera: Camera,
  theme: Theme,
): void {
  const { dpr, scale: s, originX: X, originY: Y } = camera;
  const lw = Math.max(1, Math.round(dpr));
  const R = Math.round(RULER * dpr);
  const L = 0;
  const right = width;
  ctx.setTransform(1, 0, 0, 1, 0, 0);

  ctx.fillStyle = theme.guide;
  for (const g of rulers.guides.x)
    ctx.fillRect(Math.round(guidePosition(g, X, camera) - lw / 2), 0, lw, height);
  for (const g of rulers.guides.y)
    ctx.fillRect(L, Math.round(guidePosition(g, Y, camera) - lw / 2), right - L, lw);

  // Backgrounds, with the drawing's extent shaded.
  ctx.fillStyle = theme.panel;
  ctx.fillRect(L, 0, right - L, R);
  ctx.fillRect(L, R, R, height - R);
  ctx.fillStyle = theme.selected;
  const x0 = Math.max(L + R, X);
  const x1 = Math.min(right, X + doc.width * s - camera.gap);
  if (x1 > x0) ctx.fillRect(x0, 0, x1 - x0, R);
  const y0 = Math.max(R, Y);
  const y1 = Math.min(height, Y + doc.height * s - camera.gap);
  if (y1 > y0) ctx.fillRect(L, y0, R, y1 - y0);
  ctx.fillStyle = theme.line;
  ctx.fillRect(L, R - lw, right - L, lw);
  ctx.fillRect(L + R - lw, R, lw, height - R);

  // Ticks every `minor` pixels, numbered every `step`.
  const step = RULER_STEPS.find((v) => v * s >= 48 * dpr) ?? 1000;
  const minor =
    [step / 10, step / 5, step / 2, step].find((v) => Number.isInteger(v) && v * s >= 6 * dpr) ?? step;
  ctx.font = `500 ${Math.round(9 * dpr)}px ${FONT}`;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  const ticks = (
    from: number,
    to: number,
    origin: number,
    draw: (pos: number, n: number, major: boolean) => void,
  ) => {
    const first = Math.ceil((from - origin) / s / minor) * minor;
    for (let n = first; origin + n * s <= to; n += minor)
      draw(guidePosition(n, origin, camera), n, n % step === 0);
  };
  ctx.fillStyle = theme.muted;
  ticks(L + R, right, X, (x, n, major) => {
    const h = major ? R / 2 : R / 4;
    ctx.fillRect(Math.round(x), R - h, lw, h);
    if (major) ctx.fillText(String(n), Math.round(x + 3 * dpr), Math.round(R * 0.38));
  });
  ticks(R, height, Y, (y, n, major) => {
    const w = major ? R / 2 : R / 4;
    ctx.fillRect(L + R - w, Math.round(y), w, lw);
    if (!major) return;
    ctx.save();
    ctx.translate(L + Math.round(R * 0.38), Math.round(y - 3 * dpr));
    ctx.rotate(-Math.PI / 2);
    ctx.fillText(String(n), 0, 0);
    ctx.restore();
  });

  // The dragged guide's position, in a tag on its ruler.
  const a = rulers.active;
  if (a) {
    const text = String(a.at);
    const pad = Math.round(4 * dpr);
    const tw = Math.round(ctx.measureText(text).width) + pad * 2;
    const th = R - Math.round(4 * dpr);
    ctx.fillStyle = theme.guide;
    if (a.axis === 'x') {
      const x = Math.round(guidePosition(a.at, X, camera) - tw / 2);
      ctx.fillRect(x, Math.round(2 * dpr), tw, th);
      ctx.fillStyle = '#fff';
      ctx.fillText(text, x + pad, Math.round(R / 2));
    } else {
      const y = Math.round(guidePosition(a.at, Y, camera));
      ctx.save();
      ctx.translate(L + Math.round(2 * dpr), y + tw / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.fillRect(0, 0, tw, th);
      ctx.fillStyle = '#fff';
      ctx.fillText(text, pad, Math.round(th / 2));
      ctx.restore();
    }
  }
}
