import { newId, type Layer, type PixelDoc } from './document';
import { bakeEffects } from './effects';
import type { Outside } from './outside';

/**
 * Animation frames. A board's layers are the same on every frame (name, visibility, effects, blend
 * mode…): only their pixels change from one frame to the next, like Aseprite's cels. The active
 * frame's pixels are the layers' own `pixels`, so drawing, exporting and everything else work on it
 * as on a board without frames; the other frames' pixels wait in each layer's `cels`.
 *
 * A board without `frames` is a single frame, as every board was before.
 */
export interface Frame {
  id: string;
  /** How long it shows when playing, in ms. */
  duration: number;
}

/** What a layer holds on a frame other than the active one. Never changed in place. */
export interface Cel {
  pixels: Uint32Array;
  outside?: Outside;
}

export const DEFAULT_DURATION = 100;
export const DURATION = { min: 10, max: 10_000 };
export const MAX_FRAMES = 999;

export const frameCount = (doc: PixelDoc): number => doc.frames?.length ?? 1;

export const activeFrame = (doc: PixelDoc): number => doc.activeFrame ?? 0;

export const createFrame = (duration = DEFAULT_DURATION): Frame => ({ id: newId('frame'), duration });

export const clampDuration = (ms: number): number =>
  Math.min(DURATION.max, Math.max(DURATION.min, Math.round(ms) || DEFAULT_DURATION));

/** A layer's pixels on frame `f`: its own on the active frame. */
export function celOf(doc: PixelDoc, layer: Layer, f: number): Cel {
  if (f === activeFrame(doc))
    return { pixels: layer.pixels, ...(layer.outside && { outside: layer.outside }) };
  return layer.cels?.[f] ?? { pixels: new Uint32Array(doc.width * doc.height) };
}

/**
 * Makes every layer hold one cel per frame: a layer that has none, or not as many (a new layer, one
 * moved or pasted from another board), shows its pixels on the frames it misses. Drops `frames`
 * when there is only one left.
 */
export function normalizeFrames(doc: PixelDoc): void {
  const n = frameCount(doc);
  if (n < 2) {
    delete doc.frames;
    delete doc.activeFrame;
    for (const layer of doc.layers) delete layer.cels;
    return;
  }
  const active = Math.min(n - 1, Math.max(0, activeFrame(doc)));
  doc.activeFrame = active;
  for (const layer of doc.layers) {
    const size = layer.pixels.length;
    // Cels of another size come from a board of another size: they're dropped.
    const cels = (layer.cels ?? []).map((c) => (c && c.pixels.length !== size ? undefined : c));
    if (cels.length === n && cels[active] === null && cels.every((c, f) => c || f === active)) continue;
    // Its pixels are its frame's where its cels have a gap (a layer from another board), or every
    // frame's when it has none.
    const own: Cel = { pixels: layer.pixels, ...(layer.outside && { outside: layer.outside }) };
    const gap = cels.includes(null) ? cels.indexOf(null) : cels[active] ? -1 : active;
    const at = (f: number): Cel =>
      f === gap
        ? own
        : (cels[f] ?? { pixels: own.pixels.slice(), ...(own.outside && { outside: own.outside }) });
    const shown = at(active);
    layer.cels = Array.from({ length: n }, (_, f) => (f === active ? null : at(f)));
    if (shown !== own) {
      layer.pixels = shown.pixels.slice();
      if (shown.outside) layer.outside = shown.outside;
      else delete layer.outside;
    }
  }
}

/**
 * Shows frame `f`: each layer puts its pixels away in its cels and takes the frame's. The frame's
 * pixels are copied in, so what's drawn on them never changes a cel shared with the undo history.
 */
export function showFrame(doc: PixelDoc, f: number): void {
  const from = activeFrame(doc);
  if (!doc.frames || f === from || f < 0 || f >= doc.frames.length) return;
  for (const layer of doc.layers) {
    const cels = layer.cels!;
    const cel = cels[f] ?? { pixels: new Uint32Array(doc.width * doc.height) };
    cels[from] = { pixels: layer.pixels, ...(layer.outside && { outside: layer.outside }) };
    cels[f] = null;
    layer.pixels = cel.pixels.slice();
    if (cel.outside) layer.outside = cel.outside;
    else delete layer.outside;
  }
  doc.activeFrame = f;
}

/** Runs `fn` on every frame in turn, the board showing it, then comes back to the active frame. */
export function eachFrame(doc: PixelDoc, fn: (f: number) => void): void {
  const active = activeFrame(doc);
  for (let f = 0; f < frameCount(doc); f++) {
    showFrame(doc, f);
    fn(f);
  }
  showFrame(doc, active);
}

/** What `fn` gives on every frame, in order. */
export function onEachFrame<T>(doc: PixelDoc, fn: (f: number) => T): T[] {
  const out: T[] = [];
  eachFrame(doc, (f) => out.push(fn(f)));
  return out;
}

/** Gives a new layer its pixels on every frame: `pixels[f]` on frame `f`. */
export function setCels(doc: PixelDoc, layer: Layer, pixels: Uint32Array[]): void {
  const active = activeFrame(doc);
  layer.pixels = pixels[active];
  delete layer.outside;
  if (doc.frames) layer.cels = pixels.map((p, f) => (f === active ? null : { pixels: p }));
}

