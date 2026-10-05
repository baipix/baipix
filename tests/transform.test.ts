import { describe, expect, it } from 'vitest';
import { pack } from '../src/engine/color';
import { Editor } from '../src/engine/editor';
import { pixelBounds } from '../src/engine/region';

const RED = pack(255, 0, 0);
const BLUE = pack(0, 0, 255);

/** A 16×16 file with a 3×2 block at (5, 4), its top-left pixel blue. */
function setup() {
  const e = new Editor();
  e.newFile(16, 16);
  const doc = e.getState().doc;
  const px = doc.layers[0].pixels;
  for (let y = 4; y < 6; y++) for (let x = 5; x < 8; x++) px[y * 16 + x] = RED;
  px[4 * 16 + 5] = BLUE;
  return e;
}
const pixels = (e: Editor) => e.getState().doc.layers[0].pixels;
const bounds = (e: Editor) => pixelBounds(pixels(e), 16, 16);

describe('Rotate', () => {
  it('turns counterclockwise as the inverse of clockwise', () => {
    const e = setup();
    const before = pixels(e).slice();
    e.rotate(false);
    expect(bounds(e)).toMatchObject({ w: 2, h: 3 });
    e.rotate(true);
    expect([...pixels(e)]).toEqual([...before]);
  });

  it('puts the top-left corner at the bottom-left, counterclockwise', () => {
    const e = setup();
    e.rotate(false);
    const b = bounds(e)!;
    expect(pixels(e)[(b.y + b.h - 1) * 16 + b.x]).toBe(BLUE);
  });
});

describe('Align', () => {
  it('moves what is drawn against each edge, or to the middle', () => {
    const cases = [
      ['left', { x: 0, y: 4 }],
      ['right', { x: 13, y: 4 }],
      ['top', { x: 5, y: 0 }],
      ['bottom', { x: 5, y: 14 }],
      ['centerX', { x: 6, y: 4 }],
      ['centerY', { x: 5, y: 7 }],
    ] as const;
    for (const [to, at] of cases) {
      const e = setup();
      e.align(to);
      expect(bounds(e)).toEqual({ ...at, w: 3, h: 2 });
    }
  });

  it('aligns the drawn part of a selection, as one undo step', () => {
    const e = setup();
    e.setTool('select');
    e.beginStroke({ x: 2, y: 2 }, false, { shift: false });
    e.moveStroke({ x: 11, y: 11 }, { shift: false });
    e.endStroke();
    expect(e.getState().selection).not.toBeNull();
    e.align('left');
    expect(bounds(e)).toEqual({ x: 0, y: 4, w: 3, h: 2 });
    e.undo();
    expect(bounds(e)).toEqual({ x: 5, y: 4, w: 3, h: 2 });
  });
});
