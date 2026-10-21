import { createLayer, type Layer, type PixelDoc } from './document';
import type { Rect } from './math';

/**
 * Components, like in Figma: a master sprite drawn once on the canvas, and instances that show it
 * elsewhere. A master is a layer with a `component` frame: the sprite is its pixels inside that
 * frame. An instance is a layer with an `instance` reference: its pixels are the master's sprite,
 * placed with the frame's top-left at (x, y). Instance pixels are kept rendered (see
 * `syncInstances`), so drawing, compositing and exports treat them as ordinary pixels.
 */

/**
 * A component belongs to its file, not to its board: its instances can be on any board of the
 * file, or outside the boards. Each document knows the documents of its file (its scope, set by
 * the editor with `linkBoards`), and a master is looked up across them. A document with no scope
 * (a test, a file being read) is its own file.
 */
const scopes = new WeakMap<PixelDoc, readonly PixelDoc[]>();

/** Sets the documents of one file: each finds the masters of all of them. */
export function linkBoards(docs: readonly PixelDoc[]): void {
  for (const doc of docs) scopes.set(doc, docs);
}

/** The documents of `doc`'s file, `doc` first. */
export function fileDocs(doc: PixelDoc): PixelDoc[] {
  const scope = scopes.get(doc);
  return scope ? [doc, ...scope.filter((d) => d !== doc)] : [doc];
}

/** The frame of a master's sprite, in canvas pixels. */
export type ComponentFrame = Rect;

export interface InstanceRef {
  /** The master layer's id. */
  of: string;
  /** Where the master's frame top-left lands, in canvas pixels (may be outside the canvas). */
  x: number;
  y: number;
}

export const isMaster = (layer: Layer): boolean => !!layer.component;
export const isInstance = (layer: Layer): boolean => !!layer.instance;

/**
 * An instance whose master is there. One whose master was just deleted keeps its pixels and
 * reconnects if the master comes back (Undo); meanwhile it behaves like a plain layer.
 */
export const isLinkedInstance = (doc: PixelDoc, layer: Layer): boolean =>
  !!layer.instance && !!findMaster(doc, layer.instance.of);

/** The master's sprite as its own small image, for thumbnails. */
export function spritePixels(doc: PixelDoc, master: Layer): Uint32Array {
  const f = master.component!;
  const out = new Uint32Array(f.w * f.h);
  for (let y = 0; y < f.h; y++)
    out.set(master.pixels.subarray((f.y + y) * doc.width + f.x, (f.y + y) * doc.width + f.x + f.w), y * f.w);
  return out;
}

/** The masters of a document, bottom to top. */
export const masters = (doc: PixelDoc): Layer[] => doc.layers.filter(isMaster);

/** The masters of the whole file `doc` is in, with the document each is on. */
export const fileMasters = (doc: PixelDoc): { doc: PixelDoc; layer: Layer }[] =>
  fileDocs(doc).flatMap((d) => masters(d).map((layer) => ({ doc: d, layer })));

/** A master of the file, and the document it's on. */
export function masterOf(doc: PixelDoc, id: string): { doc: PixelDoc; layer: Layer } | null {
  for (const d of fileDocs(doc)) {
    const layer = d.layers.find((l) => l.id === id && isMaster(l));
    if (layer) return { doc: d, layer };
  }
  return null;
}

export const findMaster = (doc: PixelDoc, id: string): Layer | undefined => masterOf(doc, id)?.layer;

/** The instances of a master, bottom to top, on `doc` only. */
export const instancesOf = (doc: PixelDoc, masterId: string): Layer[] =>
  doc.layers.filter((l) => l.instance?.of === masterId);

/**
 * A frame kept on whole pixels, at least 1×1 and no bigger than the canvas, overlapping it. It may
 * reach past an edge (a master moved partly off): it keeps its place, so the sprite does too, and
 * what's past the edge shows empty in the instances.
 */
export function clampFrame(doc: PixelDoc, r: Rect): ComponentFrame {
  const w = Math.max(1, Math.min(doc.width, Math.round(r.w)));
  const h = Math.max(1, Math.min(doc.height, Math.round(r.h)));
  const x = Math.max(1 - w, Math.min(doc.width - 1, Math.round(r.x)));
  const y = Math.max(1 - h, Math.min(doc.height - 1, Math.round(r.y)));
  return { x, y, w, h };
}

/**
 * Draws `master`'s sprite (on `from`, its document) into `target`'s pixels (on `doc`) at the
 * instance's position, clearing the rest. Returns whether any pixel changed.
 */
function render(
  from: PixelDoc,
  master: Layer,
  doc: PixelDoc,
  target: Layer,
  at: { x: number; y: number },
): boolean {
  const frame = master.component!;
  const { width: W, height: H } = doc;
  const MW = from.width;
  const MH = from.height;
  // Drawn in place when the size is right: this runs on every pointer move while dragging. The
  // copy kept to tell whether anything changed is cheap next to what it saves: the other boards
  // are only drawn again when their instances did.
  const before = target.pixels.length === W * H ? target.pixels.slice() : null;
  const out = before ? target.pixels.fill(0) : new Uint32Array(W * H);
  for (let sy = 0; sy < frame.h; sy++) {
    const ty = at.y + sy;
    if (ty < 0 || ty >= H) continue;
    for (let sx = 0; sx < frame.w; sx++) {
      const tx = at.x + sx;
      if (tx < 0 || tx >= W) continue;
      // A master dragged partly off the canvas: its frame follows it, what's outside is empty.
      const fx = frame.x + sx;
      const fy = frame.y + sy;
      if (fx < 0 || fy < 0 || fx >= MW || fy >= MH) continue;
      out[ty * W + tx] = master.pixels[fy * MW + fx];
    }
  }
  target.pixels = out;
  // An instance has nothing off the canvas of its own: its master keeps the sprite.
  delete target.outside;
  if (!before) return true;
  for (let i = 0; i < out.length; i++) if (out[i] !== before[i]) return true;
  return false;
}

