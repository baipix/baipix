import { pack, withAlpha } from '../color';
import { createDocument, newId, MAX_SIZE, type Layer, type LayerGroup, type PixelDoc } from '../document';
import { clampDuration, DEFAULT_DURATION, MAX_FRAMES, type Frame } from '../frames';
import { MAX_GROUP_DEPTH, type LayerNode } from '../groups';
import { reframe } from '../outside';
import { compositeNodesToPixels } from '../composite';

const HEADER_SIZE = 128;
const FRAME_HEADER_SIZE = 16;
const FILE_MAGIC = 0xa5e0;
const FRAME_MAGIC = 0xf1fa;

const MAX_CEL_PIXELS = 4_194_304;
const MAX_USER_DATA_NESTING = 128;
// Combined budget for source cel data and full-canvas frame buffers.
const MAX_TOTAL_IMPORT_PIXELS = 16_777_216;

const LAYER_CHUNK = 0x2004;
const CEL_CHUNK = 0x2005;
const CEL_EXTRA_CHUNK = 0x2006;
const TAGS_CHUNK = 0x2018;
const USER_DATA_CHUNK = 0x2020;
const SLICE_CHUNK = 0x2022;
const OLD_PALETTE_CHUNK = 0x0004;
const OLD_PALETTE_6BIT_CHUNK = 0x0011;
const PALETTE_CHUNK = 0x2019;
const COLOR_PROFILE_CHUNK = 0x2007;
const EXTERNAL_FILES_CHUNK = 0x2008;
const TILESET_CHUNK = 0x2023;

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
  fileSize: number;
  width: number;
  height: number;
  frames: number;
  depth: ColorDepth;
  flags: number;
  speed: number;
  transparentIndex: number;
  pixelWidth: number;
  pixelHeight: number;
  gridX: number;
  gridY: number;
  gridWidth: number;
  gridHeight: number;
}

interface ParsedLayer {
  id: string;
  name: string;
  type: number;
  level: number;
  visible: boolean;
  locked: boolean;
  opacity: number;
  ownVisible: boolean;
  ownLocked: boolean;
  ownOpacity: number;
  blendMode?: (typeof BLEND_MODES)[number];
  group?: string;
  parentGroup?: string;
  background: boolean;
}

interface FlattenedGroupState {
  visible: boolean;
  locked: boolean;
  opacity: number;
}

interface RawCel {
  type: number;
  layer: number;
  x: number;
  y: number;
  opacity: number;
  width?: number;
  height?: number;
  raw?: Uint8Array;
  pixels?: Uint32Array;
  linkedFrame?: number;
  zIndex: number;
}

export type AsepriteWarningCode =
  | 'layerMovementLocks'
  | 'backgroundLayers'
  | 'referenceLayers'
  | 'unsupportedBlendModes'
  | 'deepGroupsFlattened'
  | 'deepGroupBlendModes'
  | 'tilemapsSkipped'
  | 'unsupportedLayerTypes'
  | 'pixelAspectRatio'
  | 'animationTags'
  | 'userData'
  | 'slices'
  | 'embeddedIccProfile'
  | 'customColorProfile'
  | 'celOrdering'
  | 'unsupportedCelTypes'
  | 'preciseCelBounds'
  | 'unsupportedCelExtraFlags'
  | 'frameDurations'
  | 'externalFiles'
  | 'tilesetsSkipped'
  | 'gridMetadata'
  | 'unsupportedChunks';

export interface AsepriteWarning {
  code: AsepriteWarningCode;
  values?: Record<string, string | number>;
}

export type AsepriteImportErrorCode =
  'unreadable' | 'canvasTooLarge' | 'tooManyFrames' | 'celTooLarge' | 'importTooLarge';

export interface AsepriteImportResult {
  document: PixelDoc;
  warnings: AsepriteWarning[];
}

export class AsepriteError extends Error {
  constructor(
    message: string,
    readonly code: AsepriteImportErrorCode = 'unreadable',
    readonly values?: Record<string, string | number>,
  ) {
    super(message);
    this.name = 'AsepriteError';
  }
}

function fail(message: string): never {
  throw new AsepriteError(message);
}

function failWith(
  message: string,
  code: Exclude<AsepriteImportErrorCode, 'unreadable'>,
  values: Record<string, string | number>,
): never {
  throw new AsepriteError(message, code, values);
}

type WarningCollector = (code: AsepriteWarningCode, values?: Record<string, string | number>) => void;

type ParsedNode =
  { kind: 'group'; parsed: ParsedLayer; children: ParsedNode[] } | { kind: 'layer'; parsed: ParsedLayer };

