import type { Color } from '../engine/color';
import { BLEND_MODES, type BlendMode } from '../engine/composite';
import { MAX_SIZE, newId, type Layer, type LayerGroup, type PixelDoc } from '../engine/document';
import { normalizeGroups } from '../engine/groups';
import { clamp } from '../engine/math';

/**
 * `.baipix` files are plain JSON. Each layer is stored as an indexed palette plus run-length
 * encoded indices: small, diff-friendly and readable without any image decoder.
 */
export const FILE_FORMAT = 'baipix';
export const FILE_VERSION = 1;
export const FILE_EXTENSION = '.baipix';

export interface BaipixLayer {
  name: string;
  visible: boolean;
  /** Missing in older files: unlocked. */
  locked?: boolean;
  opacity: number;
  /** Missing in older files, and for normal: normal. A CSS mix-blend-mode name. */
  blendMode?: string;
  /** The group it's in, as an index in `groups` (missing: the top level). */
  group?: number;
  /** Distinct colors as unsigned 32-bit integers (0xAABBGGRR). */
  colors: number[];
  /** Flat list of [colorIndex, runLength] pairs, row-major. */
  runs: number[];
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
  /** Last change, in ms since the epoch. */
  updatedAt?: number;
  layers: BaipixLayer[];
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
    ...(doc.updatedAt !== undefined && { updatedAt: doc.updatedAt }),
    layers: doc.layers.map((l) => ({
      name: l.name,
      visible: l.visible,
      locked: l.locked,
      opacity: l.opacity,
      ...(l.blendMode && l.blendMode !== 'normal' && { blendMode: l.blendMode }),
      ...(l.group && groupIndex.has(l.group) && { group: groupIndex.get(l.group) }),
      ...encodePixels(l.pixels),
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

/** Validates and converts a parsed `.baipix` object into a document. Throws FileFormatError. */
export function deserializeDocument(data: unknown): PixelDoc {
  const f = data as Partial<BaipixFile> | null;
  if (!f || f.format !== FILE_FORMAT) throw new FileFormatError('Not a .baipix file');
  if (typeof f.version !== 'number' || f.version > FILE_VERSION)
    throw new FileFormatError('Unsupported version');
  const width = clamp(Math.round(Number(f.width)) || 0, 1, MAX_SIZE);
  const height = clamp(Math.round(Number(f.height)) || 0, 1, MAX_SIZE);
  const layers: Layer[] = (Array.isArray(f.layers) ? f.layers : []).map((l, i) => ({
    id: newId('layer'),
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
    ...(typeof f.updatedAt === 'number' && Number.isFinite(f.updatedAt) && { updatedAt: f.updatedAt }),
    ...(groups && { groups }),
  };
  normalizeGroups(doc);
  return doc;
}

export const documentToJson = (doc: PixelDoc): string => JSON.stringify(serializeDocument(doc));

export function documentFromJson(text: string): PixelDoc {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new FileFormatError('Invalid JSON');
  }
  return deserializeDocument(data);
}
