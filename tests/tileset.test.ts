import { describe, expect, it } from 'vitest';
import { pack } from '../src/engine/color';
import { cutTiles, tiledMap, tiledTileset } from '../src/engine/export/tileset';
import { crc32, zip } from '../src/io/zip';

const R = pack(255, 0, 0);
const B = pack(0, 0, 255);

/** A 6×2 drawing of 2×2 tiles: red, empty, red again (same), then blue in a corner. */
function drawing() {
  const px = new Uint32Array(6 * 2);
  for (const [x, y] of [
    [0, 0],
    [1, 0],
    [0, 1],
    [1, 1],
    [4, 0],
    [5, 0],
    [4, 1],
    [5, 1],
  ])
    px[y * 6 + x] = R;
  return px;
}

describe('tileset export', () => {
  it('keeps every tile in place without leaving any out: the sheet is the drawing', () => {
    const t = cutTiles(drawing(), 6, 2, {
      tileWidth: 2,
      tileHeight: 2,
      dropEmpty: false,
      dropRepeats: false,
    });
    expect(t.tiles).toHaveLength(3);
    expect(t.map).toEqual([0, 1, 2]);
    expect([...t.sheet]).toEqual([...drawing()]);
  });

  it('leaves out empty tiles and repeats, and the map still draws the drawing', () => {
    const t = cutTiles(drawing(), 6, 2, { tileWidth: 2, tileHeight: 2, dropEmpty: true, dropRepeats: true });
    expect(t.tiles).toHaveLength(1);
    expect(t.map).toEqual([0, -1, 0]);
    expect(t.sheetWidth).toBe(2);
    expect(JSON.parse(tiledMap(t, 'a.tsj')).layers[0].data).toEqual([1, 0, 1]);
  });

  it('pads tiles past the edges with transparency', () => {
    const px = new Uint32Array(3 * 3).fill(B);
    const t = cutTiles(px, 3, 3, { tileWidth: 2, tileHeight: 2, dropEmpty: true, dropRepeats: false });
    expect(t.map).toEqual([0, 1, 2, 3]);
    expect([...t.tiles[3]]).toEqual([B, 0, 0, 0]);
  });

  it('describes the sheet as a Tiled tileset', () => {
    const t = cutTiles(drawing(), 6, 2, { tileWidth: 2, tileHeight: 2, dropEmpty: true, dropRepeats: true });
    expect(JSON.parse(tiledTileset(t, 'sky', 'sky.png'))).toMatchObject({
      type: 'tileset',
      image: 'sky.png',
      tilewidth: 2,
      tileheight: 2,
      tilecount: 1,
      columns: 1,
    });
  });
});

describe('zip', () => {
  it('computes the standard CRC-32', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
  });

  it('stores files one after the other, with a directory at the end', () => {
    const data = new TextEncoder().encode('hello');
    const out = zip([
      { name: 'a.txt', data },
      { name: 'b.txt', data },
    ]);
    const view = new DataView(out.buffer);
    expect(view.getUint32(0, true)).toBe(0x04034b50);
    const end = out.length - 22;
    expect(view.getUint32(end, true)).toBe(0x06054b50);
    expect(view.getUint16(end + 10, true)).toBe(2);
    const text = new TextDecoder().decode(out);
    expect(text).toContain('a.txthello');
    expect(text).toContain('b.txthello');
  });
});
