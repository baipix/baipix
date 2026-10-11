import { describe, expect, it } from 'vitest';
import { pack } from '../src/engine/color';
import { Editor } from '../src/engine/editor';
import { boxFromDrag, isoBox, type BoxFace } from '../src/engine/isoBox';

const MARK: Record<BoxFace, string> = { top: 'T', left: 'L', right: 'R', edge: 'o' };

/** The box as rows of text, from its leftmost column. */
function art(width: number, depth: number, height: number, outline = false): string[] {
  const cells = new Map<string, BoxFace>();
  isoBox({ x: 0, y: 0 }, { width, depth, height }, outline, (x, y, f) => cells.set(`${x},${y}`, f));
  const xs = [...cells.keys()].map((k) => +k.split(',')[0]);
  const ys = [...cells.keys()].map((k) => +k.split(',')[1]);
  const rows: string[] = [];
  for (let y = 0; y <= Math.max(...ys); y++) {
    let row = '';
    for (let x = Math.min(...xs); x <= Math.max(...xs); x++) {
      const f = cells.get(`${x},${y}`);
      row += f ? MARK[f] : '.';
    }
    rows.push(row);
  }
  return rows;
}

describe('isometric box', () => {
  it('has a 2:1 diamond on top and two faces under it', () => {
    expect(art(2, 2, 2)).toEqual([
      '....TT....',
      '..TTTTTT..',
      'TTTTTTTTTT',
      'LLTTTTTTRR',
      'LLLLTTRRRR',
      '..LLLRRR..',
      '....LR....',
    ]);
  });

  it('is wider on the left with more width, on the right with more depth', () => {
    expect(art(3, 1, 1)).toEqual([
      '..TT......',
      'TTTTTT....',
      'LLTTTTTT..',
      '..LLTTTTTT',
      '....LLTTRR',
      '......LR..',
    ]);
  });

  it('outlines its outer edge in steps of two, like its edges', () => {
    expect(art(2, 2, 2, true)).toEqual([
      '....oo....',
      '..ooTToo..',
      'ooTTTTTToo',
      'oLTTTTTTRo',
      'ooLLTTRRoo',
      '..ooLRoo..',
      '....oo....',
    ]);
  });

  it('takes its width and depth from a drag between the corners of its top', () => {
    expect(boxFromDrag({ x: 10, y: 0 }, { x: 10, y: 6 }, false)).toEqual({
      top: { x: 10, y: 0 },
      width: 3,
      depth: 3,
    });
    expect(boxFromDrag({ x: 10, y: 0 }, { x: 14, y: 6 }, false)).toMatchObject({ width: 4, depth: 2 });
    // Upwards: the end is the top corner. Shift: as deep as wide.
    expect(boxFromDrag({ x: 10, y: 6 }, { x: 6, y: 0 }, true)).toMatchObject({
      top: { x: 6, y: 0 },
      width: 3,
      depth: 3,
    });
  });
});

describe('the box tool', () => {
  const RED = pack(220, 40, 40);

  it('paints the top in the color and the sides darker, and its options redraw it in the same step', () => {
    const e = new Editor();
    e.newFile(32, 32);
    e.setColor('primary', RED);
    e.setTool('box');
    e.beginStroke({ x: 16, y: 2 }, false, { shift: false });
    e.moveStroke({ x: 16, y: 10 }, { shift: false });
    e.endStroke();
    const at = (x: number, y: number) => e.getState().doc.layers[0].pixels[y * 32 + x];
    expect(e.getState().options).toMatchObject({ boxWidth: 4, boxDepth: 4 });
    expect(at(16, 2)).toBe(RED);
    const left = at(10, 10);
    const right = at(22, 10);
    expect(left).not.toBe(RED);
    expect(right).not.toBe(left);
    expect(left).not.toBe(0);
    e.setOption('boxHeight', 2);
    expect(at(16, 20)).toBe(0);
    e.setOption('boxHeight', 12);
    expect(at(16, 20)).not.toBe(0);
    e.undo();
    expect(e.getState().doc.layers[0].pixels.every((c) => c === 0)).toBe(true);
  });
});
