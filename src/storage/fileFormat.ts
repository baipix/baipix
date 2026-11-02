import type { Color } from '../engine/color';
import { readLight, type BoardLight } from '../engine/light';
import { BLEND_MODES, type BlendMode } from '../engine/composite';
import {
  isoCellSize,
  MAX_SIZE,
  newId,
  type BoardPlace,
  type DocPalette,
  type Layer,
  type LayerGroup,
  type PixelDoc,
} from '../engine/document';
import { opaque } from '../engine/color';
import { PALETTE_PRESETS, presetColors } from '../engine/palette';
import { normalizeComponents } from '../engine/components';
import { cleanEffects, type LayerEffect } from '../engine/effects';
import { normalizeGroups } from '../engine/groups';
import { clamp } from '../engine/math';
import { clampDuration, createFrame, MAX_FRAMES, normalizeFrames, type Cel } from '../engine/frames';

/**
 * `.baipix` files are plain JSON. Each layer is stored as an indexed palette plus run-length
 * encoded indices: small, diff-friendly and readable without any image decoder.
 */
export const FILE_FORMAT = 'baipix';
export const FILE_VERSION = 1;
export const FILE_EXTENSION = '.baipix';

export interface BaipixLayer {
  /** The layer's id, so components can point at it from another board (missing in older files). */
  id?: string;
  name: string;
  visible: boolean;
  /** Missing in older files: unlocked. */
  locked?: boolean;
  opacity: number;
  /** Missing in older files, and for normal: normal. A CSS mix-blend-mode name. */
  blendMode?: string;
  /** The group it's in, as an index in `groups` (missing: the top level). */
  group?: number;
  /** A component's master: the frame of its sprite, in canvas pixels. */
  component?: { x: number; y: number; w: number; h: number };
  /**
   * An instance: its master as an index in `layers` (-1 when it's on another board of the file),
   * the master's id (`master`, missing in older files), and where the sprite lands. Its pixels are
   * saved too, so a version without components, or without components across boards, still shows them.
   */
  instance?: { of: number; master?: string; x: number; y: number };
  /** Layer effects (missing: none), colors as unsigned 32-bit integers. */
  effects?: LayerEffect[];
  /** Distinct colors as unsigned 32-bit integers (0xAABBGGRR). */
  colors: number[];
  /** Flat list of [colorIndex, runLength] pairs, row-major. */
  runs: number[];
  /**
   * Its pixels on each animation frame, encoded the same way; null on the active frame, whose
   * pixels are `colors` and `runs` (so a version without frames still shows that one).
   */
  cels?: ({ colors: number[]; runs: number[] } | null)[];
}

export interface BaipixFile {
  format: typeof FILE_FORMAT;
  version: number;
  id?: string;
  name: string;
  width: number;
  height: number;
  activeLayer: number;
  layerCounter: number;
  background: number;
  backgroundVisible: boolean;
  render: { pixelSize: number; gap: number };
  /** Moved symmetry axes, in pixels (missing: the center). */
  axisX?: number;
  axisY?: number;
  /** Guides dragged out of the rulers, on pixel edges (missing: none). */
  guides?: { x: number[]; y: number[] };
  /** The isometric grid's cell width, while it's on (missing: off). */
  isoGrid?: number;
  /** Upright lines in the isometric grid (missing: none). */
  isoGridVertical?: boolean;
  /** The board's light, a shading guide (missing: none). */
  light?: BoardLight;
  /** A board of a file with several: its file and its place in it (missing: a file of its own). */
  board?: BoardPlace;
  /** Animation frames, with how long each shows in ms (missing: a single frame). */
  frames?: { duration: number }[];
  /** The frame shown, an index in `frames`. */
  activeFrame?: number;
  /** Last change, in ms since the epoch. */
  updatedAt?: number;
  layers: BaipixLayer[];
  /**
   * The file's palette: a preset's key with its colors, 'custom' with the file's own colors, or
   * 'drawing' (the colors the drawing uses, no list). Missing in older files: 'drawing'.
   */
  palette?: { key: string; colors?: number[]; custom?: number[] };
  /** Groups of layers (missing: none). A group in another one points at it by index. */
  groups?: BaipixGroup[];
}

export interface BaipixGroup {
  name: string;
  visible: boolean;
  locked: boolean;
  opacity: number;
  /** Missing: pass-through. */
  blendMode?: string;
  collapsed?: boolean;
  parent?: number;
}