function buildParsedTree(parsedLayers: ParsedLayer[]): ParsedNode[] {
  const roots: ParsedNode[] = [];
  const stack: Array<{
    level: number;
    node: Extract<ParsedNode, { kind: 'group' }>;
  }> = [];

  for (const parsed of parsedLayers) {
    while (stack.length && stack[stack.length - 1].level >= parsed.level) {
      stack.pop();
    }

    const parent = stack[stack.length - 1];

    if (parsed.level > 0 && (!parent || parent.level !== parsed.level - 1)) {
      fail('Invalid Aseprite layer hierarchy.');
    }

    const node: ParsedNode =
      parsed.type === 1 ? { kind: 'group', parsed, children: [] } : { kind: 'layer', parsed };

    (parent?.node.children ?? roots).push(node);

    if (node.kind === 'group') {
      stack.push({ level: parsed.level, node });
    }
  }

  return roots;
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

function assertChunkRange(bytes: Uint8Array, offset: number, size: number, chunkEnd: number): void {
  assertRange(bytes, offset, size);

  if (
    !Number.isSafeInteger(chunkEnd) ||
    chunkEnd < 0 ||
    chunkEnd > bytes.length ||
    offset + size > chunkEnd
  ) {
    fail('Invalid Aseprite chunk size.');
  }
}

function readString(
  bytes: Uint8Array,
  view: DataView,
  offset: number,
  limit = bytes.length,
): { value: string; next: number } {
  assertChunkRange(bytes, offset, 2, limit);

  const length = view.getUint16(offset, true);

  assertChunkRange(bytes, offset + 2, length, limit);

  return {
    value: new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(offset + 2, offset + 2 + length)),
    next: offset + 2 + length,
  };
}

function parseTagsChunk(
  bytes: Uint8Array,
  view: DataView,
  start: number,
  end: number,
  frameCount: number,
): number {
  assertChunkRange(bytes, start, 10, end);

  const count = view.getUint16(start, true);
  let at = start + 10;

  assertChunkRange(bytes, at, count * 19, end);

  for (let i = 0; i < count; i++) {
    assertChunkRange(bytes, at, 17, end);

    const from = view.getUint16(at, true);
    const to = view.getUint16(at + 2, true);
    const direction = view.getUint8(at + 4);

    if (from > to || to >= frameCount || direction > 3) {
      fail('Invalid Aseprite animation tag.');
    }

    at += 17;
    at = readString(bytes, view, at, end).next;
  }

  if (at !== end) {
    fail('Invalid Aseprite animation tags chunk.');
  }

  return count;
}

function parsePropertiesMap(
  bytes: Uint8Array,
  view: DataView,
  start: number,
  end: number,
  depth: number,
): number {
  if (depth > MAX_USER_DATA_NESTING) {
    fail('Aseprite user data properties exceed the maximum nesting depth.');
  }

  assertChunkRange(bytes, start, 4, end);

  const count = view.getUint32(start, true);
  let at = start + 4;

  // Every property needs at least a string length and a type.
  if (count > Math.floor((end - at) / 4)) {
    fail('Invalid Aseprite user data property count.');
  }

  for (let i = 0; i < count; i++) {
    at = readString(bytes, view, at, end).next;

    assertChunkRange(bytes, at, 2, end);

    const type = view.getUint16(at, true);
    at += 2;

    at = parsePropertyValue(bytes, view, at, end, type, depth + 1);
  }

  return at;
}

function parsePropertyValue(
  bytes: Uint8Array,
  view: DataView,
  start: number,
  end: number,
  type: number,
  depth: number,
): number {
  if (depth > MAX_USER_DATA_NESTING) {
    fail('Aseprite user data properties exceed the maximum nesting depth.');
  }

  switch (type) {
    // bool, int8, uint8
    case 0x0001:
    case 0x0002:
    case 0x0003:
      assertChunkRange(bytes, start, 1, end);
      return start + 1;

    // int16, uint16
    case 0x0004:
    case 0x0005:
      assertChunkRange(bytes, start, 2, end);
      return start + 2;

    // int32, uint32, fixed, float
    case 0x0006:
    case 0x0007:
    case 0x000a:
    case 0x000b:
      assertChunkRange(bytes, start, 4, end);
      return start + 4;

    // int64, uint64, double
    case 0x0008:
    case 0x0009:
    case 0x000c:
      assertChunkRange(bytes, start, 8, end);
      return start + 8;

    // string
    case 0x000d:
      return readString(bytes, view, start, end).next;

    // point, size
    case 0x000e:
    case 0x000f:
      assertChunkRange(bytes, start, 8, end);
      return start + 8;

    // rectangle
    case 0x0010:
      assertChunkRange(bytes, start, 16, end);
      return start + 16;

    // vector
    case 0x0011: {
      assertChunkRange(bytes, start, 6, end);

      const count = view.getUint32(start, true);
      const elementType = view.getUint16(start + 4, true);

      let at = start + 6;

      if (elementType === 0) {
        // Mixed-type vectors store the type before each element.
        if (count > Math.floor((end - at) / 2)) {
          fail('Invalid Aseprite user data vector size.');
        }

        for (let i = 0; i < count; i++) {
          assertChunkRange(bytes, at, 2, end);

          const itemType = view.getUint16(at, true);
          at += 2;

          at = parsePropertyValue(bytes, view, at, end, itemType, depth + 1);
        }
      } else {
        if (elementType > 0x0013 || count > end - at) {
          fail('Invalid Aseprite user data vector type or size.');
        }

        // Homogeneous vectors store their element type only once.
        for (let i = 0; i < count; i++) {
          at = parsePropertyValue(bytes, view, at, end, elementType, depth + 1);
        }
      }

      return at;
    }

    // Nested properties map
    case 0x0012:
      return parsePropertiesMap(bytes, view, start, end, depth);

    // UUID
    case 0x0013:
      assertChunkRange(bytes, start, 16, end);
      return start + 16;

    default:
      fail(`Unsupported Aseprite user data property type: ${type}.`);
  }
}

