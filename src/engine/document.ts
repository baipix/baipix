import { alpha, type Color } from './color';
import type { BlendMode } from './composite';
import { reframe, type Outside } from './outside';

export const MAX_SIZE = 512;

export interface Layer {
  id: string;
  name: string;
  visible: boolean;
  /** Locked layers can't be painted on (they can still be moved, renamed or deleted). */
  locked: boolean;
  /** 0..1 */
  opacity: number;
  /** How it mixes with the layers under it; missing: normal. */
  blendMode?: BlendMode;
  /** width × height packed colors, row-major. */
  pixels: Uint32Array;
  /** What was moved off the canvas, kept to bring it back (see outside.ts). */
  outside?: Outside;
  /** The group it's in (its innermost one); missing: at the top level. */
  group?: string;
}

/**
 * A group of layers. Its layers sit next to each other in `doc.layers`, each pointing at its
 * innermost group; groups nest two levels deep (see groups.ts).
 */
export interface LayerGroup {
  id: string;
  name: string;
  visible: boolean;
  locked: boolean;
  /** 0..1, applied over its layers' own. */
  opacity: number;
  /** Missing: pass-through, each layer blends on its own. */
  blendMode?: BlendMode;
  /** Folded in the Layers panel. */
  collapsed?: boolean;
  /** The group it's in, for a group inside another one. */
  parent?: string;
}

/** How pixels are rendered on export (and optionally previewed on the canvas). */
export interface RenderSettings {
  /** Size of one pixel in the exported file, in px. */
  pixelSize: number;
  /** Gap between pixels in the exported file, in px. */
  gap: number;
}

/**
 * An image under the drawing to trace over. Never exported, not part of the undo history, and not
 * in .baipix files: it's only kept with the workspace. Position and size are in art pixels.
 */
export interface ReferenceImage {
  /** Data URL (WebP or PNG), scaled down on import. */
  src: string;
  /** Natural size of `src`, for its proportions. */
  width: number;
  height: number;
  x: number;
  y: number;
  w: number;
  h: number;
  /** 0 to 1. */
  opacity: number;
  visible: boolean;
  /** Locked: the Move tool leaves it alone. */
  locked?: boolean;
}

export interface Guides {
  x: number[];
  y: number[];
}

export interface PixelDoc {
  id: string;
  name: string;
  width: number;
  height: number;
  /** Bottom to top. */
  layers: Layer[];
  /** Groups of layers (missing: none). */
  groups?: LayerGroup[];
  activeLayer: number;
  /** 0 means no background. */
  background: Color;
  backgroundVisible: boolean;
  render: RenderSettings;
  /**
   * Symmetry axes, in pixels from the left and top edges, by half pixels: a whole number puts the axis
   * between two pixels, a .5 through the middle of one. Missing means the center of the canvas.
   */
  axisX?: number;
  axisY?: number;
  /**
   * Guides dragged out of the rulers, on pixel edges (x: vertical lines, y: horizontal ones).
   * Like the reference, they're not part of the undo history.
   */
  guides?: Guides;
  /** Used to name new layers ("Layer 3"). */
  layerCounter: number;
  /** Last change, in ms since the epoch (for the home screen). Missing in older files. */
  updatedAt?: number;
  reference?: ReferenceImage;
}

let seq = 0;
export const newId = (prefix: string): string =>
  `${prefix}_${Date.now().toString(36)}${(seq++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export function createLayer(name: string, width: number, height: number): Layer {
  return {
    id: newId('layer'),
    name,
    visible: true,
    locked: false,
    opacity: 1,
    pixels: new Uint32Array(width * height),
  };
}

export function createDocument(name: string, width: number, height: number, layerName = 'Layer 1'): PixelDoc {
  return {
    id: newId('doc'),
    name,
    width,
    height,
    layers: [createLayer(layerName, width, height)],
    activeLayer: 0,
    background: 0,
    backgroundVisible: true,
    render: { pixelSize: 8, gap: 0 },
    layerCounter: 1,
    updatedAt: Date.now(),
  };
}

export const cloneLayer = (layer: Layer, keepId = true): Layer => ({
  ...layer,
  id: keepId ? layer.id : newId('layer'),
  pixels: layer.pixels.slice(),
});

export function cloneDocument(doc: PixelDoc, keepIds = true): PixelDoc {
  return {
    ...doc,
    id: keepIds ? doc.id : newId('doc'),
    render: { ...doc.render },
    ...(doc.guides && { guides: { x: [...doc.guides.x], y: [...doc.guides.y] } }),
    ...(doc.groups && { groups: doc.groups.map((g) => ({ ...g })) }),
    layers: doc.layers.map((l) => cloneLayer(l, keepIds)),
  };
}

export const activeLayer = (doc: PixelDoc): Layer => doc.layers[doc.activeLayer];

export const hasBackground = (doc: PixelDoc): boolean => doc.backgroundVisible && alpha(doc.background) > 0;

/** Where the symmetry axes are: the center of the canvas unless they were moved. */
export const mirrorAxes = (doc: PixelDoc): { x: number; y: number } => ({
  x: doc.axisX ?? doc.width / 2,
  y: doc.axisY ?? doc.height / 2,
});

/** Changes the canvas size, keeping the drawing centered (and moved symmetry axes with it). */
export function resizeDocument(doc: PixelDoc, width: number, height: number): void {
  const offsetX = Math.floor((width - doc.width) / 2);
  const offsetY = Math.floor((height - doc.height) / 2);
  if (doc.axisX !== undefined) doc.axisX = Math.min(width, Math.max(0, doc.axisX + offsetX));
  if (doc.axisY !== undefined) doc.axisY = Math.min(height, Math.max(0, doc.axisY + offsetY));
  // Guides stay on the same pixels too.
  if (doc.guides)
    doc.guides = { x: doc.guides.x.map((g) => g + offsetX), y: doc.guides.y.map((g) => g + offsetY) };
  // The reference stays under the same pixels.
  if (doc.reference)
    doc.reference = { ...doc.reference, x: doc.reference.x + offsetX, y: doc.reference.y + offsetY };
  // A smaller canvas keeps what it cuts off, a bigger one brings back what was outside.
  for (const layer of doc.layers) {
    const r = reframe(layer.pixels, doc.width, doc.height, layer.outside, offsetX, offsetY, width, height);
    layer.pixels = r.pixels;
    layer.outside = r.outside;
  }
  doc.width = width;
  doc.height = height;
}