/** Writes a layer's effects into its pixels on every frame, and drops them. */
export function bakeEffectsOnEveryFrame(doc: PixelDoc, layer: Layer): void {
  const effects = layer.effects;
  if (!effects) return;
  eachFrame(doc, () => {
    layer.effects = effects;
    bakeEffects(layer, doc.width, doc.height);
  });
}

/** Adds a frame after `at`, a copy of it, and shows it. */
export function addFrame(doc: PixelDoc, at = activeFrame(doc)): void {
  const n = frameCount(doc);
  if (n >= MAX_FRAMES) return;
  at = Math.min(n - 1, Math.max(0, at));
  normalizeFrames(doc);
  const duration = doc.frames?.[at].duration ?? DEFAULT_DURATION;
  const copies = doc.layers.map((layer): Cel => {
    const { pixels, outside } = celOf(doc, layer, at);
    return { pixels: pixels.slice(), ...(outside && { outside }) };
  });
  if (!doc.frames) {
    doc.frames = [createFrame()];
    doc.activeFrame = 0;
    for (const layer of doc.layers) layer.cels = [null];
  }
  doc.layers.forEach((layer, i) => layer.cels!.splice(at + 1, 0, copies[i]));
  doc.frames.splice(at + 1, 0, createFrame(duration));
  if (activeFrame(doc) > at) doc.activeFrame = activeFrame(doc) + 1;
  showFrame(doc, at + 1);
}

/** Deletes frame `f`; the last one can't be. Shows the frame that takes its place. */
export function deleteFrame(doc: PixelDoc, f: number): boolean {
  if (!doc.frames || doc.frames.length < 2 || f < 0 || f >= doc.frames.length) return false;
  // Away from the frame first, so its pixels are a cel like the others.
  showFrame(doc, f === 0 ? 1 : f - 1);
  for (const layer of doc.layers) layer.cels!.splice(f, 1);
  doc.frames.splice(f, 1);
  if (activeFrame(doc) > f) doc.activeFrame = activeFrame(doc) - 1;
  const next = Math.min(f, doc.frames.length - 1);
  normalizeFrames(doc);
  showFrame(doc, next);
  return true;
}

/** Moves frame `from` to index `to`, keeping the shown frame shown. */
export function moveFrame(doc: PixelDoc, from: number, to: number): boolean {
  const n = frameCount(doc);
  if (!doc.frames || from === to || from < 0 || from >= n || to < 0 || to >= n) return false;
  const shown = doc.frames[activeFrame(doc)];
  const move = <T>(list: T[]) => list.splice(to, 0, list.splice(from, 1)[0]);
  move(doc.frames);
  for (const layer of doc.layers) move(layer.cels!);
  doc.activeFrame = doc.frames.indexOf(shown);
  return true;
}

/** Sets frames' durations (all of them when `frames` is missing). A single frame has none. */
export function setDuration(doc: PixelDoc, ms: number, frames?: number[]): void {
  const d = clampDuration(ms);
  doc.frames?.forEach((frame, f) => {
    if (!frames || frames.includes(f)) frame.duration = d;
  });
}

/** Copies a board's frames and cels for a copy of it: cels are never changed in place, so shared. */
export const cloneCels = (cels: Layer['cels']): Layer['cels'] => cels && cels.slice();

export interface OnionSkin {
  /** Frames shown before and after the active one. */
  before: number;
  after: number;
  /** Opacity of the nearest ones, 0 to 1; the farther ones fade. */
  opacity: number;
}

export const ONION = { max: 5 };

/**
 * The frames the onion skin shows around the active one, the nearest last so they lie on top, each
 * with its opacity: the nearest at `opacity`, each step farther fading by an equal share. It doesn't
 * loop around: the first frame has nothing before it.
 */
export function onionFrames(
  doc: PixelDoc,
  { before, after, opacity }: OnionSkin,
): { frame: number; side: 'before' | 'after'; opacity: number }[] {
  const n = frameCount(doc);
  const at = activeFrame(doc);
  const out: { frame: number; side: 'before' | 'after'; opacity: number }[] = [];
  for (const [side, count, dir] of [
    ['before', before, -1],
    ['after', after, 1],
  ] as const)
    for (let d = count; d >= 1; d--) {
      const frame = at + d * dir;
      if (frame >= 0 && frame < n) out.push({ frame, side, opacity: (opacity * (count - d + 1)) / count });
    }
  return out;
}

/** Whether a layer has the same pixels on every frame: scenery that doesn't move. */
export function isStill(doc: PixelDoc, layer: Layer): boolean {
  const shown = layer.pixels;
  for (let f = 0; f < frameCount(doc); f++) {
    const { pixels } = celOf(doc, layer, f);
    if (pixels === shown) continue;
    if (pixels.length !== shown.length) return false;
    for (let i = 0; i < shown.length; i++) if (pixels[i] !== shown[i]) return false;
  }
  return true;
}

/**
 * How many layers at the bottom of the stack, outside any group, are the same on every frame: a sky,
 * a room, the ground. The onion skin goes over them, as over the board's background color, or an
 * opaque one would hide it.
 */
export function stillUnder(doc: PixelDoc): number {
  let k = 0;
  while (k < doc.layers.length && !doc.layers[k].group && isStill(doc, doc.layers[k])) k++;
  return k;
}