/**
 * Renders every instance (or only those of `masterId`) from its master. Call after a master's
 * pixels or frame change, or an instance moves.
 */
export function syncInstances(doc: PixelDoc, masterId?: string): boolean {
  let changed = false;
  for (const layer of doc.layers) {
    const ref = layer.instance;
    if (!ref || (masterId && ref.of !== masterId)) continue;
    const master = masterOf(doc, ref.of);
    if (master && render(master.doc, master.layer, doc, layer, ref)) changed = true;
  }
  return changed;
}

/**
 * Renders the instances on every document of `doc`'s file (or only those of `masterId`). Returns
 * the documents whose instances changed, so their pictures can be drawn again.
 */
export function syncFileInstances(doc: PixelDoc, masterId?: string): PixelDoc[] {
  return fileDocs(doc).filter((d) => syncInstances(d, masterId));
}

/** Turns a layer into a master, its sprite being what's inside `frame`. Not for an instance. */
export function makeComponent(doc: PixelDoc, layerIndex: number, frame: Rect): boolean {
  const layer = doc.layers[layerIndex];
  if (!layer || isInstance(layer)) return false;
  // A new frame is what's on the canvas of `frame`.
  const x = Math.max(0, frame.x);
  const y = Math.max(0, frame.y);
  const w = Math.min(doc.width, frame.x + frame.w) - x;
  const h = Math.min(doc.height, frame.y + frame.h) - y;
  layer.component = clampFrame(doc, { x, y, w, h });
  syncInstances(doc, layer.id);
  return true;
}

/**
 * Adds an instance of a master as a new layer, just above the master unless `index` says where,
 * with the frame's top-left at (x, y). Returns the new layer's index, or -1.
 */
export function addInstance(doc: PixelDoc, masterId: string, x: number, y: number, index?: number): number {
  const found = masterOf(doc, masterId);
  if (!found) return -1;
  const master = found.layer;
  doc.layerCounter++;
  const layer = createLayer(master.name, doc.width, doc.height);
  layer.instance = { of: masterId, x: Math.round(x), y: Math.round(y) };
  // On the master's board: next to it, in its group. On another one: where `index` says, or on top.
  const here = found.doc === doc;
  if (here && master.group) layer.group = master.group;
  const at = index ?? (here ? doc.layers.indexOf(master) + 1 : doc.layers.length);
  doc.layers.splice(at, 0, layer);
  render(found.doc, master, doc, layer, layer.instance);
  return at;
}

/** Moves an instance's sprite to (x, y), in canvas pixels. */
export function moveInstance(doc: PixelDoc, layer: Layer, x: number, y: number): void {
  if (!layer.instance) return;
  layer.instance = { ...layer.instance, x: Math.round(x), y: Math.round(y) };
  syncInstances(doc, layer.instance.of);
}

/**
 * After a stroke on a master: its frame grows to take in what was just drawn outside it (pixels
 * that changed from `before` and aren't empty), like a component in Figma. Returns how far its
 * corner moved (and its instances with it), or null if it didn't grow.
 */
export function growFrame(
  doc: PixelDoc,
  master: Layer,
  before: Uint32Array,
): { dx: number; dy: number } | null {
  const f = master.component;
  if (!f) return null;
  const W = doc.width;
  let x0 = f.x;
  let y0 = f.y;
  let x1 = f.x + f.w - 1;
  let y1 = f.y + f.h - 1;
  const p = master.pixels;
  for (let i = 0; i < p.length; i++) {
    if (p[i] === before[i] || !(p[i] >>> 24)) continue;
    const x = i % W;
    const y = (i / W) | 0;
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
  }
  if (x0 === f.x && y0 === f.y && x1 === f.x + f.w - 1 && y1 === f.y + f.h - 1) return null;
  // The sprite keeps its place in its instances: they move by as much as the frame's corner.
  const dx = x0 - f.x;
  const dy = y0 - f.y;
  master.component = { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
  for (const d of fileDocs(doc))
    for (const layer of instancesOf(d, master.id))
      layer.instance = { ...layer.instance!, x: layer.instance!.x + dx, y: layer.instance!.y + dy };
  syncFileInstances(doc, master.id);
  return { dx, dy };
}

/** Moves a master's instances on the file's boards other than `doc` (see `Snapshot.shifted`). */
export function shiftInstances(doc: PixelDoc, master: string, dx: number, dy: number): void {
  for (const d of fileDocs(doc))
    if (d !== doc)
      for (const layer of instancesOf(d, master))
        layer.instance = { ...layer.instance!, x: layer.instance!.x + dx, y: layer.instance!.y + dy };
}

/** Turns an instance back into a plain layer, keeping its pixels as they are. */
export function detachInstance(layer: Layer): void {
  delete layer.instance;
}

/**
 * Keeps the model sound (after loading a file): a master can't also be an instance, an instance
 * whose master isn't in the file becomes a plain layer, frames stay in the canvas, and instances
 * are rendered from their masters. `docs` are the file's documents, all of them.
 */
export function normalizeComponents(docs: readonly PixelDoc[]): void {
  linkBoards(docs);
  for (const doc of docs)
    for (const layer of doc.layers) {
      if (layer.component && layer.instance) delete layer.instance;
      if (layer.component) layer.component = clampFrame(doc, layer.component);
    }
  for (const doc of docs)
    for (const layer of doc.layers)
      if (layer.instance && !masterOf(doc, layer.instance.of)) detachInstance(layer);
  for (const doc of docs) syncInstances(doc);
}