function parseUserDataChunk(bytes: Uint8Array, view: DataView, start: number, end: number): boolean {
  assertChunkRange(bytes, start, 4, end);

  const flags = view.getUint32(start, true);
  const hasUnknownFlags = (flags & ~7) !== 0;

  let at = start + 4;

  if (flags & 1) {
    at = readString(bytes, view, at, end).next;
  }

  if (flags & 2) {
    assertChunkRange(bytes, at, 4, end);
    at += 4;
  }

  if (flags & 4) {
    assertChunkRange(bytes, at, 8, end);
    const propertiesSize = view.getUint32(at, true);

    if (propertiesSize < 8) {
      fail('Invalid Aseprite user data properties.');
    }

    assertChunkRange(bytes, at, propertiesSize, end);

    const propertiesEnd = at + propertiesSize;
    const mapCount = view.getUint32(at + 4, true);

    at += 8;

    // Every map needs an extension ID and a property count.
    if (mapCount > Math.floor((propertiesEnd - at) / 8)) {
      fail('Invalid Aseprite user data properties map count.');
    }

    for (let i = 0; i < mapCount; i++) {
      assertChunkRange(bytes, at, 4, propertiesEnd);

      // Extension entry ID.
      at += 4;
      at = parsePropertiesMap(bytes, view, at, propertiesEnd, 0);
    }

    if (at !== propertiesEnd) {
      fail('Invalid Aseprite user data properties size.');
    }

    at = propertiesEnd;
  }

  if (at > end) {
    fail('Invalid Aseprite user data chunk.');
  }

  if (!hasUnknownFlags && at !== end) {
    fail('Invalid Aseprite user data chunk.');
  }

  return flags !== 0;
}

function parseExternalFilesChunk(bytes: Uint8Array, view: DataView, start: number, end: number): number {
  assertChunkRange(bytes, start, 12, end);

  const count = view.getUint32(start, true);
  let at = start + 12;

  for (let i = 0; i < count; i++) {
    assertChunkRange(bytes, at, 12, end);
    at += 12;
    at = readString(bytes, view, at, end).next;
  }

  if (at !== end) {
    fail('Invalid Aseprite external files chunk.');
  }

  return count;
}

function parseTilesetChunk(bytes: Uint8Array, view: DataView, start: number, end: number): void {
  assertChunkRange(bytes, start, 34, end);

  const flags = view.getUint32(start + 4, true);
  let at = readString(bytes, view, start + 32, end).next;

  if (flags & 1) {
    assertChunkRange(bytes, at, 8, end);
    at += 8;
  }

  if (flags & 2) {
    assertChunkRange(bytes, at, 4, end);

    const dataSize = view.getUint32(at, true);
    at += 4;

    assertChunkRange(bytes, at, dataSize, end);
    at += dataSize;
  }

  if (at !== end) {
    fail('Invalid Aseprite tileset chunk.');
  }
}

function parseSliceChunk(
  bytes: Uint8Array,
  view: DataView,
  start: number,
  end: number,
  frameCount: number,
): number {
  assertChunkRange(bytes, start, 12, end);

  const keyCount = view.getUint32(start, true);
  const flags = view.getUint32(start + 4, true);
  const hasNinePatch = (flags & 1) !== 0;
  const hasPivot = (flags & 2) !== 0;
  const hasUnknownFlags = (flags & ~3) !== 0;

  let at = readString(bytes, view, start + 12, end).next;

  const keySize = 20 + (hasNinePatch ? 16 : 0) + (hasPivot ? 8 : 0);
  assertChunkRange(bytes, at, keyCount * keySize, end);

  for (let i = 0; i < keyCount; i++) {
    const frame = view.getUint32(at, true);

    if (frame >= frameCount) {
      fail('Invalid Aseprite slice frame reference.');
    }

    at += 20;

    if (hasNinePatch) {
      at += 16;
    }

    if (hasPivot) {
      at += 8;
    }
  }

  if (!hasUnknownFlags && at !== end) {
    fail('Invalid Aseprite slice chunk.');
  }

  return keyCount;
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
    failWith('Canvas size exceeds the supported limit.', 'canvasTooLarge', { width, height, max: MAX_SIZE });
  }

  if (frames > MAX_FRAMES) {
    failWith('Frame count exceeds the supported limit.', 'tooManyFrames', { count: frames, max: MAX_FRAMES });
  }

  if (depth !== 8 && depth !== 16 && depth !== 32) {
    fail(`Unsupported Aseprite color depth: ${depth}.`);
  }

  return {
    fileSize,
    width,
    height,
    frames,
    depth,
    flags: view.getUint32(14, true),
    speed: view.getUint16(18, true),
    transparentIndex: view.getUint8(28),
    pixelWidth: view.getUint8(34),
    pixelHeight: view.getUint8(35),
    gridX: view.getInt16(36, true),
    gridY: view.getInt16(38, true),
    gridWidth: view.getUint16(40, true),
    gridHeight: view.getUint16(42, true),
  };
}

function parsePaletteChunk(
  bytes: Uint8Array,
  view: DataView,
  start: number,
  end: number,
  colors: number[],
): void {
  assertChunkRange(bytes, start, 20, end);

  const total = view.getUint32(start, true);
  const first = view.getUint32(start + 4, true);
  const last = view.getUint32(start + 8, true);

  if (total > 256 || first > last || last >= total) {
    fail('Invalid Aseprite palette.');
  }

  const previousLength = colors.length;
  colors.length = total;

  for (let i = previousLength; i < total; i++) {
    colors[i] = 0;
  }

  let at = start + 20;

  for (let i = first; i <= last; i++) {
    assertChunkRange(bytes, at, 6, end);

    const flags = view.getUint16(at, true);

    colors[i] = pack(
      view.getUint8(at + 2),
      view.getUint8(at + 3),
      view.getUint8(at + 4),
      view.getUint8(at + 5),
    );

    at += 6;

    if (flags & 1) {
      at = readString(bytes, view, at, end).next;
    }
  }
}

