import { describe, expect, it } from 'vitest';
import { pack } from '../src/engine/color';
import { Editor } from '../src/engine/editor';
import { DEFAULT_LIGHT, lightSides, readLight } from '../src/engine/light';
import { documentFromJson, documentToJson } from '../src/storage/fileFormat';

const INK = pack(0, 0, 0);

/** A filled square of `size` in the middle of a canvas of `width`. */
function square(width: number, size: number) {
  const pixels = new Uint32Array(width * width);
  const from = (width - size) / 2;
  for (let y = from; y < from + size; y++)
    for (let x = from; x < from + size; x++) pixels[y * width + x] = INK;
  return pixels;
}

const row = (sides: Int8Array, width: number, y: number) =>
  Array.from(sides.slice(y * width, (y + 1) * width));

describe('lightSides', () => {
  it('lights the side facing the light and shades the other one', () => {
    // A 3 × 3 square in a 5 × 5 canvas, light from the right.
    const sides = lightSides(square(5, 3), 5, 5, 0);
    expect(row(sides, 5, 2)).toEqual([0, -1, 0, 1, 0]);
  });

  it('lights both edges toward a diagonal light', () => {
    // Light from the top left: the top row and the left column are lit, the bottom and right shaded.
    const sides = lightSides(square(5, 3), 5, 5, 135);
    expect(row(sides, 5, 1)).toEqual([0, 1, 1, 1, 0]);
    expect(row(sides, 5, 2)).toEqual([0, 1, 0, -1, 0]);
    expect(row(sides, 5, 3)).toEqual([0, 1, -1, -1, 0]);
  });

  it('leaves empty pixels alone', () => {
    const sides = lightSides(new Uint32Array(9), 3, 3, 90);
    expect(Array.from(sides)).toEqual(new Array(9).fill(0));
  });
});

describe('readLight', () => {
  it('keeps the angle within a turn and the height within its range', () => {
    expect(readLight({ angle: -90, height: 200 })).toEqual({
      angle: 270,
      height: 80,
      direction: true,
      sides: true,
    });
    expect(readLight({ angle: 370.4, height: 2, sides: false })).toMatchObject({
      angle: 10,
      height: 10,
      sides: false,
    });
  });

  it('turns down what is not a light', () => {
    expect(readLight(null)).toBeUndefined();
    expect(readLight({ height: 30 })).toBeUndefined();
  });
});

describe('a board light', () => {
  it('is saved in the file and read back', () => {
    const e = new Editor();
    e.setLight({ ...DEFAULT_LIGHT, angle: 60 });
    const back = documentFromJson(documentToJson(e.getState().doc));
    expect(back.light).toEqual({ ...DEFAULT_LIGHT, angle: 60 });
  });

  it("isn't undone with the drawing", () => {
    const e = new Editor();
    e.setLight(DEFAULT_LIGHT);
    e.setColor('primary', INK);
    e.setTool('pencil');
    e.beginStroke({ x: 1, y: 1 }, false, { shift: false });
    e.endStroke();
    e.undo();
    expect(e.getState().doc.light).toEqual(DEFAULT_LIGHT);
  });

  it('goes away with null', () => {
    const e = new Editor();
    e.setLight(DEFAULT_LIGHT);
    e.setLight(null);
    expect(e.getState().doc.light).toBeUndefined();
  });
});
