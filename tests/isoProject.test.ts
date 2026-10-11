import { describe, expect, it } from 'vitest';
import { pack } from '../src/engine/color';
import { Editor } from '../src/engine/editor';
import { isoFaceMapping, type IsoFace } from '../src/engine/isoProject';

/** A w × h image whose pixels are letters, laid on a face, as text. */
function art(face: IsoFace, rows: string[]): string[] {
  const w = rows[0].length;
  const h = rows.length;
  const letters = rows.join('');
  const { width, height, source } = isoFaceMapping(face, w, h);
  const out: string[] = [];
  for (let y = 0; y < height; y++) {
    let row = '';
    for (let x = 0; x < width; x++) {
      const from = source[y * width + x];
      row += from < 0 ? '.' : letters[from];
    }
    out.push(row);
  }
  return out;
}

describe('putting an image on an isometric face', () => {
  it('slides the columns down two by two on the left side, losing nothing', () => {
    expect(art('left', ['abcd', 'efgh'])).toEqual(['ab..', 'efcd', '..gh']);
  });

  it('slides them up toward the right on the right side', () => {
    expect(art('right', ['abcd', 'efgh'])).toEqual(['..cd', 'abgh', 'ef..']);
  });

  it('turns it by 45° and flattens it on the top, at twice its size so no pixel is lost', () => {
    expect(art('top', ['ab', 'cd'])).toEqual(['..aa..', 'ccaabb', 'ccddbb', '..dd..']);
    const big = art('top', ['abcdef', 'ghijkl', 'mnopqr']).join('');
    for (const letter of 'abcdefghijklmnopqr') expect(big.split(letter).length - 1).toBe(4);
  });

  it('works on the selection, which takes the face’s shape, in one undo step', () => {
    const RED = pack(255, 0, 0);
    const e = new Editor();
    e.newFile(16, 16);
    e.setColor('primary', RED);
    e.setTool('select');
    e.beginStroke({ x: 2, y: 2 }, false, { shift: false });
    e.moveStroke({ x: 5, y: 3 }, { shift: false });
    e.endStroke();
    e.fill();
    e.putOnIsoFace('left');
    // Read again each time: undo brings back the layer's earlier pixels.
    const at = (x: number, y: number) => e.getState().doc.layers[0].pixels[y * 16 + x];
    expect(at(2, 2)).toBe(RED);
    expect(at(4, 2)).toBe(0);
    expect(at(4, 4)).toBe(RED);
    expect(e.getState().selection).toMatchObject({ x: 2, y: 2, w: 4, h: 3 });
    e.undo();
    expect(at(4, 2)).toBe(RED);
    expect(at(4, 4)).toBe(0);
  });
});