function parseOldPalette(
  bytes: Uint8Array,
  view: DataView,
  start: number,
  end: number,
  sixBit: boolean,
): number[] {
  assertChunkRange(bytes, start, 2, end);

  const packets = view.getUint16(start, true);
  const colors: number[] = [];

  let at = start + 2;
  let index = 0;

  for (let p = 0; p < packets; p++) {
    assertChunkRange(bytes, at, 2, end);

    index += view.getUint8(at);

    const count = view.getUint8(at + 1) || 256;
    at += 2;

    if (index + count > 256) {
      fail('Invalid legacy Aseprite palette.');
    }

    for (let i = 0; i < count; i++) {
      assertChunkRange(bytes, at, 3, end);

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
  flattenedGroupStack: FlattenedGroupState[],
  warn: WarningCollector,
): ParsedLayer {
  assertChunkRange(bytes, start, 18, end);

  const flags = view.getUint16(start, true);

  if (flags & 4) {
    warn('layerMovementLocks');
  }

  if (flags & 8) {
    warn('backgroundLayers');
  }

  if (flags & 64) {
    warn('referenceLayers');
  }

  const type = view.getUint16(start + 2, true);
  const level = view.getUint16(start + 4, true);
  const blend = view.getUint16(start + 10, true);
  const opacity = view.getUint8(start + 12);

  const groupDepth = Math.min(level, MAX_GROUP_DEPTH);
  groupStack.length = groupDepth;

  if (groupDepth > 0 && !groupStack[groupDepth - 1]) {
    fail('Invalid Aseprite layer hierarchy.');
  }

  const flattenedDepth = Math.max(0, level - MAX_GROUP_DEPTH);
  flattenedGroupStack.length = flattenedDepth;

  const name = readString(bytes, view, start + 16, end);

  let next = name.next;

  if (type === 2) {
    assertChunkRange(bytes, next, 4, end);
    next += 4;
  }

  if (header.flags & 4) {
    assertChunkRange(bytes, next, 16, end);
    next += 16;
  }

  const id = newId(type === 1 ? 'group' : 'layer');

  const actualOpacity =
    type === 1 && !(header.flags & 2) ? 255 : type !== 1 && !(header.flags & 1) ? 255 : opacity;

  const ownVisible = !!(flags & 1);
  const ownLocked = !(flags & 2);
  const ownOpacity = actualOpacity / 255;

  const inheritedVisible = flattenedGroupStack.every((group) => group.visible);
  const inheritedLocked = flattenedGroupStack.some((group) => group.locked);
  const inheritedOpacity = flattenedGroupStack.reduce((value, group) => value * group.opacity, 1);

  const hasValidBlendMode = type !== 1 || !!(header.flags & 2);
  const blendMode = hasValidBlendMode ? (BLEND_MODES[blend] ?? 'normal') : undefined;

  if (hasValidBlendMode && blend > 11) {
    warn('unsupportedBlendModes');
  }

  const parsed: ParsedLayer = {
    id,
    name: name.value,
    type,
    level,
    visible: ownVisible && inheritedVisible,
    locked: ownLocked || inheritedLocked,
    opacity: ownOpacity * inheritedOpacity,
    ownVisible,
    ownLocked,
    ownOpacity,
    parentGroup: groupDepth > 0 ? groupStack[groupDepth - 1] : undefined,
    background: !!(flags & 8),
    ...(blendMode !== undefined ? { blendMode } : {}),
  };

  if (type === 1) {
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
      warn('deepGroupsFlattened');

      if (blendMode && blendMode !== 'normal') {
        warn('deepGroupBlendModes');
      }

      flattenedGroupStack.push({
        visible: ownVisible,
        locked: ownLocked,
        opacity: ownOpacity,
      });
    }

    return parsed;
  }

  if (type === 2) {
    warn('tilemapsSkipped');
    return parsed;
  }

  if (type !== 0) {
    warn('unsupportedLayerTypes');
    return parsed;
  }

  if (level > MAX_GROUP_DEPTH) {
    warn('deepGroupsFlattened');
  }

  parsed.group = groupDepth > 0 ? groupStack[groupDepth - 1] : undefined;

  return parsed;
}

function celByteLength(width: number, height: number, depth: ColorDepth): number {
  const pixelCount = width * height;

  if (!width || !height || !Number.isSafeInteger(pixelCount) || pixelCount > MAX_CEL_PIXELS) {
    failWith('Aseprite cel exceeds the maximum import area.', 'celTooLarge', { max: MAX_CEL_PIXELS });
  }

  return pixelCount * (depth / 8);
}

function assertImportPixelBudget(
  totalCelPixels: number,
  imageLayerCount: number,
  header: AsepriteHeader,
): void {
  const documentPixels = header.width * header.height * Math.max(1, imageLayerCount) * header.frames;

  const totalPixels = documentPixels + totalCelPixels;

  if (!Number.isSafeInteger(totalPixels) || totalPixels > MAX_TOTAL_IMPORT_PIXELS) {
    failWith('Aseprite file exceeds the total import memory budget.', 'importTooLarge', {
      max: MAX_TOTAL_IMPORT_PIXELS,
    });
  }
}

async function decompress(data: Uint8Array, expectedSize: number): Promise<Uint8Array> {
  try {
    const stream = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate'));

    const reader = stream.getReader();
    const output = new Uint8Array(expectedSize);

    let offset = 0;

    try {
      while (true) {
        const { done, value } = await reader.read();

        if (done) break;

        if (offset + value.byteLength > expectedSize) {
          await reader.cancel().catch(() => undefined);
          fail('Decompressed Aseprite cel data exceeds its declared dimensions.');
        }

        output.set(value, offset);
        offset += value.byteLength;
      }
    } finally {
      reader.releaseLock();
    }

    if (offset !== expectedSize) {
      fail('Invalid Aseprite cel pixel data.');
    }

    return output;
  } catch (error) {
    if (error instanceof AsepriteError) throw error;

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
  background: boolean,
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

      if (!background && index === transparentIndex) {
        pixels[i] = 0;
        continue;
      }

      const color = palette[index];

      if (color === undefined) {
        fail('Indexed Aseprite cel references a missing palette entry.');
      }

      pixels[i] = color;
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
  const bytes = data.subarray(0, header.fileSize);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  const warnings = new Map<AsepriteWarningCode, AsepriteWarning>();

  const warn: WarningCollector = (code, values) => {
    if (!warnings.has(code)) {
      warnings.set(code, {
        code,
        ...(values ? { values } : {}),
      });
    }
  };

  if (header.pixelWidth !== 0 && header.pixelHeight !== 0 && header.pixelWidth !== header.pixelHeight) {
    warn('pixelAspectRatio', {
      width: header.pixelWidth,
      height: header.pixelHeight,
    });
  }

  const hasGrid = header.gridWidth !== 0 || header.gridHeight !== 0;

  const isDefaultGrid =
    header.gridX === 0 && header.gridY === 0 && header.gridWidth === 16 && header.gridHeight === 16;

  if (hasGrid && !isDefaultGrid) {
    warn('gridMetadata', {
      x: header.gridX,
      y: header.gridY,
      width: header.gridWidth,
      height: header.gridHeight,
    });
  }

  const parsedLayers: ParsedLayer[] = [];
  const groups: LayerGroup[] = [];
  const groupStack: string[] = [];
  const flattenedGroupStack: FlattenedGroupState[] = [];
  const rawFrames: RawCel[][] = [];
  const palette: number[] = [];
  const legacyPalette: number[] = [];
  const framePalettes: number[][] = [];
  const frameLegacyPalettes: number[][] = [];
  const frameDurations: number[] = [];

  let at = HEADER_SIZE;
  let hasNewPalette = false;
  let hasReadCel = false;
  let totalCelPixels = 0;

  const unsupportedChunkTypes = new Set<number>();

  for (let f = 0; f < header.frames; f++) {
    assertRange(bytes, at, FRAME_HEADER_SIZE);

    const frameSize = view.getUint32(at, true);
    const magic = view.getUint16(at + 4, true);
    const oldChunks = view.getUint16(at + 6, true);
    const duration = view.getUint16(at + 8, true);
    frameDurations.push(duration);
    const newChunks = view.getUint32(at + 12, true);
    // Prefer the extended count when present; otherwise use the legacy field.
    const chunkCount = newChunks || oldChunks;
    const frameEnd = at + frameSize;

    if (magic !== FRAME_MAGIC || frameSize < FRAME_HEADER_SIZE || frameEnd > bytes.length) {
      fail('Invalid Aseprite frame header.');
    }

    if (chunkCount > 100_000) fail('Invalid Aseprite chunk count.');

    at += FRAME_HEADER_SIZE;
    const frameCels: RawCel[] = [];

    for (let c = 0; c < chunkCount; c++) {
      assertChunkRange(bytes, at, 6, frameEnd);

      const chunkSize = view.getUint32(at, true);
      const chunkType = view.getUint16(at + 4, true);
      const start = at + 6;
      const end = at + chunkSize;

      if (chunkSize < 6 || end > frameEnd) fail('Invalid Aseprite chunk size.');

      if (chunkType === LAYER_CHUNK) {
        if (f !== 0) {
          fail('Unexpected Aseprite layer chunk outside the first frame.');
        }

        const layer = parseLayer(
          bytes,
          view,
          start,
          end,
          header,
          groups,
          groupStack,
          flattenedGroupStack,
          warn,
        );

        parsedLayers.push(layer);
      } else if (chunkType === PALETTE_CHUNK) {
        hasNewPalette = true;
        parsePaletteChunk(bytes, view, start, end, palette);
      } else if (chunkType === OLD_PALETTE_CHUNK || chunkType === OLD_PALETTE_6BIT_CHUNK) {
        const parsed = parseOldPalette(bytes, view, start, end, chunkType === OLD_PALETTE_6BIT_CHUNK);

        for (let i = 0; i < parsed.length; i++) {
          if (i in parsed) {
            legacyPalette[i] = parsed[i];
          }
        }
      } else if (chunkType === TAGS_CHUNK) {
        const tagCount = parseTagsChunk(bytes, view, start, end, header.frames);

        if (tagCount > 0) {
          warn('animationTags');
        }
      } else if (chunkType === USER_DATA_CHUNK) {
        if (parseUserDataChunk(bytes, view, start, end)) {
          warn('userData');
        }
      } else if (chunkType === SLICE_CHUNK) {
        const keyCount = parseSliceChunk(bytes, view, start, end, header.frames);

        if (keyCount > 0) {
          warn('slices');
        }
      } else if (chunkType === EXTERNAL_FILES_CHUNK) {
        const count = parseExternalFilesChunk(bytes, view, start, end);

        if (count > 0) {
          warn('externalFiles');
        }
      } else if (chunkType === TILESET_CHUNK) {
        parseTilesetChunk(bytes, view, start, end);
        warn('tilesetsSkipped');
      } else if (chunkType === COLOR_PROFILE_CHUNK) {
        assertChunkRange(bytes, start, 16, end);

        const profileType = view.getUint16(start, true);
        const profileFlags = view.getUint16(start + 2, true);

        if (profileType === 2) {
          assertChunkRange(bytes, start + 16, 4, end);
          const profileSize = view.getUint32(start + 16, true);
          assertChunkRange(bytes, start + 20, profileSize, end);

          if (start + 20 + profileSize !== end) {
            fail('Invalid Aseprite color profile.');
          }

          warn('embeddedIccProfile');
        } else if (profileType > 2 || profileFlags & 1) {
          warn('customColorProfile');
        }
      } else if (chunkType === CEL_CHUNK) {
        hasReadCel = true;
        assertChunkRange(bytes, start, 16, end);

        const layer = view.getUint16(start, true);
        const x = view.getInt16(start + 2, true);
        const y = view.getInt16(start + 4, true);
        const opacity = view.getUint8(start + 6);
        const type = view.getUint16(start + 7, true);

        const zIndex = view.getInt16(start + 9, true);

        if (zIndex !== 0) {
          warn('celOrdering');
        }

        if (type === 3) {
          warn('tilemapsSkipped');
        } else if (type === 1) {
          assertChunkRange(bytes, start + 16, 2, end);

          frameCels.push({
            type,
            layer,
            y,
            x,
            opacity,
            linkedFrame: view.getUint16(start + 16, true),
            zIndex,
          });
        } else if (type === 0 || type === 2) {
          assertChunkRange(bytes, start + 16, 4, end);

          const width = view.getUint16(start + 16, true);
          const height = view.getUint16(start + 18, true);

          const expectedSize = celByteLength(width, height, header.depth);
          const celPixels = width * height;

          if (totalCelPixels > MAX_TOTAL_IMPORT_PIXELS - celPixels) {
            failWith('Aseprite file exceeds the total import memory budget.', 'importTooLarge', {
              max: MAX_TOTAL_IMPORT_PIXELS,
            });
          }

          totalCelPixels += celPixels;

          const payload = bytes.subarray(start + 20, end);

          const raw = type === 2 ? await decompress(payload, expectedSize) : payload;

          if (raw.length !== expectedSize) {
            fail('Invalid Aseprite cel pixel data.');
          }

          frameCels.push({
            type,
            layer,
            x,
            y,
            opacity,
            width,
            height,
            raw,
            zIndex,
          });
        } else {
          warn('unsupportedCelTypes');
        }
      } else if (chunkType === CEL_EXTRA_CHUNK) {
        if (!hasReadCel) {
          fail('Aseprite cel extra chunk has no preceding cel.');
        }
        assertChunkRange(bytes, start, 4, end);

        const flags = view.getUint32(start, true);
        const hasPreciseBounds = (flags & 1) !== 0;

        assertChunkRange(bytes, start, hasPreciseBounds ? 36 : 20, end);

        if (hasPreciseBounds) {
          warn('preciseCelBounds');
        }

        if (flags >>> 1 !== 0) {
          warn('unsupportedCelExtraFlags');
        }
      } else {
        unsupportedChunkTypes.add(chunkType);
      }

      at = end;
    }

    if (at !== frameEnd) fail('Aseprite frame size does not match its chunks.');

    framePalettes.push([...palette]);
    frameLegacyPalettes.push([...legacyPalette]);
    rawFrames.push(frameCels);

    const effectiveDuration = duration || header.speed || DEFAULT_DURATION;

    if (effectiveDuration < 10 || effectiveDuration > 10_000) {
      warn('frameDurations');
    }
  }

  if (unsupportedChunkTypes.size) {
    const types = [...unsupportedChunkTypes];

    warn('unsupportedChunks', {
      count: types.length,
      types: types
        .slice(0, 5)
        .map((type) => `0x${type.toString(16).padStart(4, '0')}`)
        .join(', '),
    });
  }

  if (!hasNewPalette) {
    for (let i = 0; i < legacyPalette.length; i++) {
      if (!(i in legacyPalette)) continue;

      palette[i] = legacyPalette[i];
    }

    for (let frame = 0; frame < framePalettes.length; frame++) {
      const legacyFramePalette = frameLegacyPalettes[frame];

      for (let i = 0; i < legacyFramePalette.length; i++) {
        if (!(i in legacyFramePalette)) continue;

        framePalettes[frame][i] = legacyFramePalette[i];
      }
    }
  }

  const layers: Layer[] = [];
  const layerMap: Array<ParsedLayer | undefined> = [];

  if (at !== bytes.length) {
    fail('Aseprite file size does not match its frames.');
  }

  for (const parsed of parsedLayers) {
    if (parsed.type !== 0 && parsed.type !== 1) {
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
      ...(parsed.blendMode ? { blendMode: parsed.blendMode } : {}),
      pixels: new Uint32Array(header.width * header.height),
      ...(parsed.group ? { group: parsed.group } : {}),
    };

    layers.push(layer);
    layerMap.push(parsed);
  }

  assertImportPixelBudget(totalCelPixels, layers.length, header);
  const framePixels: Array<Map<number, ReturnType<typeof reframe>>> = rawFrames.map(() => new Map());

  const resolveCel = (
    frameIndex: number,
    cel: RawCel,
    seen = new Set<string>(),
  ): { pixels: Uint32Array; width: number; height: number } => {
    const key = `${frameIndex}:${cel.layer}`;

    if (seen.has(key)) fail('Circular linked cels in Aseprite file.');
    seen.add(key);

    if (cel.type !== 1) {
      if (!cel.pixels || !cel.width || !cel.height) {
        fail('Invalid Aseprite cel data.');
      }

      return {
        pixels: cel.pixels,
        width: cel.width,
        height: cel.height,
      };
    }

    const targetFrame = cel.linkedFrame!;

    if (targetFrame >= rawFrames.length || targetFrame >= frameIndex) {
      fail('Linked cel references an invalid frame.');
    }

    const target = rawFrames[targetFrame].find((item) => item.layer === cel.layer);

    if (!target) fail('Linked cel references a missing cel.');

    return resolveCel(targetFrame, target, seen);
  };

  if (header.depth === 8 && framePalettes.some((framePalette) => !framePalette.length)) {
    fail('Indexed Aseprite file is missing a palette.');
  }

  for (let f = 0; f < rawFrames.length; f++) {
    for (const cel of rawFrames[f]) {
      if (cel.type === 1) continue;

      if (cel.raw === undefined || cel.width === undefined || cel.height === undefined) {
        fail('Invalid Aseprite cel data.');
      }

      const parsedLayer = parsedLayers[cel.layer];

      if (!parsedLayer) {
        fail('Aseprite cel references an invalid layer.');
      }

      if (parsedLayer.type !== 0) {
        fail('Aseprite cel references a non-image layer.');
      }

      cel.pixels = decodePixels(
        cel.raw,
        cel.width,
        cel.height,
        header.depth,
        framePalettes[f],
        header.transparentIndex,
        parsedLayer.background,
      );

      delete cel.raw;
    }
  }

  for (let f = 0; f < rawFrames.length; f++) {
    for (const cel of rawFrames[f]) {
      if (cel.layer >= layerMap.length) {
        fail('Aseprite cel references an invalid layer.');
      }

      const parsedLayer = layerMap[cel.layer];

      if (!parsedLayer) continue;

      if (parsedLayer.type !== 0) {
        fail('Aseprite cel references a non-image layer.');
      }

      const layerIndex = layers.findIndex((layer) => layer.id === parsedLayer.id);
      if (layerIndex < 0) continue;

      const source = resolveCel(f, cel);
      const sourcePixels = source.pixels.slice();

      applyOpacity(sourcePixels, cel.opacity);

      const placed = reframe(
        sourcePixels,
        source.width,
        source.height,
        undefined,
        cel.x,
        cel.y,
        header.width,
        header.height,
      );

      framePixels[f].set(layerIndex, placed);
    }
  }

  const parsedTree = buildParsedTree(parsedLayers);

  const sourceLayerIndexById = new Map<string, number>();

  layers.forEach((layer, index) => {
    sourceLayerIndexById.set(layer.id, index);
  });

  const outputLayers: Layer[] = [];

  const outputFramePixels: Array<Map<number, ReturnType<typeof reframe>>> = rawFrames.map(() => new Map());

  function sourceIndexesIn(nodes: ParsedNode[]): number[] {
    const indexes: number[] = [];

    for (const node of nodes) {
      if (node.kind === 'group') {
        indexes.push(...sourceIndexesIn(node.children));
        continue;
      }

      if (node.parsed.type !== 0) continue;

      const index = sourceLayerIndexById.get(node.parsed.id);

      if (index !== undefined) indexes.push(index);
    }

    return indexes;
  }

  function compositeBounds(
    indexes: number[],
    frame: number,
  ): { x: number; y: number; width: number; height: number } {
    let x = 0;
    let y = 0;
    let right = header.width;
    let bottom = header.height;

    for (const index of indexes) {
      const outside = framePixels[frame].get(index)?.outside;

      if (!outside) continue;

      x = Math.min(x, outside.x);
      y = Math.min(y, outside.y);
      right = Math.max(right, outside.x + outside.w);
      bottom = Math.max(bottom, outside.y + outside.h);
    }

    return {
      x,
      y,
      width: right - x,
      height: bottom - y,
    };
  }

  function expandSourcePixels(
    index: number,
    frame: number,
    bounds: { x: number; y: number; width: number; height: number },
  ): Uint32Array {
    const pixels = new Uint32Array(bounds.width * bounds.height);
    const placed = framePixels[frame].get(index);

    if (!placed) return pixels;

    for (let y = 0; y < header.height; y++) {
      pixels.set(
        placed.pixels.subarray(y * header.width, (y + 1) * header.width),
        (y - bounds.y) * bounds.width - bounds.x,
      );
    }

    const outside = placed.outside;

    if (outside) {
      for (let y = 0; y < outside.h; y++) {
        for (let x = 0; x < outside.w; x++) {
          const px = outside.x + x;
          const py = outside.y + y;

          if (px >= 0 && py >= 0 && px < header.width && py < header.height) {
            continue;
          }

          const dx = px - bounds.x;
          const dy = py - bounds.y;

          if (dx < 0 || dy < 0 || dx >= bounds.width || dy >= bounds.height) {
            continue;
          }

          pixels[dy * bounds.width + dx] = outside.pixels[y * outside.w + x];
        }
      }
    }

    return pixels;
  }

  function buildCompositeNodes(
    nodes: ParsedNode[],
    frame: number,
    bounds: { x: number; y: number; width: number; height: number },
  ): LayerNode[] {
    const result: LayerNode[] = [];

    for (const node of nodes) {
      const parsed = node.parsed;

      if (node.kind === 'group') {
        const group: LayerGroup = {
          id: parsed.id,
          name: parsed.name,
          visible: parsed.ownVisible,
          locked: parsed.ownLocked,
          opacity: parsed.ownOpacity,
          ...(parsed.blendMode !== undefined ? { blendMode: parsed.blendMode } : {}),
        };

        result.push({
          kind: 'group',
          group,
          children: buildCompositeNodes(node.children, frame, bounds),
        });

        continue;
      }

      if (parsed.type !== 0) continue;

      const sourceIndex = sourceLayerIndexById.get(parsed.id);

      if (sourceIndex === undefined) continue;

      const layer: Layer = {
        id: parsed.id,
        name: parsed.name,
        visible: parsed.ownVisible,
        locked: parsed.ownLocked,
        opacity: parsed.ownOpacity,
        ...(parsed.blendMode !== undefined ? { blendMode: parsed.blendMode } : {}),
        pixels: expandSourcePixels(sourceIndex, frame, bounds),
      };

      result.push({
        kind: 'layer',
        layer,
        index: sourceIndex,
      });
    }

    return result;
  }

  function appendOutputNodes(nodes: ParsedNode[]): void {
    for (const node of nodes) {
      const parsed = node.parsed;

      if (node.kind === 'group') {
        const isDeep = parsed.level >= MAX_GROUP_DEPTH;
        const isIsolated = parsed.blendMode !== undefined || parsed.ownOpacity !== 1;

        if (!isDeep || !isIsolated) {
          appendOutputNodes(node.children);
          continue;
        }

        const sourceIndexes = sourceIndexesIn(node.children);

        if (!sourceIndexes.length) continue;

        const outputIndex = outputLayers.length;

        outputLayers.push({
          id: newId('layer'),
          name: parsed.name,
          visible: parsed.visible,
          locked: parsed.locked,
          opacity: parsed.opacity,
          blendMode: parsed.blendMode ?? 'normal',
          pixels: new Uint32Array(header.width * header.height),
          ...(parsed.parentGroup ? { group: parsed.parentGroup } : {}),
        });

        for (let frame = 0; frame < rawFrames.length; frame++) {
          const bounds = compositeBounds(sourceIndexes, frame);
          const nodes = buildCompositeNodes(node.children, frame, bounds);
          const pixels = compositeNodesToPixels(nodes, bounds.width, bounds.height);

          const placed = reframe(
            pixels,
            bounds.width,
            bounds.height,
            undefined,
            bounds.x,
            bounds.y,
            header.width,
            header.height,
          );

          outputFramePixels[frame].set(outputIndex, placed);
        }

        continue;
      }

      if (parsed.type !== 0) continue;

      const sourceIndex = sourceLayerIndexById.get(parsed.id);

      if (sourceIndex === undefined) continue;

      const outputIndex = outputLayers.length;

      outputLayers.push(layers[sourceIndex]);

      for (let frame = 0; frame < rawFrames.length; frame++) {
        const placed = framePixels[frame].get(sourceIndex);

        if (placed) {
          outputFramePixels[frame].set(outputIndex, placed);
        }
      }
    }
  }

  appendOutputNodes(parsedTree);

  const frames: Frame[] = rawFrames.map((_, index) => ({
    id: newId('frame'),
    duration: clampDuration(frameDurations[index] || header.speed || DEFAULT_DURATION),
  }));

  const document = createDocument('Untitled', header.width, header.height);

  const finalLayers = outputLayers.length ? outputLayers : document.layers;

  document.layers = finalLayers;
  document.groups = outputLayers.length && groups.length ? groups : undefined;
  document.frames = frames.length > 1 ? frames : undefined;
  document.activeFrame = 0;
  document.activeLayer = 0;
  document.layerCounter = finalLayers.length;

  for (let i = 0; i < finalLayers.length; i++) {
    const firstFrame = outputFramePixels[0].get(i);

    finalLayers[i].pixels = firstFrame?.pixels ?? new Uint32Array(header.width * header.height);

    if (firstFrame?.outside) {
      finalLayers[i].outside = firstFrame.outside;
    } else {
      delete finalLayers[i].outside;
    }

    if (frames.length > 1) {
      finalLayers[i].cels = frames.map((_, f) => {
        if (f === 0) return null;

        const cel = outputFramePixels[f].get(i);

        return cel
          ? {
              pixels: cel.pixels,
              ...(cel.outside ? { outside: cel.outside } : {}),
            }
          : { pixels: new Uint32Array(header.width * header.height) };
      });
    }
  }

  if (palette.length) {
    const colors = palette.slice(0, 256);
    document.palette = { key: 'custom', colors, custom: colors };
  }

  if (palette.length) {
    const colors = palette.slice(0, 256);
    document.palette = { key: 'custom', colors, custom: colors };
  }

  return { document, warnings: [...warnings.values()] };
}
