import { describe, expect, it } from 'vitest';
import { pack } from '../src/engine/color';
import { Editor } from '../src/engine/editor';
import type { BoxFace } from '../src/engine/isoBox';
import { isoRamp, type RampDirection } from '../src/engine/isoRamp';

const MARK: Record<BoxFace, string> = {
  top: 'T',
  left: 'L',
  right: 'R',
  edge: 'o',
  light: '+',
  bevelLeft: 'l',
  bevelRight: 'r',
};

/** The ramp as rows of text. */
function art(direction: RampDirection, steps: number): string[] {
  const cells = new Map<string, string>();
  isoRamp({ x: 0, y: 0 }, { width: 3, depth: 3, height: 6 }, direction, steps, (x, y, f) =>
    cells.set(`${x},${y}`, MARK[f]),
  );
  const xs = [...cells.keys()].map((k) => +k.split(',')[0]);
  const ys = [...cells.keys()].map((k) => +k.split(',')[1]);
  const rows: string[] = [];
  for (let y = Math.min(...ys); y <= Math.max(...ys); y++) {
    let r = '';
    for (let x = Math.min(...xs); x <= Math.max(...xs); x++) r += cells.get(`${x},${y}`) ?? '.';
    rows.push(r);
  }
  return rows;
}

describe('isometric stairs and ramps', () => {
  it('rises toward its far corner: the slope, the high end and the side showing', () => {
    expect(art('se', 0)).toEqual([
      '...........TT',
      '.........TTTR',
      '.......TTTRRR',
      '.....TTTRRRRR',
      '...TTTLRRRRRR',
      '.TTTLLLRRRRRR',
      'TTLLLLLRRRRRR',
      '.LLLLLLRRRRR.',
      '...LLLLRRR...',
      '.....LLR.....',
    ]);
  });

  it('becomes a staircase with steps, treads and risers taking turns', () => {
    expect(art('nw', 3)).toEqual([
      '......TT......',
      '....TTTTTT....',
      '..TTTTTTRR....',
      'TTTTTTRRTT....',
      'LLTTRRTTTTTT..',
      'LLLRTTTTTTRR..',
      'LLTTTTTTRRTT..',
      'LLLLTTRRTTTTTT',
      'LLLLLRTTTTTTRR',
      'LLLLTTTTTTRRRR',
      '..LLLLTTRRRR..',
      '....LLLRRR....',
      '......LR......',
    ]);
  });

  it('is drawn by the ramp tool from a drag, without hanging on its first point', () => {
    const e = new Editor();
    e.newFile(48, 32);
    e.setColor('primary', pack(170, 150, 120));
    e.setTool('ramp');
    e.beginStroke({ x: 24, y: 4 }, false, { shift: false });
    e.moveStroke({ x: 24, y: 16 }, { shift: false });
    e.endStroke();
    expect(e.getState().doc.layers[0].pixels.some(Boolean)).toBe(true);
  });
});
