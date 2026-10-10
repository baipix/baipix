import { describe, expect, it } from 'vitest';
import { pack } from '../src/engine/color';
import { Editor } from '../src/engine/editor';
import { toAseprite } from '../src/engine/export/aseprite';

const RED = pack(255, 0, 0);
const BLUE = pack(0, 0, 255, 128);

/** Reads an .aseprite file back, following the spec on its own (not the writer's code). */
async function read(bytes: Uint8Array) {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const header = {
    size: v.getUint32(0, true),
    magic: v.getUint16(4, true),
    frames: v.getUint16(6, true),
    width: v.getUint16(8, true),
    height: v.getUint16(10, true),
    depth: v.getUint16(12, true),
    flags: v.getUint32(14, true),
    colors: v.getUint16(32, true),
  };
  let at = 128;
  const frame = {
    size: v.getUint32(at, true),
    magic: v.getUint16(at + 4, true),
    chunks: v.getUint32(at + 12, true),
  };
  at += 16;
  const layers: {
    flags: number;
    type: number;
    level: number;
    blend: number;
    opacity: number;
    name: string;
  }[] = [];
  const cels: { layer: number; x: number; y: number; w: number; h: number; pixels: Uint32Array }[] = [];
  let palette: number[][] = [];
  for (let k = 0; k < frame.chunks; k++) {
    const size = v.getUint32(at, true);
    const type = v.getUint16(at + 4, true);
    const d = at + 6;
    if (type === 0x2004) {
      const length = v.getUint16(d + 16, true);
      layers.push({
        flags: v.getUint16(d, true),
        type: v.getUint16(d + 2, true),
        level: v.getUint16(d + 4, true),
        blend: v.getUint16(d + 10, true),
        opacity: v.getUint8(d + 12),
        name: new TextDecoder().decode(bytes.slice(d + 18, d + 18 + length)),
      });
    } else if (type === 0x2005) {
      expect(v.getUint16(d + 7, true)).toBe(2); // compressed image
      const w = v.getUint16(d + 16, true);
      const h = v.getUint16(d + 18, true);
      const stream = new Blob([bytes.slice(d + 20, at + size)])
        .stream()
        .pipeThrough(new DecompressionStream('deflate'));
      const raw = new Uint8Array(await new Response(stream).arrayBuffer());
      cels.push({
        layer: v.getUint16(d, true),
        x: v.getInt16(d + 2, true),
        y: v.getInt16(d + 4, true),
        w,
        h,
        pixels: new Uint32Array(raw.buffer),
      });
    } else if (type === 0x2019) {
      const n = v.getUint32(d, true);
      palette = Array.from({ length: n }, (_, i) => [...bytes.slice(d + 20 + i * 6 + 2, d + 20 + i * 6 + 6)]);
    }
    at += size;
  }
  return { header, frame, layers, cels, palette, end: at };
}

describe('export to Aseprite', () => {
  it('writes a valid file: header, layers and groups, cropped cels, palette', async () => {
    const e = new Editor();
    e.newFile(8, 4);
    e.addLayer();
    e.addLayer();
    const doc = e.getState().doc;
    doc.layers[0].name = 'Ground';
    doc.layers[0].pixels[3 * 8 + 1] = RED;
    doc.layers[1].name = 'Sky';
    doc.layers[1].opacity = 0.5;
    doc.layers[1].blendMode = 'multiply';
    doc.layers[1].locked = true;
    doc.layers[1].pixels[0] = BLUE;
    doc.layers[2].name = 'Empty';
    doc.layers[2].visible = false;
    // Sky and Empty in a group.
    e.selectLayer(1, 'single');
    e.selectLayer(2, 'toggle');
    e.groupSelection();
    const bytes = await toAseprite(e.getState().doc, { palette: [RED, BLUE] });
    const f = await read(bytes);

    expect(f.header).toMatchObject({
      size: bytes.length,
      magic: 0xa5e0,
      frames: 1,
      width: 8,
      height: 4,
      depth: 32,
    });
    expect(f.header.colors).toBe(2);
    expect(f.frame.magic).toBe(0xf1fa);
    expect(f.end).toBe(bytes.length);
    // Bottom to top, the group right before its layers, one level deeper.
    expect(f.layers.map((l) => [l.name, l.type, l.level])).toEqual([
      ['Ground', 0, 0],
      ['Group 1', 1, 0],
      ['Sky', 0, 1],
      ['Empty', 0, 1],
    ]);
    expect(f.layers[2]).toMatchObject({ blend: 1, opacity: 128, flags: 1 }); // visible, not editable
    expect(f.layers[3].flags & 1).toBe(0); // hidden
    // Empty layers have no cel; the others are cropped to what's drawn.
    expect(f.cels.map((c) => [c.layer, c.x, c.y, c.w, c.h])).toEqual([
      [0, 1, 3, 1, 1],
      [2, 0, 0, 1, 1],
    ]);
    expect(f.cels[0].pixels[0]).toBe(RED);
    expect(f.cels[1].pixels[0]).toBe(BLUE);
    expect(f.palette).toEqual([
      [255, 0, 0, 255],
      [0, 0, 255, 128],
    ]);
  });

  it('adds the background color as a background layer', async () => {
    const e = new Editor();
    e.newFile(2, 2);
    const f = await read(await toAseprite(e.getState().doc, { palette: [], background: RED }));
    expect(f.layers[0]).toMatchObject({ name: 'Background', flags: 1 | 2 | 8 });
    expect(f.cels[0]).toMatchObject({ layer: 0, w: 2, h: 2 });
    expect([...f.cels[0].pixels]).toEqual([RED, RED, RED, RED]);
  });
});