export function encodePixels(pixels: Uint32Array): { colors: number[]; runs: number[] } {
  const colors: number[] = [];
  const index = new Map<Color, number>();
  const runs: number[] = [];
  let i = 0;
  while (i < pixels.length) {
    const c = pixels[i];
    let n = 1;
    while (i + n < pixels.length && pixels[i + n] === c) n++;
    let k = index.get(c);
    if (k === undefined) {
      k = colors.length;
      index.set(c, k);
      colors.push(c);
    }
    runs.push(k, n);
    i += n;
  }
  return { colors, runs };
}

export function decodePixels(colors: number[], runs: number[], length: number): Uint32Array {
  const out = new Uint32Array(length);
  let p = 0;
  for (let i = 0; i + 1 < runs.length && p < length; i += 2) {
    const c = (colors[runs[i]] ?? 0) >>> 0;
    const n = Math.min(runs[i + 1], length - p);
    out.fill(c, p, p + n);
    p += n;
  }
  return out;
}

export function serializeDocument(doc: PixelDoc): BaipixFile {
  const groups = doc.groups ?? [];
  const groupIndex = new Map(groups.map((g, k) => [g.id, k]));
  const layerIndex = new Map(doc.layers.map((l, k) => [l.id, k]));
  return {
    format: FILE_FORMAT,
    version: FILE_VERSION,
    id: doc.id,
    name: doc.name,
    width: doc.width,
    height: doc.height,
    activeLayer: doc.activeLayer,
    layerCounter: doc.layerCounter,
    background: doc.background >>> 0,
    backgroundVisible: doc.backgroundVisible,
    render: { ...doc.render },
    ...(doc.axisX !== undefined && { axisX: doc.axisX }),
    ...(doc.axisY !== undefined && { axisY: doc.axisY }),
    ...(doc.guides && { guides: { x: [...doc.guides.x], y: [...doc.guides.y] } }),
    ...(doc.isoGrid && { isoGrid: doc.isoGrid }),
    ...(doc.isoGridVertical && { isoGridVertical: true }),
    ...(doc.light && { light: { ...doc.light } }),
    ...(doc.board && { board: { ...doc.board } }),
    ...(doc.frames && {
      frames: doc.frames.map((f) => ({ duration: f.duration })),
      activeFrame: doc.activeFrame ?? 0,
    }),
    ...(doc.updatedAt !== undefined && { updatedAt: doc.updatedAt }),
    ...(doc.palette && {
      palette: {
        key: doc.palette.key,
        ...(doc.palette.key !== 'drawing' && { colors: doc.palette.colors.map((c) => c >>> 0) }),
        ...(doc.palette.custom && { custom: doc.palette.custom.map((c) => c >>> 0) }),
      },
    }),
    layers: doc.layers.map((l) => ({
      id: l.id,
      name: l.name,
      visible: l.visible,
      locked: l.locked,
      opacity: l.opacity,
      ...(l.blendMode && l.blendMode !== 'normal' && { blendMode: l.blendMode }),
      ...(l.group && groupIndex.has(l.group) && { group: groupIndex.get(l.group) }),
      ...(l.component && { component: { ...l.component } }),
      ...(l.instance && {
        instance: {
          of: layerIndex.get(l.instance.of) ?? -1,
          master: l.instance.of,
          x: l.instance.x,
          y: l.instance.y,
        },
      }),
      ...(l.effects?.length && { effects: l.effects.map((e) => ({ ...e, color: e.color >>> 0 })) }),
      ...encodePixels(l.pixels),
      ...(l.cels && { cels: l.cels.map((c) => c && encodePixels(c.pixels)) }),
    })),
    ...(groups.length && {
      groups: groups.map((g) => ({
        name: g.name,
        visible: g.visible,
        locked: g.locked,
        opacity: g.opacity,
        ...(g.blendMode && { blendMode: g.blendMode }),
        ...(g.collapsed && { collapsed: true }),
        ...(g.parent && groupIndex.has(g.parent) && { parent: groupIndex.get(g.parent) }),
      })),
    }),
  };
}

