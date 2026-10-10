import { alpha, type Color } from './color';
import type { LayerEffect } from './effects';
import { syncInstances, type ComponentFrame, type InstanceRef } from './components';
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
  /** This layer is a component's master: the sprite is its pixels inside this frame. */
  component?: ComponentFrame;
  /** This layer is an instance of a master: its pixels are rendered from it (see components.ts). */
  instance?: InstanceRef;
  /** Effects drawn from its pixels when the picture is put together (see effects.ts). */
  effects?: LayerEffect[];
}

/**
 * A group of layers. Its layers sit next to each other in `doc.layers`, each pointing at its
 * innermost group; groups nest up to four levels deep (see groups.ts).
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

/**
 * A file's palette: a preset (its key) or the file's own colors ('custom'), or 'drawing', the
 * colors the drawing uses, kept up to date as it changes (`colors` is then unused).
 */
export interface DocPalette {
  key: string;
  colors: Color[];
  /** The file's own colors, kept while trying presets, to come back to them. */
  custom?: Color[];
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
  /** The file's palette. Missing: the colors of the drawing (see `DocPalette`). */
  palette?: DocPalette;
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
  ...(layer.component && { component: { ...layer.component } }),
  ...(layer.instance && { instance: { ...layer.instance } }),
  ...(layer.effects && { effects: layer.effects.map((e) => ({ ...e })) }),
});

export function cloneDocument(doc: PixelDoc, keepIds = true): PixelDoc {
  return {
    ...doc,
    id: keepIds ? doc.id : newId('doc'),
    render: { ...doc.render },
    ...(doc.guides && { guides: { x: [...doc.guides.x], y: [...doc.guides.y] } }),
    ...(doc.groups && { groups: doc.groups.map((g) => ({ ...g })) }),
    layers: keepIds ? doc.layers.map((l) => cloneLayer(l)) : cloneLayersWithNewIds(doc.layers),
  };
}

/** Copies layers under new ids, instances still pointing at their (copied) masters. */
function cloneLayersWithNewIds(layers: Layer[]): Layer[] {
  const copies = layers.map((l) => cloneLayer(l, false));
  const ids = new Map(layers.map((l, i) => [l.id, copies[i].id]));
  for (const copy of copies)
    if (copy.instance) copy.instance.of = ids.get(copy.instance.of) ?? copy.instance.of;
  return copies;
}

export const activeLayer = (doc: PixelDoc): Layer => doc.layers[doc.activeLayer];

export const hasBackground = (doc: PixelDoc): boolean => doc.backgroundVisible && alpha(doc.background) > 0;

/** Where the symmetry axes are: the center of the canvas unless they were moved. */
export const mirrorAxes = (doc: PixelDoc): { x: number; y: number } => ({
  x: doc.axisX ?? doc.width / 2,
  y: doc.axisY ?? doc.height / 2,
});

/** Where the old canvas's top-left lands when resizing without an offset: the drawing stays centered. */
export const centeredOffset = (doc: PixelDoc, width: number, height: number): { x: number; y: number } => ({
  x: Math.floor((width - doc.width) / 2),
  y: Math.floor((height - doc.height) / 2),
});

/**
 * Changes the canvas size, the old canvas's top-left landing at `offsetX`, `offsetY` in the new one
 * (centered by default). Moved symmetry axes, guides and the reference follow the drawing.
 */
export function resizeDocument(
  doc: PixelDoc,
  width: number,
  height: number,
  offsetX = centeredOffset(doc, width, height).x,
  offsetY = centeredOffset(doc, width, height).y,
): void {
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
    // Masters' frames and instances' places stay on the same pixels.
    if (layer.component) {
      const f = layer.component;
      const x = Math.max(0, f.x + offsetX);
      const y = Math.max(0, f.y + offsetY);
      const w = Math.min(width, f.x + offsetX + f.w) - x;
      const h = Math.min(height, f.y + offsetY + f.h) - y;
      layer.component = {
        x: Math.min(x, width - 1),
        y: Math.min(y, height - 1),
        w: Math.max(1, w),
        h: Math.max(1, h),
      };
    }
    if (layer.instance)
      layer.instance = { ...layer.instance, x: layer.instance.x + offsetX, y: layer.instance.y + offsetY };
  }
  doc.width = width;
  doc.height = height;
  syncInstances(doc);
}
