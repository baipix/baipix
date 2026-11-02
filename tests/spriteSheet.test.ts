import { describe, expect, it } from 'vitest';

import { pack } from '../src/engine/color';
import { composeSpriteSheet, spriteSheetGrid } from '../src/engine/export/spriteSheet';

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
