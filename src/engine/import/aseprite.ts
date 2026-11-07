import { pack, withAlpha } from '../color';
import { createDocument, newId, MAX_SIZE, type Layer, type LayerGroup, type PixelDoc } from '../document';
import { clampDuration, MAX_FRAMES, type Frame } from '../frames';
import { MAX_GROUP_DEPTH } from '../groups';

const HEADER_SIZE = 128;
const FRAME_HEADER_SIZE = 16;
const FILE_MAGIC = 0xa5e0;
const FRAME_MAGIC = 0xf1fa;

const LAYER_CHUNK = 0x2004;
const CEL_CHUNK = 0x2005;
const OLD_PALETTE_CHUNK = 0x0004;
const OLD_PALETTE_6BIT_CHUNK = 0x0011;
const PALETTE_CHUNK = 0x2019;

const BLEND_MODES = [
  'normal',
  'multiply',
  'screen',
  'overlay',
  'darken',
  'lighten',
  'color-dodge',
  'color-burn',
  'hard-light',
  'soft-light',
  'difference',
  'exclusion',
] as const;

type ColorDepth = 8 | 16 | 32;

interface AsepriteHeader {
  width: number;
  height: number;
  frames: number;
  depth: ColorDepth;
  flags: number;
  speed: number;
  transparentIndex: number;
}

interface ParsedLayer {
  id: string;
  name: string;
  type: number;
  visible: boolean;
  locked: boolean;
  opacity: number;
  blendMode: (typeof BLEND_MODES)[number];
  group?: string;
}

interface RawCel {
  type: number;
  layer: number;
  x: number;
  y: number;
  opacity: number;
  width?: number;
  height?: number;
  pixels?: Uint32Array;
  linkedFrame?: number;
}

export interface AsepriteImportResult {
  document: PixelDoc;
  warnings: string[];
}

class AsepriteError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AsepriteError';
  }
}

function fail(message: string): never {
  throw new AsepriteError(message);
}

function assertRange(bytes: Uint8Array, offset: number, size: number): void {
  if (
    !Number.isSafeInteger(offset) ||
    !Number.isSafeInteger(size) ||
    offset < 0 ||
    size < 0 ||
    offset + size > bytes.length
  ) {
    fail('Unexpected end of Aseprite file.');
  }
}

function readString(bytes: Uint8Array, view: DataView, offset: number): { value: string; next: number } {
  assertRange(bytes, offset, 2);
  const length = view.getUint16(offset, true);
  assertRange(bytes, offset + 2, length);

  return {
    value: new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(offset + 2, offset + 2 + length)),
    next: offset + 2 + length,
  };
}

function parseHeader(bytes: Uint8Array): AsepriteHeader {
  assertRange(bytes, 0, HEADER_SIZE);

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  if (view.getUint16(4, true) !== FILE_MAGIC) fail('Invalid Aseprite file signature.');

  const fileSize = view.getUint32(0, true);
  if (fileSize < HEADER_SIZE || fileSize > bytes.length) fail('Invalid Aseprite file size.');

  const frames = view.getUint16(6, true);
  const width = view.getUint16(8, true);
  const height = view.getUint16(10, true);
  const depth = view.getUint16(12, true);

  if (!frames || !width || !height) fail('Invalid Aseprite dimensions or frame count.');

  if (width > MAX_SIZE || height > MAX_SIZE) {
    fail(
      `Canvas size ${width} × ${height} exceeds Baipix's maximum of ${MAX_SIZE} × ${MAX_SIZE}. Resize the canvas in Aseprite.`,
    );
  }

  if (frames > MAX_FRAMES) {
    fail(
      `The file contains ${frames} frames. Baipix supports up to ${MAX_FRAMES} frames. Remove some frames in Aseprite.`,
    );
  }

  if (depth !== 8 && depth !== 16 && depth !== 32) {
    fail(`Unsupported Aseprite color depth: ${depth}.`);
  }

  return {
    width,
    height,
    frames,
    depth,
    flags: view.getUint32(14, true),
    speed: view.getUint16(18, true),
    transparentIndex: view.getUint8(28),
  };
}