/** Groups from a file, with ids, then checked like any change (depth, contiguous layers…). */
function readGroups(raw: unknown, layers: Layer[], refs: unknown[]): LayerGroup[] | undefined {
  if (!Array.isArray(raw) || !raw.length) return undefined;
  const list = raw.slice(0, 256) as Partial<BaipixGroup>[];
  const ids = list.map(() => newId('group'));
  const at = (n: unknown) =>
    typeof n === 'number' && Number.isInteger(n) && n >= 0 && n < ids.length ? ids[n] : undefined;
  const groups = list.map((g, i) => ({
    id: ids[i],
    name: typeof g.name === 'string' && g.name ? g.name.slice(0, 120) : `Group ${i + 1}`,
    visible: g.visible !== false,
    locked: g.locked === true,
    opacity: typeof g.opacity === 'number' ? clamp(g.opacity, 0, 1) : 1,
    ...(BLEND_MODES.includes(g.blendMode as BlendMode) && { blendMode: g.blendMode as BlendMode }),
    ...(g.collapsed === true && { collapsed: true }),
    ...(at(g.parent) && at(g.parent) !== ids[i] && { parent: at(g.parent) }),
  }));
  layers.forEach((l, i) => {
    const id = at(refs[i]);
    if (id) l.group = id;
  });
  return groups;
}

/**
 * Components from a file: masters' frames, and instances pointing at their master, by its id
 * (`master`, which may be on another board) or, in older files, by its index in the same board.
 * An instance whose master isn't found stays one for now: the file's other boards are read after.
 */
function readComponents(layers: Layer[], raw: Partial<BaipixLayer>[]): void {
  const whole = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);
  raw.forEach((l, i) => {
    const c = l.component;
    if (c && whole(c.x) && whole(c.y) && whole(c.w) && whole(c.h))
      layers[i].component = { x: c.x, y: c.y, w: c.w, h: c.h };
    const ref = l.instance;
    if (!ref || !whole(ref.x) || !whole(ref.y)) return;
    const at = { x: Math.round(ref.x), y: Math.round(ref.y) };
    if (typeof ref.master === 'string' && ref.master && ref.master !== layers[i].id)
      layers[i].instance = { of: ref.master, ...at };
    else if (whole(ref.of) && layers[ref.of] && ref.of !== i)
      layers[i].instance = { of: layers[ref.of].id, ...at };
  });
}

/** A palette from a file: a known key, colors as numbers (256 at most). Null: the drawing's colors. */
function readPalette(raw: unknown): { palette: DocPalette } | null {
  const p = raw as { key?: unknown; colors?: unknown; custom?: unknown } | null;
  if (!p || typeof p !== 'object' || typeof p.key !== 'string') return null;
  const list = (a: unknown) =>
    Array.isArray(a)
      ? [...new Set(a.filter((c): c is number => typeof c === 'number').map(opaque))].slice(0, 256)
      : null;
  const custom = list(p.custom);
  const extra = custom?.length ? { custom } : {};
  if (p.key === 'drawing') return { palette: { key: 'drawing', colors: [], ...extra } };
  // 'custom', or one of the user's palettes copied in ('mine:' and its id): the file's own colors.
  if (p.key === 'custom' || p.key.startsWith('mine:')) {
    const colors = list(p.colors) ?? [];
    return { palette: { key: p.key.slice(0, 60), colors, ...extra } };
  }
  if (!(p.key in PALETTE_PRESETS)) return null;
  return { palette: { key: p.key, colors: list(p.colors) ?? presetColors(p.key), ...extra } };
}

export class FileFormatError extends Error {}

/** Guides from a file: whole numbers, kept within a canvas on each side of the drawing. */
function readGuides(
  g: unknown,
  width: number,
  height: number,
): { guides: { x: number[]; y: number[] } } | null {
  const v = g as { x?: unknown; y?: unknown } | null;
  if (!v || typeof v !== 'object') return null;
  const list = (a: unknown, size: number) =>
    (Array.isArray(a) ? a : [])
      .filter((n): n is number => typeof n === 'number' && Number.isFinite(n))
      .map((n) => clamp(Math.round(n), -size, size * 2))
      .slice(0, 200);
  const guides = { x: list(v.x, width), y: list(v.y, height) };
  return guides.x.length || guides.y.length ? { guides } : null;
}

/**
 * Validates and converts a parsed `.baipix` object into a document. Throws FileFormatError.
 * `inFile`: one board of a file being read, whose components are checked once all its boards are
 * (see `normalizeComponents`); otherwise the document is a file of its own and is checked now.
 */
