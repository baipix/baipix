import { createLayer, type Layer, type PixelDoc } from './document';
import type { Rect } from './math';

/**
 * Components, like in Figma: a master sprite drawn once on the canvas, and instances that show it
 * elsewhere. A master is a layer with a `component` frame: the sprite is its pixels inside that
 * frame. An instance is a layer with an `instance` reference: its pixels are the master's sprite,
 * placed with the frame's top-left at (x, y). Instance pixels are kept rendered (see
 * `syncInstances`), so drawing, compositing and exports treat them as ordinary pixels.
 */

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

/** The masters of a document, bottom to top. */
export const masters = (doc: PixelDoc): Layer[] => doc.layers.filter(isMaster);

export const findMaster = (doc: PixelDoc, id: string): Layer | undefined =>
  doc.layers.find((l) => l.id === id && isMaster(l));

/** The instances of a master, bottom to top. */
export const instancesOf = (doc: PixelDoc, masterId: string): Layer[] =>
  doc.layers.filter((l) => l.instance?.of === masterId);

/** A frame kept on whole pixels, at least 1×1, and within the canvas. */
export function clampFrame(doc: PixelDoc, r: Rect): ComponentFrame {
  const x = Math.max(0, Math.min(doc.width - 1, Math.round(r.x)));
  const y = Math.max(0, Math.min(doc.height - 1, Math.round(r.y)));
  const w = Math.max(1, Math.min(doc.width - x, Math.round(r.w)));
  const h = Math.max(1, Math.min(doc.height - y, Math.round(r.h)));
  return { x, y, w, h };
}

/** Draws `master`'s sprite into `target`'s pixels at the instance's position, clearing the rest. */
function render(doc: PixelDoc, master: Layer, target: Layer, at: { x: number; y: number }): void {
  const frame = master.component!;
  const { width: W, height: H } = doc;
  const out = new Uint32Array(W * H);
  for (let sy = 0; sy < frame.h; sy++) {
    const ty = at.y + sy;
    if (ty < 0 || ty >= H) continue;
    for (let sx = 0; sx < frame.w; sx++) {
      const tx = at.x + sx;
      if (tx < 0 || tx >= W) continue;
      out[ty * W + tx] = master.pixels[(frame.y + sy) * W + frame.x + sx];
    }
  }
  target.pixels = out;
  // An instance has nothing off the canvas of its own: its master keeps the sprite.
  delete target.outside;
}

/**
 * Renders every instance (or only those of `masterId`) from its master. Call after a master's
 * pixels or frame change, or an instance moves.
 */
export function syncInstances(doc: PixelDoc, masterId?: string): void {
  for (const layer of doc.layers) {
    const ref = layer.instance;
    if (!ref || (masterId && ref.of !== masterId)) continue;
    const master = findMaster(doc, ref.of);
    if (master) render(doc, master, layer, ref);
  }
}

/** Turns a layer into a master, its sprite being what's inside `frame`. Not for an instance. */
export function makeComponent(doc: PixelDoc, layerIndex: number, frame: Rect): boolean {
  const layer = doc.layers[layerIndex];
  if (!layer || isInstance(layer)) return false;
  layer.component = clampFrame(doc, frame);
  syncInstances(doc, layer.id);
  return true;
}

/**
 * Adds an instance of a master as a new layer, just above the master unless `index` says where,
 * with the frame's top-left at (x, y). Returns the new layer's index, or -1.
 */
export function addInstance(doc: PixelDoc, masterId: string, x: number, y: number, index?: number): number {
  const master = findMaster(doc, masterId);
  if (!master) return -1;
  doc.layerCounter++;
  const layer = createLayer(master.name, doc.width, doc.height);
  layer.instance = { of: masterId, x: Math.round(x), y: Math.round(y) };
  if (master.group) layer.group = master.group;
  const at = index ?? doc.layers.indexOf(master) + 1;
  doc.layers.splice(at, 0, layer);
  render(doc, master, layer, layer.instance);
  return at;
}

/** Moves an instance's sprite to (x, y), in canvas pixels. */
export function moveInstance(doc: PixelDoc, layer: Layer, x: number, y: number): void {
  if (!layer.instance) return;
  layer.instance = { ...layer.instance, x: Math.round(x), y: Math.round(y) };
  syncInstances(doc, layer.instance.of);
}

/** Turns an instance back into a plain layer, keeping its pixels as they are. */
export function detachInstance(layer: Layer): void {
  delete layer.instance;
}

/**
 * Keeps the model sound (after loading a file, or deleting layers): a master can't also be an
 * instance, an instance whose master is gone becomes a plain layer, frames stay in the canvas,
 * and instances are rendered from their masters.
 */
export function normalizeComponents(doc: PixelDoc): void {
  for (const layer of doc.layers) {
    if (layer.component && layer.instance) delete layer.instance;
    if (layer.component) layer.component = clampFrame(doc, layer.component);
  }
  for (const layer of doc.layers)
    if (layer.instance && !findMaster(doc, layer.instance.of)) detachInstance(layer);
  syncInstances(doc);
}
