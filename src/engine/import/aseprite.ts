// Importer for Aseprite (.ase/.aseprite) files.
// File format specification: https://github.com/aseprite/aseprite/blob/main/docs/ase-file-specs.md
// Aseprite stores multi-byte values in little-endian byte order; DataView calls use `true` accordingly.

import { pack, withAlpha } from '../color';
import { createDocument, newId, MAX_SIZE, type Layer, type LayerGroup, type PixelDoc } from '../document';
import { clampDuration, DEFAULT_DURATION, MAX_FRAMES, type Frame } from '../frames';
import { MAX_GROUP_DEPTH } from '../groups';
import { reframe } from '../outside';

const HEADER_SIZE = 128;
const FRAME_HEADER_SIZE = 16;

const FILE_MAGIC = 0xa5e0;
const FRAME_MAGIC = 0xf1fa;

// Maximum pixel area of a single cel (2048 × 2048), not a cumulative document limit.
const MAX_CEL_PIXELS = 4_194_304;
// Aseprite specifies a maximum nesting depth of 128 levels for user-data properties.
const MAX_USER_DATA_NESTING = 128;

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

/** Blend mode IDs 0–11 from the Aseprite specification; later IDs are unsupported. */
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

/** Bits per pixel: 8 indexed, 16 grayscale, 32 RGBA. */
type ColorDepth = 8 | 16 | 32;

interface AsepriteHeader {
  fileSize: number;
  width: number;
  height: number;
  frames: number;
  depth: ColorDepth;
  /** Header flags: 1 = layer opacity, 2 = group opacity/blend mode, 4 = layer UUIDs. */
  flags: number;
  /** Deprecated file-level frame speed; used only when an individual frame has no duration. */
  speed: number;
  /** Transparent palette index; meaningful for indexed images, except on background layers. */
  transparentIndex: number;
  /** Pixel aspect-ratio numerator; zero is treated as the default 1:1 ratio. */
  pixelWidth: number;
  /** Pixel aspect-ratio denominator; zero is treated as the default 1:1 ratio. */
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
  /** Effective values after inheriting state from groups that are flattened. */
  visible: boolean;
  locked: boolean;
  opacity: number;
  /** Values stored on this layer/group before flattened-group inheritance. */
  ownVisible: boolean;
  ownLocked: boolean;
  ownOpacity: number;
  blendMode?: (typeof BLEND_MODES)[number];
  /** Parent group ID copied to the Baipix image-layer model. */
  group?: string;
  /** Parent group ID in the parsed Aseprite layer hierarchy, for both layers and groups. */
  parentGroup?: string;
  background: boolean;
}

// Inherited properties retained for groups deeper than the supported group depth.
interface FlattenedGroupState {
  visible: boolean;
  locked: boolean;
  opacity: number;
}

