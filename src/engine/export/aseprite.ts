/**
 * Exports a Baipix drawing as an `.aseprite` file, preserving its layers,
 * groups, visibility, locking, opacity, blend modes and palette.
 *
 * Written according to Aseprite's file specification:
 * https://github.com/aseprite/aseprite/blob/main/docs/ase-file-specs.md
 *
 * The format uses little-endian encoding, a 128-byte header
 * and a frame composed of chunks.
 */

import type { Color } from '../color';
import type { BlendMode } from '../composite';
import type { Layer, LayerGroup, PixelDoc } from '../document';
import { layerTree, type LayerNode } from '../groups';
import { pixelBounds } from '../region';

const BLEND: Record<BlendMode, number> = {
  normal: 0,
  multiply: 1,
  screen: 2,
  overlay: 3,
  darken: 4,
  lighten: 5,
  'color-dodge': 6,
  'color-burn': 7,
  'hard-light': 8,
  'soft-light': 9,
  difference: 10,
  exclusion: 11,
};

const LAYER_CHUNK = 0x2004;
const CEL_CHUNK = 0x2005;
const PALETTE_CHUNK = 0x2019;

// Layer flags.
const VISIBLE = 1;
const EDITABLE = 2;
const BACKGROUND = 8;
const COLLAPSED = 32;

export interface AsepriteOptions {
  /** Palette colors to save with the file. */
  palette: Color[];
  /** Adds the document's background color as Aseprite's background layer. */
  background?: Color;
}

/** One item in Aseprite's layer list, including the optional synthetic background layer. */
type Entry =
  | {
      kind: 'background';
      /** Index in the file's layer list, which cels point. */
      index: number;
      level: number;
      /** The background color, as a layer of its own at the bottom. */
      background: Color;
    }
  | {
      kind: 'layer';
      index: number;
      level: number;
      layer: Layer;
    }
  | {
      kind: 'group';
      index: number;
      level: number;
      group: LayerGroup;
    };

/**
 * Grows as it's written; everything little-endian, as Aseprite wants.
 */
class Writer {
  private bytes = new Uint8Array(1024);
  private view = new DataView(this.bytes.buffer);

  length = 0;

  /** Ensures the writer has room for the next value. */
  private room(n: number) {
    if (this.length + n <= this.bytes.length) {
      return;
    }

    const bigger = new Uint8Array(Math.max(this.bytes.length * 2, this.length + n));
    bigger.set(this.bytes);

    this.bytes = bigger;
    this.view = new DataView(bigger.buffer);
  }

  /** BYTE: 8-bit unsigned. */
  byte(n: number) {
    this.room(1);
    this.view.setUint8(this.length, n);
    this.length += 1;
  }

  /** WORD: 16-bit unsigned. */
  word(n: number) {
    this.room(2);
    this.view.setUint16(this.length, n, true);
    this.length += 2;
  }

  /** SHORT: 16-bit signed. */
  short(n: number) {
    this.room(2);
    this.view.setInt16(this.length, n, true);
    this.length += 2;
  }

  /** DWORD: 32-bit unsigned. */
  dword(n: number) {
    this.room(4);
    this.view.setUint32(this.length, n >>> 0, true);
    this.length += 4;
  }

  /** BYTE[n]: n zero bytes. */
  zeros(n: number) {
    for (let i = 0; i < n; i++) {
      this.byte(0);
    }
  }

  /** BYTE[]: raw bytes. */
  data(d: Uint8Array) {
    this.room(d.length);
    this.bytes.set(d, this.length);
    this.length += d.length;
  }

  /** STRING: WORD length in bytes + BYTE[length] UTF-8 characters, without '\0'. */
  string(s: string) {
    const utf8 = new TextEncoder().encode(s);
    this.word(utf8.length);
    this.data(utf8);
  }

  /** Writes a DWORD at an earlier offset (a size known only once what follows is written). */
  patch(at: number, n: number) {
    this.view.setUint32(at, n >>> 0, true);
  }

