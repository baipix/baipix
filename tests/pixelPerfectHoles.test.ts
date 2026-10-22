import { describe, expect, it } from 'vitest';
import { pack } from '../src/engine/color';
import { Editor } from '../src/engine/editor';

const RED = pack(255, 0, 0);

describe('pixel perfect', () => {
  it('never makes a hole where the stroke already went: a scribble crossing itself stays solid', () => {
    const e = new Editor();
    e.newFile(8, 8, 'P');
    e.setColor('primary', RED);
    e.setTool('pencil');
    e.setOption('pixelPerfect', true);
    // Right along y = 2, up the right side, back left along y = 0, then down through the first line
    // at x = 2 and right along it: (2, 2) becomes a corner of the way back, but the first pass drew
    // it, in the middle of a line.
    const path = [
      [0, 2],
      [5, 2],
      [5, 0],
      [2, 0],
      [2, 2],
      [3, 2],
    ];
    e.beginStroke({ x: path[0][0], y: path[0][1] }, false, { shift: false });
    for (const [x, y] of path.slice(1)) e.moveStroke({ x, y }, { shift: false });
    e.endStroke();
    const px = e.getState().doc.layers[0].pixels;
    expect(px[2 * 8 + 2]).toBe(RED);
  });

  it('paints a corner it took away again when the stroke comes back over it', () => {
    const e = new Editor();
    e.newFile(8, 8, 'P');
    e.setColor('primary', RED);
    e.setTool('pencil');
    e.setOption('pixelPerfect', true);
    // (1, 0) goes as the corner of the first turn; the stroke comes back to it at the end.
    const path = [
      [0, 0],
      [1, 0],
      [1, 1],
      [2, 1],
      [2, 0],
      [1, 0],
    ];
    e.beginStroke({ x: 0, y: 0 }, false, { shift: false });
    for (const [x, y] of path.slice(1)) e.moveStroke({ x, y }, { shift: false });
    e.endStroke();
    expect(e.getState().doc.layers[0].pixels[1]).toBe(RED);
  });
});