interface RawCel {
  type: number;
  /** Aseprite layer-list index, not an index into the filtered Baipix `Layer[]` array. */
  layer: number;
  x: number;
  y: number;
  opacity: number;
  width?: number;
  height?: number;
  raw?: Uint8Array;
  pixels?: Uint32Array;
  /** Frame index supplying pixel data for a linked cel. */
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

/** One compatibility warning and optional values used to populate its localized message. */
export interface AsepriteWarning {
  code: AsepriteWarningCode;
  values?: Record<string, string | number>;
}

/** Error identifiers consumed by the import-error UI. */
export type AsepriteImportErrorCode = 'unreadable' | 'canvasTooLarge' | 'tooManyFrames' | 'celTooLarge';

/** Imported document plus metadata warnings that could not be preserved. */
export interface AsepriteImportResult {
  document: PixelDoc;
  warnings: AsepriteWarning[];
}

/**
 * Import error with a code and interpolation values used to select and populate a UI message.
 * Error carrying an importer code and interpolation values for the localized UI message.
 */
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

/** Throws the default import error for malformed or unsupported Aseprite data. */
function fail(message: string): never {
  throw new AsepriteError(message);
}

/** Throws an import error with a specific UI code and interpolation values. */
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

/** Reconstructs the parent/child hierarchy from Aseprite's ordered layer list and nesting levels. */
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

/** Checks a byte range against the complete input file. */
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

/** Checks a byte range against both the complete file and the containing chunk. */
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

/** Reads a length-prefixed UTF-8 string without crossing the supplied file/chunk boundary. */
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

/** Validates animation-tag records and returns the number of tags in the chunk. */
function parseTagsChunk(
  bytes: Uint8Array,
  view: DataView,
  start: number,
  end: number,
  frameCount: number,
): number {
  // Tags chunk header: 10 bytes (count plus reserved bytes).
  assertChunkRange(bytes, start, 10, end);

  const count = view.getUint16(start, true);
  let at = start + 10;

  // Each tag needs at least 17 fixed bytes and a 2-byte string length.
  assertChunkRange(bytes, at, count * 19, end);

  for (let i = 0; i < count; i++) {
    // Fixed tag fields occupy 17 bytes; the name follows as a length-prefixed string.
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

/** Walks a user-data property map and returns the offset immediately after its entries. */
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

/** Validates a user-data vector, supporting both mixed and homogeneous element types. */
function parseVectorPropertyValue(
  bytes: Uint8Array,
  view: DataView,
  start: number,
  end: number,
  depth: number,
): number {
  assertChunkRange(bytes, start, 6, end);

  const count = view.getUint32(start, true);
  const elementType = view.getUint16(start + 4, true);

  let at = start + 6;

  if (elementType === 0) {
    // Mixed-type vectors store a type ID before each element.
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

    // Homogeneous vectors store their element type once in the vector header.
    for (let i = 0; i < count; i++) {
      at = parsePropertyValue(bytes, view, at, end, elementType, depth + 1);
    }
  }

  return at;
}

/** Advances over one user-data property value according to its encoded type ID. */
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
    case 0x0011:
      return parseVectorPropertyValue(bytes, view, start, end, depth);

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

/** Validates the properties section, including each extension map and its declared size. */
function parseUserDataProperties(bytes: Uint8Array, view: DataView, start: number, end: number): number {
  assertChunkRange(bytes, start, 8, end);
  const propertiesSize = view.getUint32(start, true);

  if (propertiesSize < 8) {
    fail('Invalid Aseprite user data properties.');
  }

  assertChunkRange(bytes, start, propertiesSize, end);

  const propertiesEnd = start + propertiesSize;
  const mapCount = view.getUint32(start + 4, true);
  let at = start + 8;

  // Every map needs a 4-byte extension entry ID and at least a 4-byte property count.
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

  return propertiesEnd;
}

/** Validates optional user-data fields and reports whether the chunk contains metadata. */
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
    at = parseUserDataProperties(bytes, view, at, end);
  }

  if (at > end) {
    fail('Invalid Aseprite user data chunk.');
  }

  if (!hasUnknownFlags && at !== end) {
    fail('Invalid Aseprite user data chunk.');
  }

  return flags !== 0;
}

/** Validates external-file records and returns how many references the chunk contains. */
function parseExternalFilesChunk(bytes: Uint8Array, view: DataView, start: number, end: number): number {
  // Chunk header: DWORD entry count followed by 8 reserved bytes.
  assertChunkRange(bytes, start, 12, end);

  const count = view.getUint32(start, true);
  let at = start + 12;

  for (let i = 0; i < count; i++) {
    // Each entry starts with a 12-byte ID/type/reserved block, followed by its path string.
    assertChunkRange(bytes, at, 12, end);
    at += 12;
    at = readString(bytes, view, at, end).next;
  }

  if (at !== end) {
    fail('Invalid Aseprite external files chunk.');
  }

  return count;
}

/** Validates tileset metadata and skips optional external-link or embedded-tile payloads. */
function parseTilesetChunk(bytes: Uint8Array, view: DataView, start: number, end: number): void {
  // The fixed tileset fields occupy 32 bytes; the length-prefixed name starts at offset 32.
  assertChunkRange(bytes, start, 34, end);

  const flags = view.getUint32(start + 4, true);
  let at = readString(bytes, view, start + 32, end).next;

  if (flags & 1) {
    // External tileset reference: 4-byte external file ID and 4-byte reserved field.
    assertChunkRange(bytes, at, 8, end);
    at += 8;
  }

  if (flags & 2) {
    // Embedded tile data is prefixed by its byte length.
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

/** Validates slice keys and returns their count without importing slice metadata. */
function parseSliceChunk(
  bytes: Uint8Array,
  view: DataView,
  start: number,
  end: number,
  frameCount: number,
): number {
  // Slice header: key count (4), flags (4), reserved (4), then the name string.
  assertChunkRange(bytes, start, 12, end);

  const keyCount = view.getUint32(start, true);
  const flags = view.getUint32(start + 4, true);
  const hasNinePatch = (flags & 1) !== 0;
  const hasPivot = (flags & 2) !== 0;
  const hasUnknownFlags = (flags & ~3) !== 0;

  let at = readString(bytes, view, start + 12, end).next;

  // Each key has 20 fixed bytes; nine-patch data adds 16 and pivot data adds 8.
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

/** Reads and validates the fixed Aseprite file header. */
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

  // Header offsets: flags 14, deprecated speed 18, transparent index 28,
  // pixel width/height 34/35, and grid X/Y/width/height 36–43.
  return {
    fileSize,
    width,
    height,
    frames,
    depth,
    // Bit 1: layer opacity is meaningful; bit 2: group opacity/blend mode is meaningful;
    // bit 4: each layer chunk includes a 16-byte UUID.
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

/** Reads the modern palette chunk and updates the palette entries covered by its range. */
function parsePaletteChunk(
  bytes: Uint8Array,
  view: DataView,
  start: number,
  end: number,
  colors: number[],
): void {
  // Palette header: three DWORDs (total, first, last) plus 8 reserved bytes = 20 bytes.
  assertChunkRange(bytes, start, 20, end);

  // Each palette entry is flags(2) followed by RGBA(4); the file can store names after flagged entries.
  const total = view.getUint32(start, true);
  const first = view.getUint32(start + 4, true);
  const last = view.getUint32(start + 8, true);

  // Baipix stores at most 256 indexed colors; this is an application limit.
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
    // Palette entry: 2-byte flags followed by 4 RGBA bytes.
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

/** Reads legacy palette packets, preserving skipped entries and expanding 6-bit RGB values when needed. */
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
  // Packets can skip palette entries, so `colors` can be sparse; callers must check `i in colors`.
  let index = 0;

  for (let p = 0; p < packets; p++) {
    assertChunkRange(bytes, at, 2, end);

    // The first byte is the number of palette entries to skip from the current index.
    index += view.getUint8(at);

    // A zero packet color count encodes 256 entries.
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
        // Chunk 0x0011 stores legacy components in the 0–63 range; scale them to 0–255.
        r = Math.round((r / 63) * 255);
        g = Math.round((g / 63) * 255);
        b = Math.round((b / 63) * 255);
      }

      colors[index++] = pack(r, g, b);
    }
  }

  return colors;
}

/** Fixed fields extracted from a layer chunk before resolving inherited layer state. */
interface LayerChunkMetadata {
  flags: number;
  type: number;
  level: number;
  blend: number;
  opacity: number;
  name: string;
  id: string;
  groupDepth: number;
}

/** Reads the fixed layer fields and advances the group stacks to the layer's nesting level. */
function readLayerChunkMetadata(
  bytes: Uint8Array,
  view: DataView,
  start: number,
  end: number,
  header: AsepriteHeader,
  groupStack: string[],
  flattenedGroupStack: FlattenedGroupState[],
  warn: WarningCollector,
): LayerChunkMetadata {
  // Layer chunk: flags(2), type(2), level(2), ignored width/height(4), blend(2), opacity(1), reserved(3), name.
  // The fixed portion is 16 bytes; the length-prefixed name needs at least 2 more bytes.
  assertChunkRange(bytes, start, 18, end);
  const flags = view.getUint16(start, true);

  // Layer flags: 1 visible, 2 editable, 4 movement locked, 8 background, 32 collapsed, 64 reference.
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
  // Level N is a child of the most recently read group at level N - 1.
  // Truncating removes stale deeper groups left by previously parsed siblings.
  groupStack.length = groupDepth;

  if (groupDepth > 0 && !groupStack[groupDepth - 1]) {
    fail('Invalid Aseprite layer hierarchy.');
  }

  const flattenedDepth = Math.max(0, level - MAX_GROUP_DEPTH);
  flattenedGroupStack.length = flattenedDepth;

  const layerName = readString(bytes, view, start + 16, end);
  let next = layerName.next;

  if (type === 2) {
    // Tilemap layers include a 4-byte tileset index after the layer name; its value is unused here.
    assertChunkRange(bytes, next, 4, end);
    next += 4;
  }

  if (header.flags & 4) {
    // Header flag 4 means each layer has a 16-byte UUID after its type-specific data.
    // Only validate and skip the UUID because Baipix assigns its own layer/group IDs.
    assertChunkRange(bytes, next, 16, end);
    next += 16;
  }

  const id = newId(type === 1 ? 'group' : 'layer');

  return {
    flags,
    type,
    level,
    blend,
    opacity,
    name: layerName.value,
    id,
    groupDepth,
  };
}

/** Resolves layer visibility, locking, opacity and blend mode, including inherited flattened-group state. */
function resolveLayerState(
  metadata: LayerChunkMetadata,
  header: AsepriteHeader,
  groupStack: string[],
  flattenedGroupStack: FlattenedGroupState[],
  warn: WarningCollector,
): ParsedLayer {
  const { flags, type, level, blend, opacity, name, id, groupDepth } = metadata;

  // Header flag 1 enables image-layer opacity; flag 2 enables group opacity and blend modes.
  // Without the corresponding flag, the opacity byte must be treated as fully opaque.
  const actualOpacity =
    type === 1 && !(header.flags & 2) ? 255 : type !== 1 && !(header.flags & 1) ? 255 : opacity;

  const ownVisible = !!(flags & 1);
  // Editable flag (2) is inverted to obtain the editor's locked state.
  const ownLocked = !(flags & 2);
  const ownOpacity = actualOpacity / 255;

  const inheritedVisible = flattenedGroupStack.every((group) => group.visible);
  const inheritedLocked = flattenedGroupStack.some((group) => group.locked);
  const inheritedOpacity = flattenedGroupStack.reduce((value, group) => value * group.opacity, 1);

  const hasValidBlendMode = type !== 1 || !!(header.flags & 2);
  // Blend mode IDs 0–11 map to BLEND_MODES; unknown IDs fall back to normal and produce a warning.
  const blendMode = hasValidBlendMode ? (BLEND_MODES[blend] ?? 'normal') : undefined;

  if (hasValidBlendMode && blend > 11) {
    warn('unsupportedBlendModes');
  }

  return {
    id,
    name,
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
}

/** Registers supported groups or records the inherited state of groups beyond Baipix's depth limit. */
function registerLayerGroup(
  parsed: ParsedLayer,
  metadata: LayerChunkMetadata,
  groups: LayerGroup[],
  groupStack: string[],
  flattenedGroupStack: FlattenedGroupState[],
  warn: WarningCollector,
): ParsedLayer {
  const { flags, type, level, id, groupDepth } = metadata;
  const blendMode = parsed.blendMode;

  if (type === 1) {
    if (level < MAX_GROUP_DEPTH) {
      const group: LayerGroup = {
        id,
        name: parsed.name,
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
      // Groups at or beyond MAX_GROUP_DEPTH are flattened; their own state is inherited by their children.
      warn('deepGroupsFlattened');

      if (blendMode && blendMode !== 'normal') {
        warn('deepGroupBlendModes');
      }

      flattenedGroupStack.push({
        visible: parsed.ownVisible,
        locked: parsed.ownLocked,
        opacity: parsed.ownOpacity,
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

  // A level greater than MAX_GROUP_DEPTH means the image layer is inside a flattened group.
  if (level > MAX_GROUP_DEPTH) {
    warn('deepGroupsFlattened');
  }

  parsed.group = groupDepth > 0 ? groupStack[groupDepth - 1] : undefined;

  return parsed;
}

/** Parses a layer chunk by reading its metadata, resolving inherited state and registering its group. */
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
  const metadata = readLayerChunkMetadata(
    bytes,
    view,
    start,
    end,
    header,
    groupStack,
    flattenedGroupStack,
    warn,
  );
  const parsed = resolveLayerState(metadata, header, groupStack, flattenedGroupStack, warn);

  return registerLayerGroup(parsed, metadata, groups, groupStack, flattenedGroupStack, warn);
}

/** Calculates the decoded byte length of a cel and enforces the per-cel import area limit. */
function celByteLength(width: number, height: number, depth: ColorDepth): number {
  const pixelCount = width * height;

  if (!width || !height || !Number.isSafeInteger(pixelCount) || pixelCount > MAX_CEL_PIXELS) {
    failWith('Aseprite cel exceeds the maximum import area.', 'celTooLarge', { max: MAX_CEL_PIXELS });
  }

  return pixelCount * (depth / 8);
}

/** Decompresses a zlib-compressed cel while rejecting output larger than its declared pixel dimensions. */
async function decompress(data: Uint8Array, expectedSize: number): Promise<Uint8Array> {
  try {
    // Aseprite uses zlib (RFC 1950), which is handled by 'deflate'; 'deflate-raw' is RFC 1951.
    // Capping output at expectedSize prevents an oversized stream from exhausting memory.
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

/** Converts raw cel bytes into Baipix's packed RGBA pixel representation. */
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
      // 32-bit cels store four bytes per pixel in RGBA order.
      pixels[i] = pack(raw[at], raw[at + 1], raw[at + 2], raw[at + 3]);
    } else if (depth === 16) {
      // 16-bit cels are grayscale: one intensity byte followed by alpha.
      pixels[i] = pack(raw[at], raw[at], raw[at], raw[at + 1]);
    } else {
      // 8-bit cels contain palette indexes rather than direct color components.
      const index = raw[at];

      // The transparent palette index is ignored for background layers.
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

/** Multiplies each pixel's alpha channel by the cel opacity stored in the Aseprite file. */
function applyOpacity(pixels: Uint32Array, opacity: number): void {
  if (opacity === 255) return;

  for (let i = 0; i < pixels.length; i++) {
    const alpha = pixels[i] >>> 24;
    pixels[i] = withAlpha(pixels[i], Math.round((alpha * opacity) / 255));
  }
}

/** Accumulates data that must be retained across the sequential frame/chunk parsing pass. */
interface FrameParseState {
  parsedLayers: ParsedLayer[];
  groups: LayerGroup[];
  /** Tracks supported groups by their Aseprite nesting level. */
  groupStack: string[];
  /** Tracks inherited state for groups that cannot be represented in the document's group tree. */
  flattenedGroupStack: FlattenedGroupState[];
  rawFrames: RawCel[][];
  palette: number[];
  legacyPalette: number[];
  /** Each frame keeps its own palette snapshot because palettes can change during animation. */
  framePalettes: number[][];
  frameLegacyPalettes: number[][];
  frameDurations: number[];
  /** A modern palette chunk takes precedence over legacy palette chunks. */
  hasNewPalette: boolean;
  /** Whether a cel chunk has been read in the file so far. */
  hasReadCel: boolean;
  /** Collects distinct unsupported chunk types for one warning after parsing. */
  unsupportedChunkTypes: Set<number>;
  endOffset: number;
}

/** Reports header metadata that Baipix does not currently preserve. */
function warnAboutHeaderMetadata(header: AsepriteHeader, warn: WarningCollector): void {
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
}

/** Validates a color-profile chunk and reports profiles that are not preserved by the importer. */
function parseColorProfileChunk(
  bytes: Uint8Array,
  view: DataView,
  start: number,
  end: number,
  warn: WarningCollector,
): void {
  // Color profile type: 0 none, 1 sRGB, 2 embedded ICC. Flag bit 1 indicates a fixed gamma value.
  assertChunkRange(bytes, start, 16, end);

  const profileType = view.getUint16(start, true);
  const profileFlags = view.getUint16(start + 2, true);

  if (profileType === 2) {
    // For ICC profiles, the data length is at +16 and the profile bytes start at +20.
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
}

/** Reads a cel chunk, retaining raw pixel bytes until the frame's palette and layers are available. */
async function parseCelChunk(
  bytes: Uint8Array,
  view: DataView,
  start: number,
  end: number,
  header: AsepriteHeader,
  frameCels: RawCel[],
  warn: WarningCollector,
): Promise<void> {
  // Fixed cel header (16 bytes): layer(2), x(2), y(2), opacity(1), type(2), z-index(2), reserved(5).
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

  // Cel type: 0 raw image, 1 linked cel, 2 zlib-compressed image, 3 tilemap.
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
}

/** Validates the optional cel-extra metadata and reports fields the importer does not preserve. */
function parseCelExtraChunk(
  bytes: Uint8Array,
  view: DataView,
  start: number,
  end: number,
  warn: WarningCollector,
): void {
  assertChunkRange(bytes, start, 4, end);

  const flags = view.getUint32(start, true);
  const hasPreciseBounds = (flags & 1) !== 0;

  // Fixed minimum: flags(4) + reserved(16); precise bounds add a fixed 16-byte rectangle.
  assertChunkRange(bytes, start, hasPreciseBounds ? 36 : 20, end);

  if (hasPreciseBounds) {
    warn('preciseCelBounds');
  }

  if (flags >>> 1 !== 0) {
    warn('unsupportedCelExtraFlags');
  }
}

/** Dispatches a frame's chunks to their format-specific parsers and returns the next frame offset. */
async function parseFrameChunks(
  bytes: Uint8Array,
  view: DataView,
  header: AsepriteHeader,
  frameIndex: number,
  startOffset: number,
  frameEnd: number,
  chunkCount: number,
  frameCels: RawCel[],
  state: FrameParseState,
  warn: WarningCollector,
): Promise<number> {
  let at = startOffset;

  for (let c = 0; c < chunkCount; c++) {
    // A chunk header is 6 bytes: size(4) followed by type(2); size includes these 6 bytes.
    assertChunkRange(bytes, at, 6, frameEnd);

    const chunkSize = view.getUint32(at, true);
    const chunkType = view.getUint16(at + 4, true);
    const start = at + 6;
    const end = at + chunkSize;

    if (chunkSize < 6 || end > frameEnd) fail('Invalid Aseprite chunk size.');

    switch (chunkType) {
      case LAYER_CHUNK: {
        if (frameIndex !== 0) {
          fail('Unexpected Aseprite layer chunk outside the first frame.');
        }

        const layer = parseLayer(
          bytes,
          view,
          start,
          end,
          header,
          state.groups,
          state.groupStack,
          state.flattenedGroupStack,
          warn,
        );

        state.parsedLayers.push(layer);
        break;
      }

      case PALETTE_CHUNK:
        state.hasNewPalette = true;
        parsePaletteChunk(bytes, view, start, end, state.palette);
        break;

      case OLD_PALETTE_CHUNK:
      case OLD_PALETTE_6BIT_CHUNK: {
        const parsed = parseOldPalette(bytes, view, start, end, chunkType === OLD_PALETTE_6BIT_CHUNK);

        for (let i = 0; i < parsed.length; i++) {
          if (i in parsed) {
            state.legacyPalette[i] = parsed[i];
          }
        }
        break;
      }

      case TAGS_CHUNK: {
        const tagCount = parseTagsChunk(bytes, view, start, end, header.frames);

        if (tagCount > 0) warn('animationTags');
        break;
      }

      case USER_DATA_CHUNK:
        if (parseUserDataChunk(bytes, view, start, end)) {
          warn('userData');
        }
        break;

      case SLICE_CHUNK: {
        const keyCount = parseSliceChunk(bytes, view, start, end, header.frames);

        if (keyCount > 0) warn('slices');
        break;
      }

      case EXTERNAL_FILES_CHUNK: {
        const count = parseExternalFilesChunk(bytes, view, start, end);

        if (count > 0) warn('externalFiles');
        break;
      }

      case TILESET_CHUNK:
        parseTilesetChunk(bytes, view, start, end);
        warn('tilesetsSkipped');
        break;

      case COLOR_PROFILE_CHUNK:
        parseColorProfileChunk(bytes, view, start, end, warn);
        break;

      case CEL_CHUNK:
        state.hasReadCel = true;
        await parseCelChunk(bytes, view, start, end, header, frameCels, warn);
        break;

      case CEL_EXTRA_CHUNK:
        if (!state.hasReadCel) {
          fail('Aseprite cel extra chunk has no preceding cel.');
        }

        parseCelExtraChunk(bytes, view, start, end, warn);
        break;

      default:
        state.unsupportedChunkTypes.add(chunkType);
    }

    at = end;
  }

  return at;
}

/** Parses all frame headers and chunks, retaining per-frame palette snapshots, cel data and durations. */
async function parseFrames(
  bytes: Uint8Array,
  view: DataView,
  header: AsepriteHeader,
  warn: WarningCollector,
): Promise<FrameParseState> {
  const state: FrameParseState = {
    parsedLayers: [],
    groups: [],
    groupStack: [],
    flattenedGroupStack: [],
    rawFrames: [],
    palette: [],
    legacyPalette: [],
    framePalettes: [],
    frameLegacyPalettes: [],
    frameDurations: [],
    hasNewPalette: false,
    hasReadCel: false,
    unsupportedChunkTypes: new Set<number>(),
    endOffset: HEADER_SIZE,
  };

  let at = HEADER_SIZE;

  for (let f = 0; f < header.frames; f++) {
    assertRange(bytes, at, FRAME_HEADER_SIZE);

    // Frame header: size(4), magic(2), old chunk count(2), duration(2), reserved(2), new chunk count(4).
    const frameSize = view.getUint32(at, true);
    const magic = view.getUint16(at + 4, true);
    const oldChunks = view.getUint16(at + 6, true);
    const duration = view.getUint16(at + 8, true);
    state.frameDurations.push(duration);
    const newChunks = view.getUint32(at + 12, true);
    // Prefer the extended count when present; otherwise use the legacy field.
    const chunkCount = newChunks || oldChunks;
    const frameEnd = at + frameSize;

    if (magic !== FRAME_MAGIC || frameSize < FRAME_HEADER_SIZE || frameEnd > bytes.length) {
      fail('Invalid Aseprite frame header.');
    }

    // Defensive parser limit; this is an importer sanity limit, not an Aseprite format limit.
    if (chunkCount > 100_000) fail('Invalid Aseprite chunk count.');

    at += FRAME_HEADER_SIZE;
    const frameCels: RawCel[] = [];

    at = await parseFrameChunks(bytes, view, header, f, at, frameEnd, chunkCount, frameCels, state, warn);

    if (at !== frameEnd) fail('Aseprite frame size does not match its chunks.');

    state.framePalettes.push([...state.palette]);
    state.frameLegacyPalettes.push([...state.legacyPalette]);
    state.rawFrames.push(frameCels);

    const effectiveDuration = duration || header.speed || DEFAULT_DURATION;

    // Duration bounds are importer sanity checks, not limits imposed by the file specification.
    if (effectiveDuration < 10 || effectiveDuration > 10_000) {
      warn('frameDurations');
    }
  }

  state.endOffset = at;
  return state;
}

/** Reports all distinct unsupported chunk IDs together rather than emitting one warning per chunk. */
function warnAboutUnsupportedChunks(unsupportedChunkTypes: Set<number>, warn: WarningCollector): void {
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
}

/** Applies legacy palette data only when no modern palette chunk was present. */
function applyLegacyPaletteFallback(
  hasNewPalette: boolean,
  palette: number[],
  legacyPalette: number[],
  framePalettes: number[][],
  frameLegacyPalettes: number[][],
): void {
  if (!hasNewPalette) {
    // Aseprite 1.1 may write both palette chunk formats; the modern palette takes precedence.
    // Frame palette snapshots are captured while parsing, so legacy entries are merged afterwards.
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
}

/** Creates Baipix image layers and a parallel map preserving the original Aseprite layer indexes. */
function createLayersFromParsedLayers(
  parsedLayers: ParsedLayer[],
  width: number,
  height: number,
): { layers: Layer[]; layerMap: Array<ParsedLayer | undefined> } {
  const layers: Layer[] = [];
  // Indexed by the Aseprite layer-list index, including groups and unsupported layers.
  // `layers` contains image layers only, so its indexes are not interchangeable with `layerMap`.
  const layerMap: Array<ParsedLayer | undefined> = [];

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
      pixels: new Uint32Array(width * height),
      ...(parsed.group ? { group: parsed.group } : {}),
    };

    layers.push(layer);
    layerMap.push(parsed);
  }

  return { layers, layerMap };
}

/** Ensures indexed-color frames have a palette snapshot before their pixel bytes are decoded. */
function assertIndexedPalette(depth: ColorDepth, framePalettes: number[][]): void {
  if (depth === 8 && framePalettes.some((framePalette) => !framePalette.length)) {
    fail('Indexed Aseprite file is missing a palette.');
  }
}

type ResolvedCel = { pixels: Uint32Array; width: number; height: number };

/** Follows linked cels to their source pixel data; placement uses the current cel's coordinates separately. */
function resolveLinkedCel(
  rawFrames: RawCel[][],
  frameIndex: number,
  cel: RawCel,
  seen = new Set<string>(),
): ResolvedCel {
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

  // Linked cels may reference only an earlier frame; the seen set is an additional cycle guard.
  if (targetFrame >= rawFrames.length || targetFrame >= frameIndex) {
    fail('Linked cel references an invalid frame.');
  }

  const target = rawFrames[targetFrame].find((item) => item.layer === cel.layer);
  if (!target) fail('Linked cel references a missing cel.');

  return resolveLinkedCel(rawFrames, targetFrame, target, seen);
}

/** Decodes all non-linked cels after their frame-specific palettes and layer metadata are known. */
function decodeRawFrameCels(
  rawFrames: RawCel[][],
  parsedLayers: ParsedLayer[],
  framePalettes: number[][],
  header: AsepriteHeader,
): void {
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

      // Release the original byte buffer once the decoded pixel array is available.
      delete cel.raw;
    }
  }
}

/** Applies cel opacity and positions decoded pixels on the full document canvas for each frame. */
function placeFrameCels(
  rawFrames: RawCel[][],
  layerMap: Array<ParsedLayer | undefined>,
  layers: Layer[],
  header: AsepriteHeader,
  framePixels: Array<Map<number, ReturnType<typeof reframe>>>,
): void {
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

      // Linked cels reuse source pixels, but keep the current cel's own position and opacity.
      const source = resolveLinkedCel(rawFrames, f, cel);
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
}

/** Recursively flattens the parsed hierarchy while retaining the original layer traversal order. */
function flattenLayerNodes(nodes: ParsedNode[]): ParsedLayer[] {
  return nodes.flatMap((node) => (node.kind === 'group' ? flattenLayerNodes(node.children) : [node.parsed]));
}

/** Reorders image layers and their frame pixels to match the parsed Aseprite layer tree. */
function buildOutputLayers(
  parsedLayers: ParsedLayer[],
  layers: Layer[],
  rawFrames: RawCel[][],
  framePixels: Array<Map<number, ReturnType<typeof reframe>>>,
): { layers: Layer[]; framePixels: Array<Map<number, ReturnType<typeof reframe>>> } {
  const parsedTree = buildParsedTree(parsedLayers);

  // Maps parsed Aseprite layer IDs to the filtered image-layer array.
  const sourceLayerIndexById = new Map<string, number>();

  layers.forEach((layer, index) => {
    sourceLayerIndexById.set(layer.id, index);
  });

  const outputLayers: Layer[] = [];
  // Stores frame pixels after restoring the document's layer order.
  const outputFramePixels: Array<Map<number, ReturnType<typeof reframe>>> = rawFrames.map(() => new Map());

  // Flattens the parsed group tree into the layer order expected by PixelDoc.
  for (const parsed of flattenLayerNodes(parsedTree)) {
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

  return { layers: outputLayers, framePixels: outputFramePixels };
}

/** Builds the final PixelDoc, mapping frame 0 to `layer.pixels` and later frames to `layer.cels`. */
function createImportedDocument(
  header: AsepriteHeader,
  rawFrames: RawCel[][],
  frameDurations: number[],
  groups: LayerGroup[],
  outputLayers: Layer[],
  outputFramePixels: Array<Map<number, ReturnType<typeof reframe>>>,
  palette: number[],
): PixelDoc {
  // Use the same duration fallback as parseFrames when checking and storing frame timing.
  const frames: Frame[] = rawFrames.map((_, index) => ({
    id: newId('frame'),
    duration: clampDuration(frameDurations[index] || header.speed || DEFAULT_DURATION),
  }));

  const document = createDocument('Untitled', header.width, header.height);
  // If the file has no image layers, retain the default layer created by createDocument.
  const finalLayers = outputLayers.length ? outputLayers : document.layers;

  document.layers = finalLayers;
  document.groups = outputLayers.length && groups.length ? groups : undefined;
  document.frames = frames.length > 1 ? frames : undefined;
  document.activeFrame = 0;
  document.activeLayer = 0;
  document.layerCounter = finalLayers.length;

  for (let i = 0; i < finalLayers.length; i++) {
    const firstFrame = outputFramePixels[0].get(i);
    // Frame 0 is stored directly on the layer; `cels` contains entries for subsequent frames.
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

  return document;
}

/** Imports an Aseprite file into a Baipix document and returns warnings for unsupported metadata. */
export async function fromAseprite(data: Uint8Array): Promise<AsepriteImportResult> {
  const header = parseHeader(data);
  const bytes = data.subarray(0, header.fileSize);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  const warnings = new Map<AsepriteWarningCode, AsepriteWarning>();

  // Each warning code is reported once; its values are taken from the first occurrence.
  const warn: WarningCollector = (code, values) => {
    if (!warnings.has(code)) {
      warnings.set(code, {
        code,
        ...(values ? { values } : {}),
      });
    }
  };

  // Parsing order matters: collect frame metadata first, then resolve palettes, decode cels,
  // place pixels, restore layer order and finally construct the Baipix document.
  warnAboutHeaderMetadata(header, warn);
  const parsedFrames = await parseFrames(bytes, view, header, warn);

  warnAboutUnsupportedChunks(parsedFrames.unsupportedChunkTypes, warn);
  applyLegacyPaletteFallback(
    parsedFrames.hasNewPalette,
    parsedFrames.palette,
    parsedFrames.legacyPalette,
    parsedFrames.framePalettes,
    parsedFrames.frameLegacyPalettes,
  );

  if (parsedFrames.endOffset !== bytes.length) {
    fail('Aseprite file size does not match its frames.');
  }

  const { layers, layerMap } = createLayersFromParsedLayers(
    parsedFrames.parsedLayers,
    header.width,
    header.height,
  );

  const framePixels: Array<Map<number, ReturnType<typeof reframe>>> = parsedFrames.rawFrames.map(
    () => new Map(),
  );

  assertIndexedPalette(header.depth, parsedFrames.framePalettes);
  decodeRawFrameCels(parsedFrames.rawFrames, parsedFrames.parsedLayers, parsedFrames.framePalettes, header);

  placeFrameCels(parsedFrames.rawFrames, layerMap, layers, header, framePixels);
  const output = buildOutputLayers(parsedFrames.parsedLayers, layers, parsedFrames.rawFrames, framePixels);

  const document = createImportedDocument(
    header,
    parsedFrames.rawFrames,
    parsedFrames.frameDurations,
    parsedFrames.groups,
    output.layers,
    output.framePixels,
    parsedFrames.palette,
  );

  return { document, warnings: [...warnings.values()] };
}
