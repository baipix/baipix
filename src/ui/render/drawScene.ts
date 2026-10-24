import type { Selection } from '../../engine/selection';
import { alpha, toCss, type Color } from '../../engine/color';
import {
  hasBackground,
  isEmptyBoard,
  isFreeZone,
  isoGridOrigin,
  mirrorAxes,
  type PixelDoc,
} from '../../engine/document';
import type { ViewSettings } from '../../engine/editor';
import { diamondRows, tilesIsometric } from '../../engine/isoTile';
import type { Point, Rect } from '../../engine/math';
import { brush, mirrored } from '../../engine/raster';
import type { PixelBlock } from '../../engine/region';

/** The edge of a shaped selection, in its own pixels: one segment per run of edge, kept per mask. */
const edgeCache = new WeakMap<Uint8Array, Path2D>();
function maskEdges(sel: Selection): Path2D {
  const mask = sel.mask!;
  const cached = edgeCache.get(mask);
  if (cached) return cached;
  const { w, h } = sel;
  const on = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && mask[y * w + x] === 1;
  const path = new Path2D();
  // Horizontal edges, on each line between two rows; then vertical ones, between two columns.
  for (let y = 0; y <= h; y++)
    for (let x = 0; x < w;) {
      if (on(x, y) === on(x, y - 1)) {
        x++;
        continue;
      }
      const start = x;
      while (x < w && on(x, y) !== on(x, y - 1)) x++;
      path.moveTo(start, y);
      path.lineTo(x, y);
    }
  for (let x = 0; x <= w; x++)
    for (let y = 0; y < h;) {
      if (on(x, y) === on(x - 1, y)) {
        y++;
        continue;
      }
      const start = y;
      while (y < h && on(x, y) !== on(x - 1, y)) y++;
      path.moveTo(x, start);
      path.lineTo(x, y);
    }
  edgeCache.set(mask, path);
  return path;
}
import { checkerPattern, type Theme } from './theme';
import { referenceColorAt } from '../referenceColors';

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
  selection: Selection | null;
  /** Animated selection outline offset, in CSS pixels. */
  selectionDashOffset: number;
  brush: BrushPreview | null;
  /** The stabilizer's string while drawing: from the pointer to the pixel being painted. */
  stabilizer?: { at: Point; pointer: Point } | null;
  /** Move tool: the bounds of the layer a click would move, outlined on hover. */
  moveTarget: Rect | null;
  /** Move tool: the bounds of the active layer's pixels, framed with handles and its size. */
  layerBox: Rect | null;
  /** While resizing by a handle and snapped: the factor, shown after the size ("×2"). */
  sizeNote?: string | null;
  /** Eyedropper loupe around the hovered pixel, with the text shown under it (the hex code). */
  loupe: { at: Point; color: Color | null; text: string } | null;
  label: string;
  /** The file's other boards, around the active one: their place relative to it, in art pixels. */
  boards?: SceneBoard[];
  /** A board being drawn with the board tool, relative to the active board, in art pixels. */
  boardDraft?: Rect | null;
  /** The draft is the active board being resized, not a new board. */
  boardResizing?: boolean;
  /** The boards selected as boards, relative to the active one: a blue frame, handles if one. */
  selectedBoards?: Rect[];
  /** What layers being moved push off the board, drawn where it is so they follow the pointer. */
  floating?: SceneFloating[];
  /** The file's layers outside its boards, when another board is active: drawn as they are. */
  free?: SceneFloating | null;
  /** The Move tool's rectangle selecting layers, in art pixels of the active board. */
  marquee?: Rect | null;
}

/** Pixels outside the active board, at their place relative to it, in art pixels. */
export interface SceneFloating {
  image: CanvasImageSource;
  x: number;
  y: number;
  width: number;
  height: number;
  opacity: number;
}

