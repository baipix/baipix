import type { Color } from './color';
import { blendOver } from './composite';
import type { Layer } from './document';

/**
 * Layer effects, like in Figma: drawn from the layer's pixels when the picture is put together,
 * never written into them, so they can be tuned, hidden or removed at any time. Pixel art ones:
 * hard pixels, and a glow that fades in dithering rather than in shades.
 */
export type EffectType = 'outline' | 'shadow' | 'glow';
export const EFFECT_TYPES: EffectType[] = ['outline', 'shadow', 'glow'];

export type LayerEffect =
  | {
      type: 'outline';
      visible: boolean;
      color: Color;
      /** Thickness, in pixels. */
      size: number;
      /** Around the drawing, or along its own edge. */
      place: 'outside' | 'inside';
      /** Diagonal neighbors count: square corners. Without, corners stay rounder. */
      corners: boolean;
    }
  | {
      type: 'shadow';
      visible: boolean;
      color: Color;
      /** Offset of the shadow, in pixels. */
      x: number;
      y: number;
    }
  | {
      type: 'glow';
      visible: boolean;
      color: Color;
      /** How far it reaches, in pixels; it thins out in dithering toward the end. */
      size: number;
    };

export const MAX_EFFECT_SIZE = 16;
export const MAX_SHADOW_OFFSET = 32;

/** A new effect, in `color`, with settings that read well on most sprites. */
export function newEffect(type: EffectType, color: Color): LayerEffect {
  switch (type) {
    case 'shadow':
      return { type, visible: true, color, x: 1, y: 1 };
    case 'glow':
      return { type, visible: true, color, size: 3 };
    default:
      return { type: 'outline', visible: true, color, size: 1, place: 'outside', corners: false };
  }
}

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const SIDES = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];
const ALL = [...SIDES, [1, 1], [1, -1], [-1, 1], [-1, -1]];

/**
 * How many steps each empty pixel is from the drawing, up to `max` (0: drawn, 255: farther). A
 * step goes to the 4 sides, or all 8 neighbors with `corners`; alternating both gives rounder rings.
 */
function distances(mask: Uint8Array, w: number, h: number, max: number, steps: 'sides' | 'all' | 'round') {
  const d = new Uint8Array(w * h).fill(255);
  let front: number[] = [];
  for (let i = 0; i < mask.length; i++)
    if (mask[i]) {
      d[i] = 0;
      front.push(i);
    }
  for (let k = 1; k <= max && front.length; k++) {
    const around = steps === 'all' || (steps === 'round' && k % 2 === 0) ? ALL : SIDES;
    const next: number[] = [];
    for (const i of front) {
      const x = i % w;
      const y = (i / w) | 0;
      for (const [dx, dy] of around) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const j = ny * w + nx;
        if (d[j] !== 255) continue;
        d[j] = k;
        next.push(j);
      }
    }
    front = next;
  }
  return d;
}

const drawnMask = (pixels: Uint32Array) => {
  const m = new Uint8Array(pixels.length);
  for (let i = 0; i < pixels.length; i++) if (pixels[i] >>> 24) m[i] = 1;
  return m;
};

/** Lays `color` under what's already in `out` at pixel `i`. */
const under = (out: Uint32Array, i: number, color: Color) => (out[i] = blendOver(out[i], color));

/**
 * The layer's pixels with its visible effects, as a new buffer (or `pixels` itself when there's
 * nothing to add). Shadows and glows go under the drawing, the first listed on top; an outside
 * outline around it, an inside one over its edge.
 */
export function withEffects(pixels: Uint32Array, w: number, h: number, effects: LayerEffect[] | undefined) {
  const shown = effects?.filter((e) => e.visible);
  if (!shown?.length) return pixels;
  const mask = drawnMask(pixels);
  const out = pixels.slice();
  // Under the drawing, from the last listed up, so the first one ends up on top.
  for (const e of [...shown].reverse()) {
    if (e.type === 'shadow') {
      for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
          const sx = x - e.x;
          const sy = y - e.y;
          if (sx < 0 || sy < 0 || sx >= w || sy >= h || !mask[sy * w + sx]) continue;
          under(out, y * w + x, e.color);
        }
    } else if (e.type === 'glow') {
      const size = Math.min(MAX_EFFECT_SIZE, Math.max(1, e.size));
      const d = distances(mask, w, h, size, 'round');
      for (let i = 0; i < d.length; i++) {
        const k = d[i];
        if (!k || k > size) continue;
        // Ring 1 is solid, the last ones thin out: a Bayer threshold falling with the distance.
        const x = i % w;
        const y = (i / w) | 0;
        if (BAYER[(y & 3) * 4 + (x & 3)] < (16 * (size - k + 1)) / size) under(out, i, e.color);
      }
    }
  }
  for (const e of shown) {
    if (e.type !== 'outline') continue;
    const size = Math.min(MAX_EFFECT_SIZE, Math.max(1, e.size));
    const steps = e.corners ? 'all' : 'sides';
    if (e.place === 'outside') {
      const d = distances(mask, w, h, size, steps);
      for (let i = 0; i < d.length; i++) if (d[i] && d[i] <= size) out[i] = e.color;
    } else {
      // Inside: the drawn pixels within `size` steps of an empty one (or the canvas edge).
      const empty = new Uint8Array(mask.length);
      for (let i = 0; i < mask.length; i++) empty[i] = mask[i] ? 0 : 1;
      const d = distances(empty, w, h, size, steps);
      for (let i = 0; i < d.length; i++) {
        if (!mask[i]) continue;
        const x = i % w;
        const y = (i / w) | 0;
        const edge = Math.min(x + 1, y + 1, w - x, h - y);
        if (d[i] <= size || edge <= size) out[i] = e.color;
      }
    }
  }
  return out;
}

/** Writes a layer's visible effects into its pixels, and drops all its effects (merging, "Apply"). */
export function bakeEffects(layer: Layer, w: number, h: number): void {
  if (!layer.effects) return;
  const out = withEffects(layer.pixels, w, h, layer.effects);
  if (out !== layer.pixels) layer.pixels.set(out);
  delete layer.effects;
}

/** Effects read back from a file: valid ones only, at most 8. */
export function cleanEffects(raw: unknown): LayerEffect[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const int = (n: unknown, min: number, max: number, fallback: number) =>
    typeof n === 'number' && Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : fallback;
  const effects = raw
    .filter(
      (e): e is Record<string, unknown> => !!e && EFFECT_TYPES.includes((e as { type: EffectType }).type),
    )
    .slice(0, 8)
    .map((e): LayerEffect => {
      const base = {
        visible: e.visible !== false,
        color: typeof e.color === 'number' ? e.color >>> 0 : 0xff000000,
      };
      if (e.type === 'shadow')
        return {
          type: 'shadow',
          ...base,
          x: int(e.x, -MAX_SHADOW_OFFSET, MAX_SHADOW_OFFSET, 1),
          y: int(e.y, -MAX_SHADOW_OFFSET, MAX_SHADOW_OFFSET, 1),
        };
      if (e.type === 'glow') return { type: 'glow', ...base, size: int(e.size, 1, MAX_EFFECT_SIZE, 3) };
      return {
        type: 'outline',
        ...base,
        size: int(e.size, 1, MAX_EFFECT_SIZE, 1),
        place: e.place === 'inside' ? 'inside' : 'outside',
        corners: e.corners === true,
      };
    });
  return effects.length ? effects : undefined;
}