function parsePaletteChunk(bytes: Uint8Array, view: DataView, start: number, end: number): number[] {
  assertRange(bytes, start, 20);

  const total = view.getUint32(start, true);
  const first = view.getUint32(start + 4, true);
  const last = view.getUint32(start + 8, true);

  if (total > 256 || first > last || last >= total) fail('Invalid Aseprite palette.');

  const colors: number[] = new Array(total).fill(0);
  let at = start + 20;

  for (let i = first; i <= last; i++) {
    assertRange(bytes, at, 6);
    const flags = view.getUint16(at, true);
    const color = pack(
      view.getUint8(at + 2),
      view.getUint8(at + 3),
      view.getUint8(at + 4),
      view.getUint8(at + 5),
    );
    colors[i] = color;
    at += 6;

    if (flags & 1) at = readString(bytes, view, at).next;
    if (at > end) fail('Invalid Aseprite palette entry.');
  }

  return colors;
}

function parseOldPalette(
  bytes: Uint8Array,
  view: DataView,
  start: number,
  end: number,
  sixBit: boolean,
): number[] {
  assertRange(bytes, start, 2);

  const packets = view.getUint16(start, true);
  const colors: number[] = [];
  let at = start + 2;
  let index = 0;

  for (let p = 0; p < packets; p++) {
    assertRange(bytes, at, 2);
    index += view.getUint8(at);
    const count = view.getUint8(at + 1) || 256;
    at += 2;

    for (let i = 0; i < count; i++) {
      assertRange(bytes, at, 3);
      let r = view.getUint8(at++);
      let g = view.getUint8(at++);
      let b = view.getUint8(at++);

      if (sixBit) {
        r = Math.round((r / 63) * 255);
        g = Math.round((g / 63) * 255);
        b = Math.round((b / 63) * 255);
      }

      colors[index++] = pack(r, g, b);
    }

    if (at > end) fail('Invalid legacy Aseprite palette.');
  }

  return colors;
}

function parseLayer(
  bytes: Uint8Array,
  view: DataView,
  start: number,
  end: number,
  header: AsepriteHeader,
  groups: LayerGroup[],
  groupStack: string[],
  warnings: Set<string>,
): ParsedLayer {
  assertRange(bytes, start, 18);

  const flags = view.getUint16(start, true);
  const type = view.getUint16(start + 2, true);
  const level = view.getUint16(start + 4, true);
  const blend = view.getUint16(start + 10, true);
  const opacity = view.getUint8(start + 12);

  const name = readString(bytes, view, start + 16);

  if (name.next > end) fail('Invalid Aseprite layer.');

  const id = newId(type === 1 ? 'group' : 'layer');
  const actualOpacity =
    type === 1 && !(header.flags & 2) ? 255 : type !== 1 && !(header.flags & 1) ? 255 : opacity;

  const blendMode = BLEND_MODES[blend] ?? 'normal';

  if (blend > 11) warnings.add('Unsupported blend modes were changed to Normal.');

  const parsed: ParsedLayer = {
    id,
    name: name.value,
    type,
    visible: !!(flags & 1),
    locked: !(flags & 2),
    opacity: actualOpacity / 255,
    blendMode,
  };

  if (type === 1) {
    groupStack.length = Math.min(level, MAX_GROUP_DEPTH);

    if (level < MAX_GROUP_DEPTH) {
      const group: LayerGroup = {
        id,
        name: name.value,
        visible: parsed.visible,
        locked: parsed.locked,
        opacity: parsed.opacity,
        blendMode,
        collapsed: !!(flags & 32),
        ...(level > 0 && groupStack[level - 1] ? { parent: groupStack[level - 1] } : {}),
      };

      groups.push(group);
      groupStack[level] = id;
    } else {
      warnings.add('Groups deeper than four levels were flattened into the deepest supported group.');
    }

    return parsed;
  }

  if (type === 2) {
    warnings.add('Tilemap layers were skipped.');
    return parsed;
  }

  const groupDepth = Math.min(level, MAX_GROUP_DEPTH);
  if (level > MAX_GROUP_DEPTH) {
    warnings.add('Groups deeper than four levels were flattened into the deepest supported group.');
  }

  parsed.group = groupDepth > 0 ? groupStack[groupDepth - 1] : undefined;

  // Keep the file cursor validation aware of the optional tilemap/UUID fields.
  if (type === 2) assertRange(bytes, name.next, 4);
  if (header.flags & 4) assertRange(bytes, name.next, 16);

  return parsed;
}

async function decompress(data: Uint8Array): Promise<Uint8Array> {
  try {
    const stream = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate'));

    return new Uint8Array(await new Response(stream).arrayBuffer());
  } catch {
    fail('Unable to decompress Aseprite cel data.');
  }
}

