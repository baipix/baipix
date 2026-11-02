import { describe, expect, it } from 'vitest';

import { pack } from '../src/engine/color';
import { createDocument } from '../src/engine/document';
import { addFrame } from '../src/engine/frames';
import { composeFrameSpriteSheet, frameSpriteSheet, frameSpriteSheetJson } from '../src/engine/export/frames';
import { spriteSheetGrid } from '../src/engine/export/spriteSheet';

const RED = pack(255, 0, 0);
const GREEN = pack(0, 255, 0);
const BLUE = pack(0, 0, 255);

describe('spriteSheetGrid', () => {
  it('places all frames in one row by default', () => {
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

  it('never makes more columns than frames', () => {
    expect(spriteSheetGrid(3, 10, 4, 2)).toEqual({
      columns: 3,
      rows: 1,
      width: 12,
      height: 2,
    });
  });

  it('rejects an empty sprite sheet', () => {
    expect(() => spriteSheetGrid(0, null, 4, 2)).toThrow('A sprite sheet must contain at least one item.');
  });

  it('rejects invalid frame dimensions', () => {
    expect(() => spriteSheetGrid(2, null, 0, 2)).toThrow(
      'Sprite sheet dimensions must be positive integers.',
    );
  });

  it('rejects invalid column counts', () => {
    expect(() => spriteSheetGrid(3, 0, 4, 2)).toThrow('Columns must be a positive integer.');
  });
});

describe('composeFrameSpriteSheet', () => {
  it('places frames from left to right in their original order', () => {
    const frames = [Uint32Array.from([RED, 0]), Uint32Array.from([0, BLUE]), Uint32Array.from([GREEN, 0])];

    const sheet = composeFrameSpriteSheet(frames, 2, 1);

    expect(sheet.width).toBe(6);
    expect(sheet.height).toBe(1);
    expect(Array.from(sheet.pixels)).toEqual([RED, 0, 0, BLUE, GREEN, 0]);
  });

  it('places frames in the requested number of columns', () => {
    const frames = [Uint32Array.from([RED, 0]), Uint32Array.from([0, BLUE]), Uint32Array.from([GREEN, 0])];

    const sheet = composeFrameSpriteSheet(frames, 2, 1, 2);

    expect(sheet.width).toBe(4);
    expect(sheet.height).toBe(2);

    expect(Array.from(sheet.pixels)).toEqual([RED, 0, 0, BLUE, GREEN, 0, 0, 0]);
  });

  it('rejects frames with incorrect dimensions', () => {
    const frames = [Uint32Array.from([RED, 0]), Uint32Array.from([BLUE])];

    expect(() => composeFrameSpriteSheet(frames, 2, 1)).toThrow(
      'Frame pixel buffer does not match document dimensions.',
    );
  });
});

describe('frameSpriteSheet', () => {
  it('exports every frame in order with its individual duration', () => {
    const doc = createDocument('Test', 2, 1, 'base');

    doc.layers[0].pixels.set([RED, 0]);

    // Frame 2.
    addFrame(doc, 0);
    doc.layers[0].pixels.set([0, BLUE]);

    // Frame 3.
    addFrame(doc, 1);
    doc.layers[0].pixels.set([GREEN, 0]);

    doc.frames![0].duration = 75;
    doc.frames![1].duration = 150;
    doc.frames![2].duration = 250;

    // The third frame is active before export.
    expect(doc.activeFrame).toBe(2);

    const sheet = frameSpriteSheet(doc, 2);

    expect(sheet.width).toBe(4);
    expect(sheet.height).toBe(2);

    expect(Array.from(sheet.pixels)).toEqual([RED, 0, 0, BLUE, GREEN, 0, 0, 0]);

    expect(sheet.durations).toEqual([75, 150, 250]);

    // Export must not change the active frame.
    expect(doc.activeFrame).toBe(2);
  });

  it('uses the default duration for a board without animation metadata', () => {
    const doc = createDocument('Single frame', 2, 1, 'base');

    const sheet = frameSpriteSheet(doc);

    expect(sheet.durations).toEqual([100]);
    expect(sheet.columns).toBe(1);
    expect(sheet.rows).toBe(1);
  });
});

describe('frameSpriteSheetJson', () => {
  it('stores frame coordinates and durations in TexturePacker JSON Hash format', () => {
    const json = JSON.parse(
      frameSpriteSheetJson(
        'sprite-sheet.png',
        ['frame-0001', 'frame-0002', 'frame-0003'],
        [80, 150, 250],
        2,
        { width: 10, height: 5 },
        1,
        { width: 21, height: 11 },
        '1.0.0',
      ),
    );

    expect(Object.keys(json.frames)).toEqual(['frame-0001', 'frame-0002', 'frame-0003']);

    expect(json.frames['frame-0001']).toMatchObject({
      frame: { x: 0, y: 0, w: 10, h: 5 },
      rotated: false,
      trimmed: false,
      duration: 80,
    });

    expect(json.frames['frame-0002']).toMatchObject({
      frame: { x: 11, y: 0, w: 10, h: 5 },
      duration: 150,
    });

    expect(json.frames['frame-0003']).toMatchObject({
      frame: { x: 0, y: 6, w: 10, h: 5 },
      duration: 250,
    });

    expect(json.frames['frame-0003'].sourceSize).toEqual({
      w: 10,
      h: 5,
    });

    expect(json.meta).toMatchObject({
      image: 'sprite-sheet.png',
      format: 'RGBA8888',
      size: { w: 21, h: 11 },
      version: '1.0.0',
    });
  });

  it('rejects a duration list that does not match the frame count', () => {
    expect(() =>
      frameSpriteSheetJson(
        'sprite-sheet.png',
        ['frame-0001', 'frame-0002'],
        [100],
        2,
        { width: 10, height: 10 },
        0,
        { width: 20, height: 10 },
        '1.0.0',
      ),
    ).toThrow('Every frame must have a corresponding duration.');
  });
});
