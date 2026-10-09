import { BLEND_MODES, type BlendMode } from '../engine/composite';
import { MAX_SIZE, type Layer, type LayerGroup } from '../engine/document';
import type { LayerFragment } from '../engine/layerClipboard';
import { clamp } from '../engine/math';
import { decodePixels, encodePixels } from './fileFormat';

/**
 * Copied layers on the system clipboard, so they paste in another file or another tab: JSON like
 * a `.baipix` file's layers (ids kept, so instances find their master), base64 in an attribute of
 * the clipboard's HTML, as design tools do. Other apps get the PNG that goes along with it.
 */
const KIND = 'baipix-layers';
const ATTRIBUTE = 'data-baipix-layers';

export function encodeLayerClip(f: LayerFragment): string {
  return JSON.stringify({
    kind: KIND,
    version: 1,
    ...(f.id && { id: f.id }),
    width: f.width,
    height: f.height,
    layers: f.layers.map((l) => ({
      id: l.id,
      name: l.name,
      visible: l.visible,
      locked: l.locked,
      opacity: l.opacity,
      ...(l.blendMode && l.blendMode !== 'normal' && { blendMode: l.blendMode }),
      ...(l.group && { group: l.group }),
      ...(l.component && { component: { ...l.component } }),
      ...(l.instance && { instance: { ...l.instance } }),
      ...encodePixels(l.pixels),
    })),
    groups: f.groups,
  });
}

const whole = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);
const text = (s: unknown, fallback: string) => (typeof s === 'string' && s ? s.slice(0, 120) : fallback);

/** Copied layers back from `encodeLayerClip`'s JSON, checked like a file. Null when it isn't one. */
export function decodeLayerClip(json: string): LayerFragment | null {
  try {
    const data = JSON.parse(json) as Record<string, unknown>;
    const { width, height } = data;
    if (data.kind !== KIND || !whole(width) || !whole(height)) return null;
    if (width < 1 || height < 1 || width > MAX_SIZE || height > MAX_SIZE) return null;
    const rawGroups = (Array.isArray(data.groups) ? data.groups : []).slice(0, 256) as Record<
      string,
      unknown
    >[];
    const groups: LayerGroup[] = rawGroups
      .filter((g) => typeof g.id === 'string')
      .map((g) => ({
        id: g.id as string,
        name: text(g.name, 'Group'),
        visible: g.visible !== false,
        locked: g.locked === true,
        opacity: whole(g.opacity) ? clamp(g.opacity, 0, 1) : 1,
        ...((g.blendMode === 'pass-through' || BLEND_MODES.includes(g.blendMode as BlendMode)) && {
          blendMode: g.blendMode as LayerGroup['blendMode'],
        }),
        ...(g.collapsed === true && { collapsed: true }),
        ...(typeof g.parent === 'string' && { parent: g.parent }),
      }));
    const rawLayers = (Array.isArray(data.layers) ? data.layers : []).slice(0, 256) as Record<
      string,
      unknown
    >[];
    const layers: Layer[] = rawLayers
      .filter((l) => typeof l.id === 'string' && Array.isArray(l.colors) && Array.isArray(l.runs))
      .map((l) => {
        const c = l.component as Record<string, unknown> | undefined;
        const ref = l.instance as Record<string, unknown> | undefined;
        return {
          id: l.id as string,
          name: text(l.name, 'Layer'),
          visible: l.visible !== false,
          locked: l.locked === true,
          opacity: whole(l.opacity) ? clamp(l.opacity, 0, 1) : 1,
          ...(BLEND_MODES.includes(l.blendMode as BlendMode) && { blendMode: l.blendMode as BlendMode }),
          ...(typeof l.group === 'string' && { group: l.group }),
          ...(c &&
            whole(c.x) &&
            whole(c.y) &&
            whole(c.w) &&
            whole(c.h) && { component: { x: c.x, y: c.y, w: c.w, h: c.h } }),
          ...(ref &&
            typeof ref.of === 'string' &&
            whole(ref.x) &&
            whole(ref.y) && {
              instance: { of: ref.of, x: Math.round(ref.x), y: Math.round(ref.y) },
            }),
          pixels: decodePixels(l.colors as number[], l.runs as number[], width * height),
        };
      });
    const id = typeof data.id === 'string' ? { id: data.id } : {};
    return layers.length ? { ...id, width, height, layers, groups } : null;
  } catch {
    return null;
  }
}

/** UTF-8 safe base64, in chunks (a big drawing makes a long string). */
function toBase64(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000)
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

const fromBase64 = (b: string): string =>
  new TextDecoder().decode(Uint8Array.from(atob(b), (c) => c.charCodeAt(0)));

/** The clipboard's HTML for copied layers. */
export const layerClipHtml = (f: LayerFragment): string =>
  `<meta charset="utf-8"><span ${ATTRIBUTE}="${toBase64(encodeLayerClip(f))}"></span>`;

/** Copied layers from the clipboard's HTML, or null if it holds none. */
export function layerClipFromHtml(html: string): LayerFragment | null {
  const m = html.match(new RegExp(`${ATTRIBUTE}="([A-Za-z0-9+/=]+)"`));
  if (!m) return null;
  try {
    return decodeLayerClip(fromBase64(m[1]));
  } catch {
    return null;
  }
}
