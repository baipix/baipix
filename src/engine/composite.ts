import { alpha, blue, green, pack, red, type Color } from './color';
import { hasBackground, type Layer, type PixelDoc } from './document';
import { layerTree, type LayerNode } from './groups';

/** Straight-alpha "source over" of one color onto another, with an extra opacity factor. */
export function blendOver(src: Color, dst: Color, opacity = 1): Color {
  const sa = (alpha(src) / 255) * opacity;
  if (sa <= 0) return dst;
  const da = alpha(dst) / 255;
  const oa = sa + da * (1 - sa);
  if (oa <= 0) return 0;
  const mix = (s: number, d: number) => Math.round((s * sa + d * da * (1 - sa)) / oa);
  return pack(
    mix(red(src), red(dst)),
    mix(green(src), green(dst)),
    mix(blue(src), blue(dst)),
    Math.round(oa * 255),
  );
}

/** How a layer mixes with what's under it. The names are CSS's `mix-blend-mode` ones. */
export type BlendMode =
  | 'normal'
  | 'darken'
  | 'multiply'
  | 'color-burn'
  | 'lighten'
  | 'screen'
  | 'color-dodge'
  | 'overlay'
  | 'soft-light'
  | 'hard-light'
  | 'difference'
  | 'exclusion';

/** The modes in menu order, by family (a separator between families). */
export const BLEND_MODE_GROUPS: BlendMode[][] = [
  ['normal'],
  ['darken', 'multiply', 'color-burn'],
  ['lighten', 'screen', 'color-dodge'],
  ['overlay', 'soft-light', 'hard-light'],
  ['difference', 'exclusion'],
];
export const BLEND_MODES: BlendMode[] = BLEND_MODE_GROUPS.flat();

const screen = (b: number, s: number) => b + s - b * s;
const hardLight = (b: number, s: number) => (s <= 0.5 ? b * 2 * s : screen(b, 2 * s - 1));

/** W3C Compositing: the mixed channel from the backdrop `b` and the source `s`, both 0 to 1. */
const MIX: Record<Exclude<BlendMode, 'normal'>, (b: number, s: number) => number> = {
  darken: Math.min,
  multiply: (b, s) => b * s,
  'color-burn': (b, s) => (b >= 1 ? 1 : s <= 0 ? 0 : 1 - Math.min(1, (1 - b) / s)),
  lighten: Math.max,
  screen,
  'color-dodge': (b, s) => (b <= 0 ? 0 : s >= 1 ? 1 : Math.min(1, b / (1 - s))),
  overlay: (b, s) => hardLight(s, b),
  'soft-light': (b, s) => {
    if (s <= 0.5) return b - (1 - 2 * s) * b * (1 - b);
    const d = b <= 0.25 ? ((16 * b - 12) * b + 4) * b : Math.sqrt(b);
    return b + (2 * s - 1) * (d - b);
  },
  'hard-light': hardLight,
  difference: (b, s) => Math.abs(b - s),
  exclusion: (b, s) => b + s - 2 * b * s,
};

/**
 * `src` over `dst` in a blend mode, with an extra opacity: the source's color is first mixed with
 * the backdrop (as much as the backdrop is opaque), then laid over it like `blendOver`.
 */
export function blendWith(mode: BlendMode, src: Color, dst: Color, opacity = 1): Color {
  if (mode === 'normal') return blendOver(src, dst, opacity);
  const sa = (alpha(src) / 255) * opacity;
  if (sa <= 0) return dst;
  const da = alpha(dst) / 255;
  const oa = sa + da * (1 - sa);
  const mix = MIX[mode];
  const channel = (sc: number, dc: number) => {
    const s = sc / 255;
    const d = dc / 255;
    const mixed = (1 - da) * s + da * mix(d, s);
    return Math.round(((sa * mixed + da * (1 - sa) * d) / oa) * 255);
  };
  return pack(
    channel(red(src), red(dst)),
    channel(green(src), green(dst)),
    channel(blue(src), blue(dst)),
    Math.round(oa * 255),
  );
}

export interface FlattenOptions {
  includeBackground?: boolean;
  /** Only render this layer (ignores visibility and opacity). */
  onlyLayer?: Layer;
}

/** Merges the document's layers into a single pixel buffer. Pure: never touches the document. */
export function flatten(doc: PixelDoc, options: FlattenOptions = {}): Uint32Array {
  const { includeBackground = true, onlyLayer } = options;
  const out = new Uint32Array(doc.width * doc.height);
  if (onlyLayer) {
    out.set(onlyLayer.pixels);
    return out;
  }
  const background = includeBackground && hasBackground(doc);
  if (background) out.fill(doc.background);
  composeNodes(layerTree(doc), out, 1, !background);
  return out;
}

/**
 * Lays nodes over `out`. A group in pass-through at full opacity adds its layers one by one;
 * otherwise its layers are put together on their own first, then laid down in its mode and
 * opacity. `empty`: nothing is under yet, so the first full-opacity layer is just copied.
 */
function composeNodes(nodes: LayerNode[], out: Uint32Array, opacity: number, empty: boolean): boolean {
  for (const node of nodes) {
    if (node.kind === 'layer') {
      const layer = node.layer;
      const k = layer.opacity * opacity;
      if (!layer.visible || k <= 0) continue;
      const mode = layer.blendMode ?? 'normal';
      // Nothing under it yet: every mode gives the layer as it is.
      if (empty && k === 1) out.set(layer.pixels);
      else
        for (let i = 0; i < out.length; i++) {
          const c = layer.pixels[i];
          if (c >>> 24) out[i] = blendWith(mode, c, out[i], k);
        }
      empty = false;
      continue;
    }
    const group = node.group;
    if (!group.visible || group.opacity <= 0) continue;
    if (!group.blendMode && group.opacity === 1) {
      empty = composeNodes(node.children, out, opacity, empty);
      continue;
    }
    const own = new Uint32Array(out.length);
    if (!composeNodes(node.children, own, 1, true)) {
      const mode = group.blendMode ?? 'normal';
      const k = group.opacity * opacity;
      for (let i = 0; i < out.length; i++) {
        const c = own[i];
        if (c >>> 24) out[i] = blendWith(mode, c, out[i], k);
      }
      empty = false;
    }
  }
  return empty;
}

/** Merges `top` into `bottom` in place (used by "merge down"), in `top`'s blend mode. */
export function mergeLayerInto(top: Layer, bottom: Layer): void {
  if (!top.visible) return;
  const mode = top.blendMode ?? 'normal';
  for (let i = 0; i < top.pixels.length; i++) {
    const c = top.pixels[i];
    if (c >>> 24) bottom.pixels[i] = blendWith(mode, c, bottom.pixels[i], top.opacity);
  }
}
