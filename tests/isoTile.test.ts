import { describe, expect, it } from 'vitest';
import { pack } from '../src/engine/color';
import { Editor } from '../src/engine/editor';
import { diamondRows, inDiamond, inTile, tilesIsometric } from '../src/engine/isoTile';

const RED = pack(255, 0, 0);

describe('isometric tiles', () => {
  it('give every corner pixel one twin in the diamond, half a tile away', () => {
    for (const [W, H] of [
      [32, 16],
      [16, 8],
      [24, 24],
    ])
      for (let y = 0; y < H; y++)
        for (let x = 0; x < W; x++) {
          const twin = { x: (x + W / 2) % W, y: (y + H / 2) % H };
          expect(inDiamond(x, y, W, H)).not.toBe(inDiamond(twin.x, twin.y, W, H));
          expect(inTile(x, y, W, H)).toEqual(inDiamond(x, y, W, H) ? { x, y } : twin);
        }
  });

  it('have a diamond with 2:1 edges on a 2:1 canvas, half its pixels', () => {
    const rows = diamondRows(16, 8);
    expect(rows.map(([a, b]) => b - a + 1)).toEqual([2, 6, 10, 14, 14, 10, 6, 2]);
    rows.forEach(([a, b], y) => {
      for (let x = 0; x < 16; x++) expect(inDiamond(x, y, 16, 8)).toBe(x >= a && x <= b);
    });
  });

  it('are what the tile preview shows with the isometric grid on, on an even canvas', () => {
    const e = new Editor();
    e.newFile(32, 16);
    expect(tilesIsometric(e.getState().doc)).toBe(false);
    e.setIsoGrid(32);
    expect(tilesIsometric(e.getState().doc)).toBe(true);
    e.newFile(31, 16);
    e.setIsoGrid(32);
    expect(tilesIsometric(e.getState().doc)).toBe(false);
  });

  it('wrap strokes across the diamond’s edges, leaving its corners empty', () => {
    const e = new Editor();
    e.newFile(32, 16);
    e.setIsoGrid(32);
    e.setView('tile', true);
    e.setColor('primary', RED);
    e.setTool('pencil');
    e.beginStroke({ x: 0, y: 0 }, false, { shift: false });
    e.endStroke();
    const px = e.getState().doc.layers[0].pixels;
    expect(px[0]).toBe(0);
    expect(px[8 * 32 + 16]).toBe(RED);
    // Past the right edge: the tile on the right, same spot.
    e.beginStroke({ x: 40, y: 8 }, false, { shift: false });
    e.endStroke();
    expect(px[8 * 32 + 8]).toBe(RED);
  });
});