function decodePixels(
  raw: Uint8Array,
  width: number,
  height: number,
  depth: ColorDepth,
  palette: number[],
  transparentIndex: number,
): Uint32Array {
  const bytesPerPixel = depth / 8;
  const expected = width * height * bytesPerPixel;

  if (raw.length !== expected) fail('Invalid Aseprite cel pixel data.');

  const pixels = new Uint32Array(width * height);

  for (let i = 0; i < pixels.length; i++) {
    const at = i * bytesPerPixel;

    if (depth === 32) {
      pixels[i] = pack(raw[at], raw[at + 1], raw[at + 2], raw[at + 3]);
    } else if (depth === 16) {
      pixels[i] = pack(raw[at], raw[at], raw[at], raw[at + 1]);
    } else {
      const index = raw[at];
      pixels[i] = index === transparentIndex ? 0 : (palette[index] ?? 0);
    }
  }

  return pixels;
}

function applyOpacity(pixels: Uint32Array, opacity: number): void {
  if (opacity === 255) return;

  for (let i = 0; i < pixels.length; i++) {
    const alpha = pixels[i] >>> 24;
    pixels[i] = withAlpha(pixels[i], Math.round((alpha * opacity) / 255));
  }
}

export async function fromAseprite(data: Uint8Array): Promise<AsepriteImportResult> {
  const header = parseHeader(data);
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const warnings = new Set<string>();

  const parsedLayers: ParsedLayer[] = [];
  const groups: LayerGroup[] = [];
  const groupStack: string[] = [];
  const rawFrames: RawCel[][] = [];
  let palette: number[] = [];
  let at = HEADER_SIZE;

  for (let f = 0; f < header.frames; f++) {
    assertRange(data, at, FRAME_HEADER_SIZE);

    const frameSize = view.getUint32(at, true);
    const magic = view.getUint16(at + 4, true);
    const oldChunks = view.getUint16(at + 6, true);
    const duration = view.getUint16(at + 8, true);
    const newChunks = view.getUint32(at + 12, true);
    const chunkCount = newChunks || oldChunks;
    const frameEnd = at + frameSize;

    if (magic !== FRAME_MAGIC || frameSize < FRAME_HEADER_SIZE || frameEnd > data.length) {
      fail('Invalid Aseprite frame header.');
    }

    if (chunkCount > 100_000) fail('Invalid Aseprite chunk count.');

    at += FRAME_HEADER_SIZE;
    const frameCels: RawCel[] = [];

    for (let c = 0; c < chunkCount; c++) {
      assertRange(data, at, 6);

      const chunkSize = view.getUint32(at, true);
      const chunkType = view.getUint16(at + 4, true);
      const start = at + 6;
      const end = at + chunkSize;

      if (chunkSize < 6 || end > frameEnd) fail('Invalid Aseprite chunk size.');

      if (chunkType === LAYER_CHUNK) {
        const layer = parseLayer(data, view, start, end, header, groups, groupStack, warnings);
        parsedLayers.push(layer);
      } else if (chunkType === PALETTE_CHUNK) {
        palette = parsePaletteChunk(data, view, start, end);
      } else if (chunkType === OLD_PALETTE_CHUNK || chunkType === OLD_PALETTE_6BIT_CHUNK) {
        if (!palette.length) {
          palette = parseOldPalette(data, view, start, end, chunkType === OLD_PALETTE_6BIT_CHUNK);
        }
      } else if (chunkType === CEL_CHUNK) {
        assertRange(data, start, 16);

        const layer = view.getUint16(start, true);
        const x = view.getInt16(start + 2, true);
        const y = view.getInt16(start + 4, true);
        const opacity = view.getUint8(start + 6);
        const type = view.getUint16(start + 7, true);

        if (type === 3) {
          warnings.add('Tilemaps were skipped.');
        } else if (type === 1) {
          assertRange(data, start + 16, 2);
          frameCels.push({
            type,
            layer,
            x,
            y,
            opacity,
            linkedFrame: view.getUint16(start + 16, true),
          });
        } else if (type === 0 || type === 2) {
          assertRange(data, start + 16, 4);
          const width = view.getUint16(start + 16, true);
          const height = view.getUint16(start + 18, true);
          const payload = data.subarray(start + 20, end);
          const raw = type === 2 ? await decompress(payload) : payload;

          frameCels.push({
            type,
            layer,
            x,
            y,
            opacity,
            width,
            height,
            pixels: decodePixels(raw, width, height, header.depth, palette, header.transparentIndex),
          });
        } else {
          fail(`Unsupported Aseprite cel type: ${type}.`);
        }
      }

      at = end;
    }

    if (at !== frameEnd) fail('Aseprite frame size does not match its chunks.');

    rawFrames.push(frameCels);

    if (duration < 10 || duration > 10_000) {
      warnings.add('Frame durations outside 10–10,000 ms were adjusted.');
    }
  }

  const layers: Layer[] = [];
  const layerMap: Array<ParsedLayer | undefined> = [];

  for (const parsed of parsedLayers) {
    if (parsed.type === 2) {
      layerMap.push(undefined);
      continue;
    }

    if (parsed.type === 1) {
      layerMap.push(parsed);
      continue;
    }

    const layer: Layer = {
      id: parsed.id,
      name: parsed.name,
      visible: parsed.visible,
      locked: parsed.locked,
      opacity: parsed.opacity,
      blendMode: parsed.blendMode,
      pixels: new Uint32Array(header.width * header.height),
      ...(parsed.group ? { group: parsed.group } : {}),
    };

    layers.push(layer);
    layerMap.push(parsed);
  }

  const framePixels: Array<Map<number, Uint32Array>> = rawFrames.map(() => new Map());

  const resolveCel = (frameIndex: number, cel: RawCel, seen = new Set<string>()): Uint32Array => {
    const key = `${frameIndex}:${cel.layer}`;
    if (seen.has(key)) fail('Circular linked cels in Aseprite file.');
    seen.add(key);

    if (cel.type !== 1) return cel.pixels!;

    const targetFrame = cel.linkedFrame!;
    if (targetFrame >= rawFrames.length) fail('Linked cel references a missing frame.');

    const target = rawFrames[targetFrame].find((item) => item.layer === cel.layer);
    if (!target) return new Uint32Array(header.width * header.height);

    return resolveCel(targetFrame, target, seen);
  };

  for (let f = 0; f < rawFrames.length; f++) {
    for (const cel of rawFrames[f]) {
      const parsedLayer = layerMap[cel.layer];
      if (!parsedLayer || parsedLayer.type !== 0) continue;

      const layerIndex = layers.findIndex((layer) => layer.id === parsedLayer.id);
      if (layerIndex < 0) continue;

      const source = resolveCel(f, cel);
      const pixels = new Uint32Array(header.width * header.height);

      const width = cel.width ?? header.width;
      const height = cel.height ?? header.height;

      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const dx = cel.x + x;
          const dy = cel.y + y;
          if (dx < 0 || dy < 0 || dx >= header.width || dy >= header.height) continue;
          pixels[dy * header.width + dx] = source[y * width + x];
        }
      }

      applyOpacity(pixels, cel.opacity);
      framePixels[f].set(layerIndex, pixels);
    }
  }

  const frames: Frame[] = rawFrames.map((_, index) => ({
    id: newId('frame'),
    duration: clampDuration(
      view.getUint16(
        HEADER_SIZE +
          rawFrames.slice(0, index).reduce((sum, _, f) => {
            const frameAt =
              HEADER_SIZE +
              rawFrames.slice(0, f).reduce((n, __, i) => n + view.getUint32(HEADER_SIZE + n, true), 0);
            return sum + view.getUint32(frameAt, true);
          }, 0) +
          8,
        true,
      ) ||
        header.speed ||
        100,
    ),
  }));

  const document = createDocument('Untitled', header.width, header.height);
  document.layers = layers.length ? layers : document.layers;
  document.groups = groups.length ? groups : undefined;
  document.frames = frames.length > 1 ? frames : undefined;
  document.activeFrame = 0;
  document.activeLayer = 0;
  document.layerCounter = layers.length;

  for (let i = 0; i < layers.length; i++) {
    layers[i].pixels = framePixels[0].get(i) ?? new Uint32Array(header.width * header.height);

    if (frames.length > 1) {
      layers[i].cels = frames.map((_, f) =>
        f === 0 ? null : { pixels: framePixels[f].get(i) ?? new Uint32Array(header.width * header.height) },
      );
    }
  }

  if (palette.length) {
    const colors = palette.slice(0, 256);
    document.palette = { key: 'custom', colors, custom: colors };
  }

  if (!layers.length) fail('The Aseprite file contains no supported image layers.');

  return { document, warnings: [...warnings] };
}
