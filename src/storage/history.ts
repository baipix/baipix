import type { BoardHistory } from '../engine/editor';
import type { Snapshot } from '../engine/history';

/**
 * The boards' undo histories as saved in the browser, next to the workspace. Steps are snapshots
 * of a whole board, but a step that changes one layer shares every other layer with the steps
 * around it: pixels are stored once in `pool`, each step's layers pointing at them by index (and
 * the reference image's data once in `texts`). So a long history costs about the layers it
 * changed, not a copy of the drawing per step.
 */
export interface StoredHistory {
  version: 1;
  pool: Uint32Array[];
  texts: string[];
  boards: { id: string; undo: unknown[]; redo: unknown[] }[];
}

/** Steps kept per board and side (undo, redo), and the most pixels kept in all. */
export const HISTORY_STEPS = 50;
const MAX_BYTES = 48_000_000;

/** FNV-1a over the values: the key that finds equal pixel arrays. */
function hash(px: Uint32Array): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < px.length; i++) {
    h ^= px[i];
    h = Math.imul(h, 0x01000193);
  }
  return (h ^ px.length) >>> 0;
}

const same = (a: Uint32Array, b: Uint32Array) => a.length === b.length && a.every((v, i) => v === b[i]);

/** Packs the histories, the most recent `steps` per board and side, within the size budget. */
export function packHistories(histories: BoardHistory[], steps = HISTORY_STEPS): StoredHistory {
  const pool: Uint32Array[] = [];
  const byHash = new Map<number, number[]>();
  const texts: string[] = [];
  const textIndex = new Map<string, number>();
  let bytes = 0;
  const pixelRef = (px: Uint32Array): number => {
    const h = hash(px);
    const candidates = byHash.get(h) ?? [];
    const found = candidates.find((k) => same(pool[k], px));
    if (found !== undefined) return found;
    pool.push(px);
    bytes += px.byteLength;
    byHash.set(h, [...candidates, pool.length - 1]);
    return pool.length - 1;
  };
  const textRef = (t: string): number => {
    let k = textIndex.get(t);
    if (k === undefined) textIndex.set(t, (k = texts.push(t) - 1));
    return k;
  };
  const pack = (s: Snapshot) => ({
    ...s,
    doc: {
      ...s.doc,
      layers: s.doc.layers.map((l) => ({
        ...l,
        pixels: pixelRef(l.pixels),
        ...(l.outside && { outside: { ...l.outside, pixels: pixelRef(l.outside.pixels) } }),
      })),
      ...(s.doc.reference && { reference: { ...s.doc.reference, src: textRef(s.doc.reference.src) } }),
    },
  });
  const boards = histories.map((h) => ({
    id: h.id,
    undo: h.undo.slice(-steps).map(pack),
    redo: h.redo.slice(-steps).map(pack),
  }));
  // Too big: fewer steps, until it fits (the most recent ones are kept).
  if (bytes > MAX_BYTES && steps > 4) return packHistories(histories, Math.floor(steps / 2));
  return { version: 1, pool, texts, boards };
}

/** The histories back from what `packHistories` stored; anything that doesn't read is left out. */
export function unpackHistories(stored: StoredHistory | null | undefined): BoardHistory[] {
  if (!stored || stored.version !== 1 || !Array.isArray(stored.pool) || !Array.isArray(stored.boards))
    return [];
  const pixels = (k: unknown): Uint32Array | null =>
    typeof k === 'number' && stored.pool[k] instanceof Uint32Array ? stored.pool[k].slice() : null;
  const unpack = (raw: unknown): Snapshot | null => {
    const s = raw as Snapshot & { doc: { layers: { pixels: unknown; outside?: { pixels: unknown } }[] } };
    if (!s?.doc || !Array.isArray(s.doc.layers)) return null;
    const layers = [];
    for (const l of s.doc.layers) {
      const px = pixels(l.pixels);
      if (!px) return null;
      const outside = l.outside ? pixels(l.outside.pixels) : null;
      layers.push({
        ...l,
        pixels: px,
        ...(l.outside && outside && { outside: { ...l.outside, pixels: outside } }),
      });
    }
    const ref = s.doc.reference as unknown as { src: unknown } | undefined;
    const src = ref && typeof ref.src === 'number' ? stored.texts?.[ref.src] : undefined;
    return {
      ...s,
      doc: {
        ...s.doc,
        layers,
        ...(ref && src ? { reference: { ...s.doc.reference!, src } } : { reference: undefined }),
      },
    } as Snapshot;
  };
  const steps = (list: unknown) => (Array.isArray(list) ? list.map(unpack) : []);
  return stored.boards
    .filter((b) => b && typeof b.id === 'string')
    .map((b) => {
      // A step that doesn't read cuts the history there: the ones before it can't be reached.
      const undo = steps(b.undo);
      const redo = steps(b.redo);
      const cut = (xs: (Snapshot | null)[]) => xs.slice(xs.lastIndexOf(null) + 1) as Snapshot[];
      return { id: b.id, undo: cut(undo), redo: cut(redo) };
    });
}
