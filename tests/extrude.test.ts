import { describe, expect, it } from 'vitest';
import { pack } from '../src/engine/color';
import { Editor } from '../src/engine/editor';
import { extrude } from '../src/engine/extrude';
import { isoBox, type BoxFace } from '../src/engine/isoBox';
import { PaletteIndex } from '../src/engine/palette';

const GREEN = pack(60, 170, 80);

describe('extrusion', () => {
  it('pulls the top of a box up into the same box', () => {
    const W = 20;
    const H = 16;
    const box = new Map<string, BoxFace>();
    isoBox({ x: 10, y: 5 }, { width: 2, depth: 2, height: 3 }, false, (x, y, f) => box.set(`${x},${y}`, f));
    const px = new Uint32Array(W * H);
    const region = new Uint8Array(W * H);
    isoBox({ x: 10, y: 8 }, { width: 2, depth: 2, height: 0 }, false, (x, y, f) => {
      if (f !== 'top') return;
      px[y * W + x] = GREEN;
      region[y * W + x] = 1;
    });
    extrude(px, W, H, region, { height: 3, outline: false, light: false }, new PaletteIndex([]));
    const drawn = [...px.keys()].filter((i) => px[i]).map((i) => `${i % W},${Math.floor(i / W)}`);
    expect(new Set(drawn)).toEqual(new Set(box.keys()));
    // Same faces: the top stays as drawn, the sides darker, the right one more.
    const at = (k: string) => px[+k.split(',')[1] * W + +k.split(',')[0]];
    const face = (f: BoxFace) => [...box].filter(([, v]) => v === f).map(([k]) => at(k));
    expect(new Set(face('top'))).toEqual(new Set([GREEN]));
    expect(new Set(face('left')).size).toBe(1);
    expect(new Set(face('right')).size).toBe(1);
    expect(face('left')[0]).not.toBe(face('right')[0]);
  });

  it('is set up live, then kept in one undo step or dropped', () => {
    const e = new Editor();
    e.newFile(32, 32);
    e.setColor('primary', GREEN);
    e.setTool('rect');
    e.setOption('filled', true);
    e.beginStroke({ x: 8, y: 20 }, false, { shift: false });
    e.moveStroke({ x: 15, y: 23 }, { shift: false });
    e.endStroke();
    const count = () => e.getState().doc.layers[0].pixels.filter(Boolean).length;
    expect(count()).toBe(32);
    expect(e.beginExtrude()).toBe(true);
    e.setExtrude({ height: 6, outline: false, light: false });
    // The top went up by 6, and the sides fill under its lowest row: 8 columns × 6 rows more.
    expect(count()).toBe(32 + 48);
    e.setExtrude({ height: 2, outline: false, light: false });
    expect(count()).toBe(32 + 16);
    e.endExtrude(false);
    expect(count()).toBe(32);
    e.beginExtrude();
    e.setExtrude({ height: 4, outline: true, light: true });
    e.endExtrude(true);
    expect(count()).toBe(32 + 32);
    e.undo();
    expect(count()).toBe(32);
  });
});
