import { normalizeComponents } from '../engine/components';
import type { PixelDoc, ReferenceImage } from '../engine/document';
import type { Preferences } from '../engine/editor';
import type { Outside } from '../engine/outside';
import type { StoredHistory } from './history';
import {
  decodePixels,
  deserializeDocument,
  encodePixels,
  serializeDocument,
  type BaipixFile,
} from './fileFormat';

/** Everything that is persisted between sessions. */
export interface Workspace {
  documents: PixelDoc[];
  activeId: string;
  preferences: Partial<Preferences>;
  /** UI-only settings (panel widths, language…), opaque to the engine. */
  ui: Record<string, unknown>;
}

/** A layer's part outside the canvas, run-length encoded like .baipix layers. */
interface StoredOutside {
  x: number;
  y: number;
  w: number;
  h: number;
  colors: number[];
  runs: number[];
}

/**
 * A file in the browser's workspace: the .baipix content, plus what isn't in .baipix files (the
 * reference image, and each layer's pixels outside the canvas, by layer index).
 */
export type StoredFile = BaipixFile & { reference?: ReferenceImage; outside?: (StoredOutside | null)[] };

export interface StoredWorkspace {
  version: 1;
  files: StoredFile[];
  activeId: string;
  preferences: Partial<Preferences>;
  ui: Record<string, unknown>;
}

/**
 * Where workspaces are kept. The app only talks to this interface, so a cloud backend
 * (Supabase, Google Drive…) can be plugged in later without touching the editor.
 */
export interface StorageAdapter {
  load(): Promise<Workspace | null>;
  save(workspace: Workspace): Promise<void>;
  /** The boards' undo histories, kept apart from the workspace (they're bigger and change less). */
  loadHistory?(): Promise<StoredHistory | null>;
  saveHistory?(history: StoredHistory): Promise<void>;
}

export const toStored = (w: Workspace): StoredWorkspace => ({
  version: 1,
  files: w.documents.map((d) => ({
    ...serializeDocument(d),
    ...(d.reference && { reference: d.reference }),
    ...(d.layers.some((l) => l.outside) && {
      outside: d.layers.map((l) => (l.outside ? storeOutside(l.outside) : null)),
    }),
  })),
  activeId: w.activeId,
  preferences: w.preferences,
  ui: w.ui,
});

export function fromStored(s: StoredWorkspace): Workspace | null {
  const documents: PixelDoc[] = [];
  for (const f of s.files ?? []) {
    try {
      const doc = deserializeDocument(f, true);
      const reference = readReference(f.reference);
      if (reference) doc.reference = reference;
      f.outside?.forEach((o, i) => {
        const outside = readOutside(o);
        if (outside && doc.layers[i]) doc.layers[i].outside = outside;
      });
      documents.push(doc);
    } catch {
      /* skip unreadable files rather than losing the whole workspace */
    }
  }
  if (!documents.length) return null;
  // Each file's components once all its boards are read: masters can be on another board.
  const files = new Map<string, PixelDoc[]>();
  for (const doc of documents) {
    const file = doc.board?.file ?? doc.id;
    files.set(file, [...(files.get(file) ?? []), doc]);
  }
  for (const docs of files.values()) normalizeComponents(docs);
  return { documents, activeId: s.activeId, preferences: s.preferences ?? {}, ui: s.ui ?? {} };
}

/** Checks a stored reference image, dropping it when anything is off. */
function readReference(r: unknown): ReferenceImage | undefined {
  const x = r as Partial<ReferenceImage> | null | undefined;
  if (!x || typeof x.src !== 'string' || !x.src.startsWith('data:image/')) return undefined;
  const nums = [x.width, x.height, x.x, x.y, x.w, x.h, x.opacity];
  if (!nums.every((n) => typeof n === 'number' && Number.isFinite(n))) return undefined;
  if (!(x.w! > 0 && x.h! > 0)) return undefined;
  return {
    src: x.src,
    width: x.width!,
    height: x.height!,
    x: x.x!,
    y: x.y!,
    w: x.w!,
    h: x.h!,
    opacity: Math.min(1, Math.max(0, x.opacity!)),
    visible: x.visible !== false,
    locked: x.locked === true,
  };
}

const storeOutside = (o: Outside): StoredOutside => ({
  x: o.x,
  y: o.y,
  w: o.w,
  h: o.h,
  ...encodePixels(o.pixels),
});

function readOutside(o: StoredOutside | null | undefined): Outside | undefined {
  if (!o || ![o.x, o.y, o.w, o.h].every(Number.isInteger) || o.w < 1 || o.h < 1) return undefined;
  if (!Array.isArray(o.colors) || !Array.isArray(o.runs)) return undefined;
  return { x: o.x, y: o.y, w: o.w, h: o.h, pixels: decodePixels(o.colors, o.runs, o.w * o.h) };
}
