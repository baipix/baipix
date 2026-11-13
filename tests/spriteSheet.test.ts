import { describe, expect, it } from 'vitest';

import { pack } from '../src/engine/color';
import { composeSpriteSheet, spriteSheetGrid } from '../src/engine/export/spriteSheet';
import { createAnimatedDocument, sliceSpriteSheet } from '../src/engine/import/frames';

const RED = pack(255, 0, 0);
const GREEN = pack(0, 255, 0);
const BLUE = pack(0, 0, 255);

describe('spriteSheetGrid', () => {
  it('places all items in one row by default', () => {
    expect(spriteSheetGrid(3, null, 4, 2)).toEqual({
      columns: 3,
      rows: 1,
      width: 12,
      height: 2,
    });
  });

  it('calculates rows from the requested number of columns', () => {
    expect(spriteSheetGrid(5, 2, 4, 3)).toEqual({
      columns: 2,
      rows: 3,
      width: 8,
      height: 9,
    });
  });

  it('never makes more columns than items', () => {
    expect(spriteSheetGrid(3, 10, 4, 2)).toEqual({
      columns: 3,
      rows: 1,
      width: 12,
      height: 2,
    });
  });

  it('creates one column when requested', () => {
    expect(spriteSheetGrid(5, 1, 4, 4)).toEqual({
      columns: 1,
      rows: 5,
      width: 4,
      height: 20,
    });
  });

  it('rejects an empty sprite sheet', () => {
    expect(() => spriteSheetGrid(0, null, 4, 2)).toThrow('A sprite sheet must contain at least one item.');
  });

  it('rejects invalid dimensions', () => {
    expect(() => spriteSheetGrid(2, null, 0, 2)).toThrow(
      'Sprite sheet dimensions must be positive integers.',
    );
  });

  it('rejects invalid column counts', () => {
    expect(() => spriteSheetGrid(3, 0, 4, 2)).toThrow('Columns must be a positive integer.');
  });
});

describe('composeSpriteSheet', () => {
  it('places items from left to right in their original order', () => {
    const items = [Uint32Array.from([RED, 0]), Uint32Array.from([0, BLUE]), Uint32Array.from([GREEN, 0])];

    const sheet = composeSpriteSheet(items, 2, 1);

    expect(sheet.width).toBe(6);
    expect(sheet.height).toBe(1);
    expect(Array.from(sheet.pixels)).toEqual([RED, 0, 0, BLUE, GREEN, 0]);
  });

  it('places items in the requested number of columns', () => {
    const items = [Uint32Array.from([RED, 0]), Uint32Array.from([0, BLUE]), Uint32Array.from([GREEN, 0])];

    const sheet = composeSpriteSheet(items, 2, 1, 2);

    expect(sheet.width).toBe(4);
    expect(sheet.height).toBe(2);
    expect(Array.from(sheet.pixels)).toEqual([RED, 0, 0, BLUE, GREEN, 0, 0, 0]);
  });

  it('rejects items with incorrect dimensions', () => {
    const items = [Uint32Array.from([RED, 0]), Uint32Array.from([BLUE])];

    expect(() => composeSpriteSheet(items, 2, 1)).toThrow(
      'Sprite sheet item pixel buffer does not match document dimensions.',
    );
  });
});

describe('sliceSpriteSheet & createAnimatedDocument', () => {
  it('round-trips composed sprite sheets into animated document frames', () => {
    const items = [
      Uint32Array.from([RED, 0, 0, RED]),
      Uint32Array.from([0, GREEN, GREEN, 0]),
      Uint32Array.from([BLUE, BLUE, 0, 0]),
    ];
    const sheet = composeSpriteSheet(items, 2, 2, 2);

    const sliced = sliceSpriteSheet(sheet.pixels, sheet.width, sheet.height, 2, 2, 2, 2);
    expect(sliced).toHaveLength(4);
    expect(Array.from(sliced[0])).toEqual(Array.from(items[0]));
    expect(Array.from(sliced[1])).toEqual(Array.from(items[1]));
    expect(Array.from(sliced[2])).toEqual(Array.from(items[2]));
    expect(Array.from(sliced[3])).toEqual([0, 0, 0, 0]);

    const doc = createAnimatedDocument(
      'walk',
      2,
      2,
      sliced.slice(0, 3).map((pixels, idx) => ({ pixels, duration: 100 + idx * 50 })),
    );
    expect(doc.width).toBe(2);
    expect(doc.height).toBe(2);
    expect(doc.frames?.map((f) => f.duration)).toEqual([100, 150, 200]);
    expect(doc.activeFrame).toBe(0);
    expect(Array.from(doc.layers[0].pixels)).toEqual(Array.from(items[0]));
    expect(doc.layers[0].cels?.[0]).toBeNull();
    expect(Array.from(doc.layers[0].cels?.[1]?.pixels ?? [])).toEqual(Array.from(items[1]));
    expect(Array.from(doc.layers[0].cels?.[2]?.pixels ?? [])).toEqual(Array.from(items[2]));
  });

  it('rejects sprite sheet grids exceeding the image dimensions', () => {
    const pixels = new Uint32Array(4 * 4);
    expect(() => sliceSpriteSheet(pixels, 4, 4, 3, 2, 2, 2)).toThrow(
      'Sprite sheet grid exceeds the image dimensions.',
    );
  });

  it('gives each frame cel an independent pixel copy so edits do not leak', () => {
    const frameA = Uint32Array.from([RED, 0, 0, RED]);
    const frameB = Uint32Array.from([RED, 0, 0, RED]);
    const frameC = Uint32Array.from([BLUE, 0, 0, BLUE]);
    const frameD = Uint32Array.from([BLUE, 0, 0, BLUE]);

    const doc = createAnimatedDocument('isolated', 2, 2, [
      { pixels: frameA, duration: 100 },
      { pixels: frameB, duration: 100 },
      { pixels: frameC, duration: 100 },
      { pixels: frameD, duration: 100 },
    ]);

    expect(doc.layers[0].cels?.[1]?.pixels).not.toBe(doc.layers[0].pixels);
    expect(Array.from(doc.layers[0].cels?.[1]?.pixels ?? [])).toEqual(Array.from(frameB));
    expect(doc.layers[0].cels?.[2]?.pixels).not.toBe(doc.layers[0].pixels);
    expect(doc.layers[0].cels?.[3]?.pixels).not.toBe(doc.layers[0].cels?.[2]?.pixels);
    expect(Array.from(doc.layers[0].cels?.[3]?.pixels ?? [])).toEqual(Array.from(frameD));
  });
});
