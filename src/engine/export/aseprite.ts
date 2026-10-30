import type { Color } from '../color';
import type { BlendMode } from '../composite';
import type { Layer, LayerGroup, PixelDoc } from '../document';
import { layerTree, type LayerNode } from '../groups';
import { pixelBounds } from '../region';

/**
 * The drawing as an `.aseprite` file, to keep working on it in Aseprite: one frame, the layers
 * with their names, visibility, lock, opacity and blend modes, the groups, and the palette.
 * Written by hand from Aseprite's file spec
 * (https://github.com/aseprite/aseprite/blob/main/docs/ase-file-specs.md): little-endian, a
 * 128-byte header, then a frame made of chunks.
 */

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

/** Layer flags. */
const VISIBLE = 1;
const EDITABLE = 2;
const BACKGROUND = 8;
const COLLAPSED = 32;

/** Grows as it's written; everything little-endian, as Aseprite wants. */
class Writer {
  private bytes = new Uint8Array(1024);
  private view = new DataView(this.bytes.buffer);
  length = 0;

  private room(n: number) {
    if (this.length + n <= this.bytes.length) return;
    const bigger = new Uint8Array(Math.max(this.bytes.length * 2, this.length + n));
    bigger.set(this.bytes);
    this.bytes = bigger;
    this.view = new DataView(bigger.buffer);
  }
  byte(n: number) {
    this.room(1);
    this.view.setUint8(this.length, n);
    this.length += 1;
  }
  word(n: number) {
    this.room(2);
    this.view.setUint16(this.length, n, true);
    this.length += 2;
  }
  short(n: number) {
    this.room(2);
    this.view.setInt16(this.length, n, true);
    this.length += 2;
  }
  dword(n: number) {
    this.room(4);
    this.view.setUint32(this.length, n >>> 0, true);
    this.length += 4;
  }
  zeros(n: number) {
    for (let i = 0; i < n; i++) this.byte(0);
  }
  data(d: Uint8Array) {
    this.room(d.length);
    this.bytes.set(d, this.length);
    this.length += d.length;
  }
  string(s: string) {
    const utf8 = new TextEncoder().encode(s);
    this.word(utf8.length);
    this.data(utf8);
  }
  /** Writes a DWORD at an earlier offset (a size known only once what follows is written). */
  patch(at: number, n: number) {
    this.view.setUint32(at, n >>> 0, true);
  }
  done(): Uint8Array {
    return this.bytes.slice(0, this.length);
  }
}