/** A board of the file other than the active one, shown as it is, with its name above. */
export interface SceneBoard {
  id: string;
  /** Its top left corner relative to the active board's, in art pixels. */
  x: number;
  y: number;
  width: number;
  height: number;
  /** Its flattened image, background included. */
  image: CanvasImageSource;
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
/**
 * Where a frame's handles go: its corners, and the middle of its sides when there's room for them
 * between the corners (the sides resize in one direction).
 */
function handlePoints(
  rx: number,
  ry: number,
  rw: number,
  rh: number,
  hs: number,
  sides: boolean,
): number[][] {
  const points = [
    [rx, ry],
    [rx + rw, ry],
    [rx, ry + rh],
    [rx + rw, ry + rh],
  ];
  if (!sides) return points;
  if (rw > hs * 3) points.push([rx + rw / 2, ry], [rx + rw / 2, ry + rh]);
  if (rh > hs * 3) points.push([rx, ry + rh / 2], [rx + rw, ry + rh / 2]);
  return points;
}

function drawFrame(
  ctx: CanvasRenderingContext2D,
  rx: number,
  ry: number,
  rw: number,
  rh: number,
  dpr: number,
  theme: Theme,
  label?: string,
  sides = false,
): void {
  const lw = Math.max(1, Math.round(dpr));
  ctx.strokeStyle = theme.highlight;
  ctx.lineWidth = lw;
  ctx.strokeRect(rx - lw / 2, ry - lw / 2, rw + lw, rh + lw);
  const hs = Math.round(8 * dpr);
  for (const [cx, cy] of handlePoints(rx, ry, rw, rh, hs, sides)) {
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

/** A board being drawn or resized: its outline, dashed, and its size where its name will go. */
function drawBoardDraft(
  ctx: CanvasRenderingContext2D,
  draft: Rect,
  X: number,
  Y: number,
  s: number,
  lw: number,
  dpr: number,
  theme: Theme,
  /** Resizing a board: its size goes under it, in a badge, its name staying where it is. */
  below = false,
): void {
  const dx = X + draft.x * s;
  const dy = Y + draft.y * s;
  ctx.save();
  ctx.strokeStyle = theme.highlight;
  ctx.lineWidth = lw;
  ctx.setLineDash([4 * dpr, 3 * dpr]);
  ctx.strokeRect(dx - lw / 2, dy - lw / 2, draft.w * s + lw, draft.h * s + lw);
  ctx.restore();
  if (below) {
    const label = `${draft.w} × ${draft.h}`;
    ctx.font = `600 ${Math.round(11 * dpr)}px ${FONT}`;
    const pw = Math.round(ctx.measureText(label).width + 10 * dpr);
    const ph = Math.round(18 * dpr);
    const bx = Math.round(dx + (draft.w * s) / 2 - pw / 2);
    const by = Math.round(dy + draft.h * s + 10 * dpr);
    ctx.fillStyle = theme.highlightFill;
    ctx.fillRect(bx, by, pw, ph);
    ctx.fillStyle = theme.highlightInk;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, bx + pw / 2, by + ph / 2 + Math.round(dpr / 2));
    ctx.textAlign = 'start';
    return;
  }
  ctx.font = labelFont(dpr);
  ctx.fillStyle = theme.highlight;
  ctx.textBaseline = 'bottom';
  ctx.fillText(`${draft.w} × ${draft.h}`, dx, dy - Math.round(LABEL.gap * dpr));
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
  // The free layers active: only their pixels, no background, frame, name or grid.
  const free = isFreeZone(doc);
  const isoTiles = view.tile && !free && tilesIsometric(doc);

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = theme.canvas;
  ctx.fillRect(0, 0, width, height);

  const checker = checkerPattern(ctx, Math.max(4, Math.round(8 * dpr)), theme.checkA, theme.checkB);

  // The file's other boards, as they are: a click on one makes it the active board.
  for (const b of scene.boards ?? []) {
    const bx = X + b.x * s;
    const by = Y + b.y * s;
    ctx.save();
    ctx.translate(bx, by);
    ctx.fillStyle = checker;
    ctx.fillRect(0, 0, b.width * s, b.height * s);
    ctx.restore();
    ctx.drawImage(b.image, bx, by, b.width * s, b.height * s);
    ctx.strokeStyle = theme.frame;
    ctx.lineWidth = 1;
    ctx.strokeRect(bx - 0.5, by - 0.5, b.width * s + 1, b.height * s + 1);
    ctx.font = labelFont(dpr);
    ctx.fillStyle = theme.muted;
    ctx.textBaseline = 'bottom';
    ctx.fillText(b.label, bx, by - Math.round(LABEL.gap * dpr));
  }
  // Boards selected as boards: a blue frame like a layer's, handles on a single one.
  const picked = scene.selectedBoards ?? [];
  for (const r of picked) {
    const bx = X + r.x * s;
    const by = Y + r.y * s;
    const [bw, bh] = [r.w * s, r.h * s];
    ctx.strokeStyle = theme.highlight;
    ctx.lineWidth = lw * 2;
    ctx.strokeRect(bx - lw, by - lw, bw + lw * 2, bh + lw * 2);
    if (picked.length !== 1) continue;
    const k = Math.round(7 * dpr);
    ctx.fillStyle = theme.handle;
    ctx.strokeStyle = theme.highlight;
    ctx.lineWidth = lw;
    for (const [hx, hy] of [
      [0, 0],
      [0.5, 0],
      [1, 0],
      [1, 0.5],
      [1, 1],
      [0.5, 1],
      [0, 1],
      [0, 0.5],
    ]) {
      const cx = Math.round(bx + hx * bw - k / 2);
      const cy = Math.round(by + hy * bh - k / 2);
      ctx.fillRect(cx, cy, k, k);
      ctx.strokeRect(cx + 0.5, cy + 0.5, k - 1, k - 1);
    }
  }
  // A board being drawn: its outline and its size. Drawn here when there's no board to draw (the
  // canvas is empty); otherwise after the board, so a board shrunk shows it over its own pixels.
  const draft = scene.boardDraft;
  if (draft && isEmptyBoard(doc)) drawBoardDraft(ctx, draft, X, Y, s, lw, dpr, theme);
  // A file with no board: only the others' outlines and a board being drawn (the canvas says to make one).
  if (isEmptyBoard(doc)) return;

  // Tile preview: copies all around, as far as the view goes, drawn like the real canvas
  // (checkerboard included) so seams are easy to spot, then dimmed to keep the editable copy in
  // focus. Two pattern fills over the whole view, however many copies show when zoomed out.
  if (view.tile && !free) {
    ctx.save();
    ctx.translate(X, Y);
    ctx.fillStyle = checker;
    ctx.fillRect(-X, -Y, width, height);
    const copies = ctx.createPattern(scene.composite, 'repeat');
    if (copies) {
      ctx.scale(s, s);
      ctx.fillStyle = copies;
      ctx.fillRect(-X / s, -Y / s, width / s, height / s);
      // Isometric tiles: a second row of copies half a tile across and down, staggered, filling
      // the corners each diamond leaves.
      if (isoTiles) {
        ctx.translate(W / 2, H / 2);
        ctx.fillRect(-X / s - W / 2, -Y / s - H / 2, width / s, height / s);
      }
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
  // Isometric tiles: the canvas's corners show the neighbors, only its diamond is its own.
  if (isoTiles) ctx.fill(diamondPath(W, H, s));
  else if (!free) ctx.fillRect(0, 0, cw, ch);
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
  // Layers outside the boards, over them, like objects beside the frames in Figma.
  const loose = scene.free;
  if (loose) ctx.drawImage(loose.image, X + loose.x * s, Y + loose.y * s, loose.width * s, loose.height * s);
  for (const f of scene.floating ?? []) {
    ctx.globalAlpha = f.opacity;
    ctx.drawImage(f.image, X + f.x * s, Y + f.y * s, f.width * s, f.height * s);
    ctx.globalAlpha = 1;
  }

  // Render gap: paint strips between pixels with the background (or the checkerboard).
  const gap = camera.gap;
  if (gap && !free) {
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
  if (!free) ctx.fillText(scene.label, X, Y - Math.round(LABEL.gap * dpr));

  // Pixel grid (every pixel) and major grid (every 8 pixels, drawn twice to stand out). Each line
  // is a column or row of the ink image, stretched: its color follows the pixels it runs along.
  const ink = scene.gridInk;
  const col = (i: number) => ctx.drawImage(ink, i, 0, 1, H, X + i * s, Y, 1, ch);
  const row = (j: number) => ctx.drawImage(ink, 0, j, W, 1, X, Y + j * s, cw, 1);
  if (view.grid && s >= 6 && !gap && !free) {
    for (let i = 1; i < W; i++) if (i % 8) col(i);
    for (let j = 1; j < H; j++) if (j % 8) row(j);
  }
  if (view.grid && s >= 2 && (W > 8 || H > 8) && !free) {
    for (let k = 0; k < 2; k++) {
      for (let i = 8; i < W; i += 8) col(i);
      for (let j = 8; j < H; j += 8) row(j);
    }
  }
  if (doc.isoGrid && !free)
    drawIsoGrid(ctx, doc.isoGrid, !!doc.isoGridVertical, W, H, X, Y, s, camera.dpr, theme.isoGrid);
  if (!free) {
    ctx.strokeStyle = theme.frame;
    ctx.lineWidth = 1;
    ctx.strokeRect(X - 0.5, Y - 0.5, cw + 1, ch + 1);
  }

  if (scene.moveTarget) {
    const r = scene.moveTarget;
    ctx.strokeStyle = theme.highlight;
    ctx.lineWidth = lw;
    ctx.strokeRect(X + r.x * s - lw / 2, Y + r.y * s - lw / 2, r.w * s - gap + lw, r.h * s - gap + lw);
  }

  // The stabilizer's string: a line from the pointer (a small ring) to the pixel being painted,
  // where the brush is drawn below.
  if (scene.stabilizer) {
    const { at, pointer } = scene.stabilizer;
    const px = X + (pointer.x + 0.5) * s;
    const py = Y + (pointer.y + 0.5) * s;
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(X + (at.x + 0.5) * s, Y + (at.y + 0.5) * s);
    strokeTwoTone(ctx, lw, theme);
    ctx.beginPath();
    ctx.arc(px, py, 3 * lw, 0, Math.PI * 2);
    strokeTwoTone(ctx, lw, theme);
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

  // The active board being resized (or a new board drawn over it): the part a shrink would cut is
  // dimmed, and the new outline goes on top of the board.
  if (draft && !isEmptyBoard(doc)) {
    const bw = doc.width * s;
    const bh = doc.height * s;
    const dx = X + draft.x * s;
    const dy = Y + draft.y * s;
    const dw = draft.w * s;
    const dh = draft.h * s;
    ctx.save();
    // Within the board only: growing it dims nothing.
    ctx.beginPath();
    ctx.rect(X, Y, bw, bh);
    ctx.clip();
    ctx.beginPath();
    ctx.rect(X, Y, bw, bh);
    ctx.rect(dx, dy, dw, dh);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
    ctx.fill('evenodd');
    ctx.restore();
    drawBoardDraft(ctx, draft, X, Y, s, lw, dpr, theme, scene.boardResizing);
  }

  // Selected reference, or the active layer with the Move tool: a blue frame with white corner
  // handles, and the layer's size under it.
  if (ref?.selected) {
    // The same frame as a layer's: handles on the corners and the sides, its size under it.
    const r = ref.rect;
    drawFrame(
      ctx,
      Math.round(X + r.x * s),
      Math.round(Y + r.y * s),
      Math.round(r.w * s),
      Math.round(r.h * s),
      dpr,
      theme,
      `${Math.round(r.w)} × ${Math.round(r.h)}`,
      true,
    );
  } else if (scene.layerBox) {
    const r = scene.layerBox;
    const rw = r.w * s - gap;
    const rh = r.h * s - gap;
    const note = scene.sizeNote ? ` · ${scene.sizeNote}` : '';
    drawFrame(ctx, X + r.x * s, Y + r.y * s, rw, rh, dpr, theme, `${r.w} × ${r.h}${note}`, true);
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
    // A selection of any shape (lasso, magic wand) shows its own edge; a rectangle, its box.
    const edge = () => {
      if (!sel.mask) return ctx.strokeRect(rx + lw / 2, ry + lw / 2, rw - lw, rh - lw);
      // Drawn in art pixels: the line width and the dashes are scaled back to screen pixels.
      const dashes = ctx.getLineDash();
      const offset = ctx.lineDashOffset;
      ctx.save();
      ctx.translate(rx, ry);
      ctx.scale(s, s);
      ctx.lineWidth = lw / s;
      ctx.setLineDash(dashes.map((d) => d / s));
      ctx.lineDashOffset = offset / s;
      ctx.stroke(maskEdges(sel));
      ctx.restore();
    };
    ctx.strokeStyle = theme.accentInk;
    edge();
    ctx.strokeStyle = theme.accent;
    const dash = 4 * dpr;
    ctx.setLineDash([dash, dash]);
    ctx.lineDashOffset = -scene.selectionDashOffset * dpr;
    edge();
    ctx.restore();
    const hs = Math.round(7 * dpr);
    for (const [cx, cy] of handlePoints(rx, ry, rw, rh, hs, true)) {
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

  // The Move tool's marquee: a light blue rectangle, like in a design tool.
  const marquee = scene.marquee;
  if (marquee) {
    const mx = X + marquee.x * s;
    const my = Y + marquee.y * s;
    ctx.save();
    ctx.fillStyle = theme.highlight;
    ctx.globalAlpha = 0.12;
    ctx.fillRect(mx, my, marquee.w * s, marquee.h * s);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = theme.highlight;
    ctx.lineWidth = lw;
    ctx.strokeRect(mx + lw / 2, my + lw / 2, marquee.w * s - lw, marquee.h * s - lw);
    ctx.restore();
  }
  if (scene.loupe) drawLoupe(ctx, width, scene, scene.loupe, camera, theme, checker);
}

/**
 * Eyedropper loupe: the pixels around the cursor, magnified in a circle, the picked pixel framed in
 * the middle, a ring in the picked color and the hex code under it. It floats above the cursor so a
 * finger doesn't hide it, and goes below near the top edge.
 */
function drawLoupe(
  ctx: CanvasRenderingContext2D,
  width: number,
  scene: Scene,
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
  // Under the drawing, as on the canvas: the background, then the reference image. The reference
  // shows as the eyedropper picks it: one cell per art pixel, its color at the pixel's center, in full.
  const { doc } = scene;
  if (scene.reference) {
    const ox = loupe.at.x - half;
    const oy = loupe.at.y - half;
    const background = hasBackground(doc) ? toCss(doc.background) : null;
    for (let j = 0; j < LOUPE_PIXELS; j++)
      for (let i = 0; i < LOUPE_PIXELS; i++) {
        const c = referenceColorAt(doc, ox + i, oy + j);
        const fill = c ? toCss(c) : background;
        if (!fill) continue;
        ctx.fillStyle = fill;
        ctx.fillRect(x + i * cell, y + j * cell, cell, cell);
      }
  }
  ctx.drawImage(
    scene.composite,
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

/**
 * The isometric grid: lines 2 pixels across for 1 up, both ways, through the pixel corners, so
 * they cross every `cell / 2` pixels across and `cell / 4` down, from the top middle of the canvas. Left out
 * when zoomed so far out that the diamonds would be a blur.
 */
function drawIsoGrid(
  ctx: CanvasRenderingContext2D,
  cell: number,
  vertical: boolean,
  W: number,
  H: number,
  X: number,
  Y: number,
  s: number,
  dpr: number,
  color: string,
): void {
  const step = cell / 2;
  if (step * s < 6) return;
  ctx.save();
  ctx.beginPath();
  ctx.rect(X, Y, W * s, H * s);
  ctx.clip();
  ctx.beginPath();
  // Through the top middle of the canvas (see `isoGridOrigin`): going down to the right
  // (y = (x - ox) / 2 + c), and up to the right (y = c - (x - ox) / 2), every `step` down.
  const ox = isoGridOrigin(W);
  const lines = (dir: 1 | -1) => {
    const y0 = (c: number) => c - (dir * ox) / 2;
    const y1 = (c: number) => c + (dir * (W - ox)) / 2;
    const from = Math.floor(-Math.max(y0(0), y1(0)) / step);
    const to = Math.ceil((H - Math.min(y0(0), y1(0))) / step);
    for (let k = from; k <= to; k++) {
      ctx.moveTo(X, Y + y0(k * step) * s);
      ctx.lineTo(X + W * s, Y + y1(k * step) * s);
    }
  };
  lines(1);
  lines(-1);
  // Upright lines through the corners, every half cell across, to build heights.
  if (vertical)
    for (let x = ox - Math.floor(ox / step) * step; x <= W; x += step) {
      ctx.moveTo(X + x * s, Y);
      ctx.lineTo(X + x * s, Y + H * s);
    }
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(1, Math.round(dpr));
  ctx.stroke();
  ctx.restore();
}

/** The diamond of an isometric tile, pixel by pixel, at `s` device pixels per pixel. */
function diamondPath(W: number, H: number, s: number): Path2D {
  const path = new Path2D();
  diamondRows(W, H).forEach(([first, last], y) => {
    if (first <= last) path.rect(first * s, y * s, (last - first + 1) * s, s);
  });
  return path;
}

/** Where a guide on pixel edge `at` is on screen, in device pixels (in the gap's middle, if any). */
export const guidePosition = (at: number, origin: number, camera: Camera): number =>
  origin + at * camera.scale - (at > 0 ? camera.gap / 2 : 0);

export interface RulerScene {
  guides: { x: number[]; y: number[] };
  /**
   * What's selected, in art pixels of the active board (the layer framed, the pixel selection),
   * shown as a band on the rulers with its edges written in the accent, like Figma. Missing: the board.
   */
  extent?: Rect | null;
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

  // Backgrounds, with what's selected (else the board) shaded.
  const ext = rulers.extent ?? { x: 0, y: 0, w: doc.width, h: doc.height };
  ctx.fillStyle = theme.panel;
  ctx.fillRect(L, 0, right - L, R);
  ctx.fillRect(L, R, R, height - R);
  ctx.fillStyle = theme.selected;
  const x0 = Math.max(L + R, X + ext.x * s);
  const x1 = Math.min(right, X + (ext.x + ext.w) * s - camera.gap);
  if (x1 > x0) ctx.fillRect(x0, 0, x1 - x0, R);
  const y0 = Math.max(R, Y + ext.y * s);
  const y1 = Math.min(height, Y + (ext.y + ext.h) * s - camera.gap);
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
  // Numbers too close to the extent's edges are left out: the edges are written there instead.
  const clear = 28 * dpr;
  const ticks = (
    from: number,
    to: number,
    origin: number,
    edges: number[],
    draw: (pos: number, n: number, major: boolean) => void,
  ) => {
    const near = (pos: number) => edges.some((e) => Math.abs(pos - guidePosition(e, origin, camera)) < clear);
    const first = Math.ceil((from - origin) / s / minor) * minor;
    for (let n = first; origin + n * s <= to; n += minor) {
      const pos = guidePosition(n, origin, camera);
      draw(pos, n, n % step === 0 && !near(pos));
    }
  };
  const label = (n: number, x: number, y: number, vertical: boolean) => {
    if (!vertical) return ctx.fillText(String(n), Math.round(x + 3 * dpr), Math.round(y));
    ctx.save();
    ctx.translate(Math.round(x), Math.round(y - 3 * dpr));
    ctx.rotate(-Math.PI / 2);
    ctx.fillText(String(n), 0, 0);
    ctx.restore();
  };
  const xEdges = [ext.x, ext.x + ext.w];
  const yEdges = [ext.y, ext.y + ext.h];
  ctx.fillStyle = theme.muted;
  ticks(L + R, right, X, xEdges, (x, n, major) => {
    const h = major ? R / 3 : R / 6;
    ctx.fillRect(Math.round(x), R - h, lw, h);
    if (major) label(n, x, R * 0.38, false);
  });
  ticks(R, height, Y, yEdges, (y, n, major) => {
    const w = major ? R / 3 : R / 6;
    ctx.fillRect(L + R - w, Math.round(y), w, lw);
    if (major) label(n, L + R * 0.38, y, true);
  });
  // The extent's edges, in the accent.
  ctx.fillStyle = theme.highlight;
  ctx.font = `600 ${Math.round(9 * dpr)}px ${FONT}`;
  for (const n of xEdges) {
    const x = guidePosition(n, X, camera);
    if (x < L + R || x > right) continue;
    ctx.fillRect(Math.round(x), R / 2, lw, R / 2);
    label(n, x, R * 0.38, false);
  }
  for (const n of yEdges) {
    const y = guidePosition(n, Y, camera);
    if (y < R || y > height) continue;
    ctx.fillRect(L + R / 2, Math.round(y), R / 2, lw);
    label(n, L + R * 0.38, y, true);
  }
  ctx.font = `500 ${Math.round(9 * dpr)}px ${FONT}`;

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