export function deserializeDocument(data: unknown, inFile = false): PixelDoc {
  const f = data as Partial<BaipixFile> | null;
  if (!f || f.format !== FILE_FORMAT) throw new FileFormatError('Not a .baipix file');
  if (typeof f.version !== 'number' || f.version > FILE_VERSION)
    throw new FileFormatError('Unsupported version');
  const width = clamp(Math.round(Number(f.width)) || 0, 1, MAX_SIZE);
  const height = clamp(Math.round(Number(f.height)) || 0, 1, MAX_SIZE);
  // A layer keeps its id from the file when it has a sound one, not used twice.
  const ids = new Set<string>();
  const idOf = (raw: unknown): string => {
    const id = typeof raw === 'string' && /^[\w-]{1,64}$/.test(raw) && !ids.has(raw) ? raw : newId('layer');
    ids.add(id);
    return id;
  };
  const layers: Layer[] = (Array.isArray(f.layers) ? f.layers : []).map((l, i) => ({
    id: idOf((l as Partial<BaipixLayer>).id),
    name: typeof l.name === 'string' && l.name ? l.name.slice(0, 120) : `Layer ${i + 1}`,
    visible: l.visible !== false,
    locked: l.locked === true,
    opacity: typeof l.opacity === 'number' ? clamp(l.opacity, 0, 1) : 1,
    ...(BLEND_MODES.includes(l.blendMode as BlendMode) &&
      l.blendMode !== 'normal' && { blendMode: l.blendMode as BlendMode }),
    pixels: decodePixels(
      Array.isArray(l.colors) ? l.colors : [],
      Array.isArray(l.runs) ? l.runs : [],
      width * height,
    ),
  }));
  if (!layers.length) throw new FileFormatError('No layers');
  const groups = readGroups(
    f.groups,
    layers,
    (Array.isArray(f.layers) ? f.layers : []).map((l) => l.group),
  );
  const doc: PixelDoc = {
    id: typeof f.id === 'string' ? f.id : newId('doc'),
    name: typeof f.name === 'string' && f.name.trim() ? f.name.slice(0, 120) : 'Untitled',
    width,
    height,
    layers,
    activeLayer: clamp(Math.round(Number(f.activeLayer)) || 0, 0, layers.length - 1),
    layerCounter: Math.max(layers.length, Number(f.layerCounter) || 0),
    background: (Number(f.background) || 0) >>> 0,
    backgroundVisible: f.backgroundVisible !== false,
    render: {
      pixelSize: clamp(Number(f.render?.pixelSize) || 8, 1, 64),
      gap: clamp(Number(f.render?.gap) || 0, 0, 64),
    },
    ...(typeof f.axisX === 'number' && { axisX: clamp(Math.round(f.axisX * 2) / 2, 0, width) }),
    ...(typeof f.axisY === 'number' && { axisY: clamp(Math.round(f.axisY * 2) / 2, 0, height) }),
    ...(readGuides(f.guides, width, height) ?? {}),
    ...(typeof f.isoGrid === 'number' && Number.isFinite(f.isoGrid) && { isoGrid: isoCellSize(f.isoGrid) }),
    ...(f.isoGridVertical === true && { isoGridVertical: true }),
    ...(readLight(f.light) && { light: readLight(f.light) }),
    ...(readBoard(f.board) ?? {}),
    ...(typeof f.updatedAt === 'number' && Number.isFinite(f.updatedAt) && { updatedAt: f.updatedAt }),
    ...(groups && { groups }),
    ...(readPalette(f.palette) ?? {}),
  };
  readFrames(doc, f.frames, f.activeFrame, Array.isArray(f.layers) ? f.layers : []);
  normalizeGroups(doc);
  readComponents(layers, Array.isArray(f.layers) ? f.layers : []);
  (Array.isArray(f.layers) ? f.layers : []).forEach((l, i) => {
    const effects = cleanEffects((l as Partial<BaipixLayer>).effects);
    if (effects && layers[i]) layers[i].effects = effects;
  });
  if (!inFile) normalizeComponents([doc]);
  return doc;
}

/** Animation frames from a file: their durations, and each layer's pixels on them. */
function readFrames(doc: PixelDoc, raw: unknown, active: unknown, layers: Partial<BaipixLayer>[]): void {
  if (!Array.isArray(raw) || raw.length < 2) return;
  const list = raw.slice(0, MAX_FRAMES) as Partial<{ duration: unknown }>[];
  doc.frames = list.map((f) => createFrame(clampDuration(Number(f?.duration))));
  const shown = clamp(Math.round(Number(active)) || 0, 0, doc.frames.length - 1);
  doc.activeFrame = shown;
  const size = doc.width * doc.height;
  doc.layers.forEach((layer, i) => {
    const cels = layers[i]?.cels;
    layer.cels = doc.frames!.map((_, k): Cel | null => {
      if (k === shown) return null;
      const c = Array.isArray(cels) ? cels[k] : null;
      // A frame missing from the file shows the layer as it is on the active one.
      if (!c || typeof c !== 'object') return { pixels: layer.pixels.slice() };
      return {
        pixels: decodePixels(
          Array.isArray(c.colors) ? c.colors : [],
          Array.isArray(c.runs) ? c.runs : [],
          size,
        ),
      };
    });
  });
  normalizeFrames(doc);
}