/** Zlib-compressed bytes, as Aseprite stores cels (`deflate` in CompressionStream is zlib). */
async function zlib(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new CompressionStream('deflate'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

type Entry =
  | {
      kind: 'background';
      /** Index in the file's layer list, which cels point at. */
      index: number;
      level: number;
      /** The background color, as a layer of its own at the bottom. */
      background: Color;
    }
  | {
      kind: 'layer';
      /** Index in the file's layer list, which cels point at. */
      index: number;
      level: number;
      layer: Layer;
    }
  | {
      kind: 'group';
      /** Index in the file's layer list, which cels point at. */
      index: number;
      level: number;
      group: LayerGroup;
    };

export interface AsepriteOptions {
  /** Palette colors to save with the file. */
  palette: Color[];
  /** Adds the document's background color as Aseprite's background layer. */
  background?: Color;
}

function entriesFor(doc: PixelDoc, background: Color | undefined): Entry[] {
  // The layer list, bottom to top, a group right before its own layers (one level deeper).
  const entries: Entry[] = [];
  if (background !== undefined) entries.push({ kind: 'background', index: 0, level: 0, background });
  const walk = (nodes: LayerNode[], level: number) => {
    for (const node of nodes) {
      if (node.kind === 'layer')
        entries.push({ kind: 'layer', index: entries.length, level, layer: node.layer });
      else {
        entries.push({ kind: 'group', index: entries.length, level, group: node.group });
        walk(node.children, level + 1);
      }
    }
  };
  walk(layerTree(doc), 0);
  return entries;
}

function addChunk(chunks: Writer[], type: number, write: (writer: Writer) => void): void {
  const writer = new Writer();
  writer.dword(0); // size, patched below
  writer.word(type);
  write(writer);
  writer.patch(0, writer.length);
  chunks.push(writer);
}

function addLayerChunk(chunks: Writer[], entry: Entry): void {
  addChunk(chunks, LAYER_CHUNK, (writer) => {
    const group = entry.kind === 'group' ? entry.group : undefined;
    const layer = entry.kind === 'layer' ? entry.layer : undefined;
    const isBackground = entry.kind === 'background';
    const visible = isBackground || (group ?? layer)!.visible;
    const locked = !isBackground && (group ?? layer)!.locked;
    let flags = (visible ? VISIBLE : 0) | (locked ? 0 : EDITABLE);
    if (isBackground) flags |= BACKGROUND;
    if (group?.collapsed) flags |= COLLAPSED;
    writer.word(flags);
    writer.word(group ? 1 : 0); // 0: image, 1: group
    writer.word(entry.level);
    writer.word(0);
    writer.word(0);
    // A group without a blend mode passes through, which is what Aseprite's normal group does.
    const blend = group ? group.blendMode : layer?.blendMode;
    writer.word(blend ? BLEND[blend] : 0);
    writer.byte(Math.round(((group ?? layer)?.opacity ?? 1) * 255));
    writer.zeros(3);
    writer.string(isBackground ? 'Background' : (group ?? layer)!.name);
  });
}

async function addCelChunk(
  chunks: Writer[],
  entry: Entry,
  documentWidth: number,
  documentHeight: number,
): Promise<void> {
  const sourcePixels =
    entry.kind === 'background'
      ? new Uint32Array(documentWidth * documentHeight).fill(entry.background)
      : entry.kind === 'layer'
        ? entry.layer.pixels
        : undefined;
  if (!sourcePixels) return;
  const box = pixelBounds(sourcePixels, documentWidth, documentHeight);
  if (!box) return;
  const crop = new Uint32Array(box.w * box.h);
  for (let y = 0; y < box.h; y++)
    crop.set(
      sourcePixels.subarray((box.y + y) * documentWidth + box.x, (box.y + y) * documentWidth + box.x + box.w),
      y * box.w,
    );
  // 0xAABBGGRR in memory, little-endian: the bytes are R, G, B, A, Aseprite's RGBA order.
  const compressed = await zlib(new Uint8Array(crop.buffer));
  addChunk(chunks, CEL_CHUNK, (writer) => {
    writer.word(entry.index);
    writer.short(box.x);
    writer.short(box.y);
    writer.byte(255);
    writer.word(2); // compressed image
    writer.short(0); // z-index
    writer.zeros(5);
    writer.word(box.w);
    writer.word(box.h);
    writer.data(compressed);
  });
}

export async function toAseprite(doc: PixelDoc, options: AsepriteOptions): Promise<Uint8Array> {
  const { width: documentWidth, height: documentHeight } = doc;
  const entries = entriesFor(doc, options.background);
  const chunks: Writer[] = [];

  // The palette.
  const palette = options.palette.slice(0, 256);
  if (palette.length)
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

  // The layers.
  for (const entry of entries) addLayerChunk(chunks, entry);

  // A cel per drawn layer, cropped to what's drawn.
  for (const entry of entries) await addCelChunk(chunks, entry, documentWidth, documentHeight);

  // The frame: its header, then the chunks.
  const frame = new Writer();
  const frameSize = 16 + chunks.reduce((n, c) => n + c.length, 0);
  frame.dword(frameSize);
  frame.word(0xf1fa);
  frame.word(Math.min(chunks.length, 0xffff));
  frame.word(100); // duration, ms
  frame.zeros(2);
  frame.dword(chunks.length);
  for (const c of chunks) frame.data(c.done());

  // The header.
  const file = new Writer();
  file.dword(128 + frameSize);
  file.word(0xa5e0);
  file.word(1); // frames
  file.word(documentWidth);
  file.word(documentHeight);
  file.word(32); // RGBA
  file.dword(1 | 2); // layer opacity and group opacity/blend are meaningful
  file.word(100); // speed (deprecated)
  file.dword(0);
  file.dword(0);
  file.byte(0); // transparent index (indexed sprites only)
  file.zeros(3);
  file.word(palette.length === 256 ? 0 : palette.length);
  file.byte(1); // pixel width
  file.byte(1); // pixel height
  file.short(0); // grid x
  file.short(0); // grid y
  file.word(16); // grid width
  file.word(16); // grid height
  file.zeros(84);
  file.data(frame.done());
  return file.done();
}