  /** Returns the written bytes without exposing unused capacity. */
  done(): Uint8Array {
    return this.bytes.slice(0, this.length);
  }
}

/**
 * Zlib-compressed bytes, as Aseprite stores cels (`deflate` in CompressionStream is zlib).
 */
async function zlib(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new CompressionStream('deflate'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/**
 * Builds the file's bottom-to-top layer list and assigns the indices used by cels.
 */
function buildLayerEntries(doc: PixelDoc, background: Color | undefined): Entry[] {
  // The layer list, bottom to top, a group right before its own layers (one level deeper).
  const entries: Entry[] = [];

  if (background !== undefined) {
    entries.push({ kind: 'background', index: 0, level: 0, background });
  }

  const walk = (nodes: LayerNode[], level: number) => {
    for (const node of nodes) {
      if (node.kind === 'layer') {
        entries.push({ kind: 'layer', index: entries.length, level, layer: node.layer });
      } else {
        entries.push({ kind: 'group', index: entries.length, level, group: node.group });
        walk(node.children, level + 1);
      }
    }
  };
  walk(layerTree(doc), 0);

  return entries;
}

/**
 * Writes one size-prefixed Aseprite chunk and appends it to the frame.
 */
function addChunk(chunks: Writer[], type: number, write: (writer: Writer) => void): void {
  const writer = new Writer();

  writer.dword(0);
  writer.word(type);
  write(writer);
  writer.patch(0, writer.length);

  chunks.push(writer);
}

/**
 * Serializes one layer or group entry into an Aseprite layer chunk.
 */
function addLayerChunk(chunks: Writer[], entry: Entry): void {
  addChunk(chunks, LAYER_CHUNK, (writer) => {
    let flags = 0;
    let type = 0;
    let blend = 0;
    let opacity = 1;
    let name = '';

    switch (entry.kind) {
      case 'background':
        flags = VISIBLE | EDITABLE | BACKGROUND;
        name = 'Background';
        break;

      case 'layer':
        flags = (entry.layer.visible ? VISIBLE : 0) | (entry.layer.locked ? 0 : EDITABLE);
        blend = entry.layer.blendMode ? BLEND[entry.layer.blendMode] : 0;

        opacity = entry.layer.opacity;
        name = entry.layer.name;
        break;

      case 'group':
        flags = (entry.group.visible ? VISIBLE : 0) | (entry.group.locked ? 0 : EDITABLE);

        if (entry.group.collapsed) {
          flags |= COLLAPSED;
        }

        type = 1;
        blend = entry.group.blendMode ? BLEND[entry.group.blendMode] : 0;
        opacity = entry.group.opacity;
        name = entry.group.name;
        break;
    }

    writer.word(flags);
    writer.word(type);
    writer.word(entry.level);
    writer.word(0);
    writer.word(0);
    writer.word(blend);
    writer.byte(Math.round(opacity * 255));
    writer.zeros(3);
    writer.string(name);
  });
}

/** Pixel data cropped to the smallest non-transparent rectangle in document coordinates. */
interface CroppedCel {
  x: number;
  y: number;
  width: number;
  height: number;
  pixels: Uint32Array;
}

/**
 * Creates the smallest cel image for a drawable entry; groups have no pixel data.
 */
function cropCel(entry: Entry, documentWidth: number, documentHeight: number): CroppedCel | undefined {
  let sourcePixels: Uint32Array | undefined;

  if (entry.kind === 'background') {
    sourcePixels = new Uint32Array(documentWidth * documentHeight).fill(entry.background);
  } else if (entry.kind === 'layer') {
    sourcePixels = entry.layer.pixels;
  } else {
    sourcePixels = undefined;
  }

  if (!sourcePixels) {
    return undefined;
  }

  const bounds = pixelBounds(sourcePixels, documentWidth, documentHeight);

  if (!bounds) {
    return undefined;
  }

  const pixels = new Uint32Array(bounds.w * bounds.h);

  for (let y = 0; y < bounds.h; y++) {
    pixels.set(
      sourcePixels.subarray(
        (bounds.y + y) * documentWidth + bounds.x,
        (bounds.y + y) * documentWidth + bounds.x + bounds.w,
      ),
      y * bounds.w,
    );
  }

  return { x: bounds.x, y: bounds.y, width: bounds.w, height: bounds.h, pixels };
}

/**
 * Adds one cel chunk; the caller awaits each entry to preserve chunk order.
 */
async function addCelChunk(
  chunks: Writer[],
  entry: Entry,
  documentWidth: number,
  documentHeight: number,
): Promise<void> {
  const cel = cropCel(entry, documentWidth, documentHeight);

  if (!cel) return;

  // 0xAABBGGRR in memory, little-endian: the bytes are R, G, B, A, Aseprite's RGBA order.
  const compressed = await zlib(new Uint8Array(cel.pixels.buffer));

  addChunk(chunks, CEL_CHUNK, (writer) => {
    writer.word(entry.index);
    writer.short(cel.x);
    writer.short(cel.y);
    writer.byte(255);
    writer.word(2);
    writer.short(0);
    writer.zeros(5);
    writer.word(cel.width);
    writer.word(cel.height);
    writer.data(compressed);
  });
}

/**
 * Serializes the optional palette chunk, limited to the colors supplied by the caller.
 */
function addPaletteChunk(chunks: Writer[], palette: Color[]): void {
  if (!palette.length) return;

  addChunk(chunks, PALETTE_CHUNK, (writer) => {
    writer.dword(palette.length);
    writer.dword(0);
    writer.dword(palette.length - 1);
    writer.zeros(8);

    for (const c of palette) {
      writer.word(0);
      writer.byte(c & 0xff);
      writer.byte((c >>> 8) & 0xff);
      writer.byte((c >>> 16) & 0xff);
      writer.byte((c >>> 24) & 0xff);
    }
  });
}

/**
 * Builds a one-frame Aseprite file from the document and its export options.
 */
export async function toAseprite(doc: PixelDoc, options: AsepriteOptions): Promise<Uint8Array> {
  const { width: documentWidth, height: documentHeight } = doc;
  const entries = buildLayerEntries(doc, options.background);
  const chunks: Writer[] = [];

  // The palette. Optional chunks (Color Profile 0x2007, sprite user data 0x2020)
  // are intentionally not written, so readers treat the file as having no color profile.
  const palette = options.palette.slice(0, 256);
  addPaletteChunk(chunks, palette);

  // The layers.
  for (const entry of entries) {
    addLayerChunk(chunks, entry);
  }

  // A cel per drawn layer, cropped to what's drawn.
  for (const entry of entries) {
    await addCelChunk(chunks, entry, documentWidth, documentHeight);
  }

  // The frame header precedes all chunks. The first chunk count is the legacy 16-bit field;
  // the following DWORD is the full count used by newer readers.
  const frame = new Writer();
  const frameSize = 16 + chunks.reduce((n, c) => n + c.length, 0);

  frame.dword(frameSize);
  frame.word(0xf1fa);
  frame.word(Math.min(chunks.length, 0xffff));
  frame.word(100);
  frame.zeros(2);
  frame.dword(chunks.length);

  for (const c of chunks) {
    frame.data(c.done());
  }

  // The 128-byte file header. Fields are written in the order required by the Aseprite spec.
  const file = new Writer();

  file.dword(128 + frameSize);
  file.word(0xa5e0);
  file.word(1);
  file.word(documentWidth);
  file.word(documentHeight);
  file.word(32);
  file.dword(1 | 2);
  file.word(100);
  file.dword(0);
  file.dword(0);
  file.byte(0);
  file.zeros(3);
  file.word(palette.length === 256 ? 0 : palette.length);
  file.byte(1);
  file.byte(1);
  file.short(0);
  file.short(0);
  file.word(16);
  file.word(16);
  file.zeros(84);
  file.data(frame.done());

  return file.done();
}