/** A board's place from a file: its file id and name, and whole-pixel coordinates. */
function readBoard(b: unknown): { board: BoardPlace } | null {
  const v = b as Partial<BoardPlace> | null;
  if (!v || typeof v !== 'object' || typeof v.file !== 'string' || typeof v.fileName !== 'string')
    return null;
  const at = (n: unknown) =>
    typeof n === 'number' && Number.isFinite(n) ? clamp(Math.round(n), -1e6, 1e6) : 0;
  return {
    board: {
      file: v.file,
      fileName: v.fileName.slice(0, 120),
      x: at(v.x),
      y: at(v.y),
      ...(v.empty === true && { empty: true }),
      ...(v.free === true && { free: true }),
    },
  };
}

/**
 * A file of several boards, as a .baipix file: its name and its boards, each a board as a single
 * board file would be with its place in the file. Files of one board keep the plain format (version
 * 1), which older versions of Baipix still open.
 */
interface BaipixBoards {
  format: typeof FILE_FORMAT;
  version: 2;
  name: string;
  boards: BaipixFile[];
}

export const documentToJson = (doc: PixelDoc): string => JSON.stringify(serializeDocument(doc));

/** A file as a .baipix file: its only board as before, or all its boards (see `BaipixBoards`). */
export function fileToJson(boards: PixelDoc[]): string {
  if (boards.length === 1 && !boards[0].board) return documentToJson(boards[0]);
  const data: BaipixBoards = {
    format: FILE_FORMAT,
    version: 2,
    name: boards[0].board?.fileName ?? boards[0].name,
    boards: boards.map((doc) => serializeDocument(doc)),
  };
  return JSON.stringify(data);
}

const parseJson = (text: string): unknown => {
  try {
    return JSON.parse(text);
  } catch {
    throw new FileFormatError('Invalid JSON');
  }
};

export const documentFromJson = (text: string): PixelDoc => openedDocument(parseJson(text));

/** A one-board file read for opening: new ids, so it never mixes with a copy already open. */
function openedDocument(data: unknown): PixelDoc {
  const doc = deserializeDocument(data);
  doc.id = newId('doc');
  return renewLayerIds([doc])[0];
}

/**
 * New ids for every layer of a file's boards, the instances following their masters: a file
 * opened twice, or next to the one it was saved from, doesn't share ids with it.
 */
function renewLayerIds(docs: PixelDoc[]): PixelDoc[] {
  const ids = new Map<string, string>();
  for (const doc of docs)
    for (const layer of doc.layers) {
      const id = newId('layer');
      ids.set(layer.id, id);
      layer.id = id;
    }
  for (const doc of docs)
    for (const layer of doc.layers)
      if (layer.instance)
        layer.instance = { ...layer.instance, of: ids.get(layer.instance.of) ?? layer.instance.of };
  return docs;
}

/**
 * The boards of a .baipix file: one for a plain file, all of them for a file of boards. Opened
 * files get new ids, so a file opened twice doesn't mix with itself.
 */
export function fileFromJson(text: string): PixelDoc[] {
  const data = parseJson(text) as Partial<BaipixBoards> | null;
  if (!data || typeof data !== 'object' || data.format !== FILE_FORMAT || data.version !== 2)
    return [openedDocument(data)];
  if (!Array.isArray(data.boards) || !data.boards.length) throw new FileFormatError('No boards');
  const file = newId('doc');
  const fileName = (typeof data.name === 'string' && data.name.trim()) || 'Untitled';
  const docs = data.boards.map((b) => {
    const doc = deserializeDocument({ ...b, version: 1 }, true);
    doc.id = newId('doc');
    doc.board = {
      file,
      fileName: fileName.slice(0, 120),
      x: doc.board?.x ?? 0,
      y: doc.board?.y ?? 0,
      ...(doc.board?.empty && { empty: true }),
      ...(doc.board?.free && { free: true }),
    };
    return doc;
  });
  // The components once every board is read: an instance can point at another board's master.
  normalizeComponents(docs);
  return renewLayerIds(docs);
}
