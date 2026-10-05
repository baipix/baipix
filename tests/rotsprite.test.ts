import { describe, expect, it } from 'vitest';
import { pack } from '../src/engine/color';
import { Editor } from '../src/engine/editor';
import { rotatedSize, rotator, scale2x } from '../src/engine/rotsprite';

const R = pack(255, 0, 0);
const B = pack(0, 0, 255);

describe('scale2x', () => {
  it('doubles a block and rounds a diagonal step', () => {
    // A 2×2 diagonal: R on the top-left and bottom-right.
    const out = scale2x({ width: 2, height: 2, pixels: Uint32Array.from([R, 0, 0, R]) });
    expect([out.width, out.height]).toEqual([4, 4]);
    expect(new Set(out.pixels)).toEqual(new Set([R, 0]));
  });
});

describe('rotator', () => {
  const block = { width: 3, height: 2, pixels: Uint32Array.from([R, R, B, R, R, R]) };

  it('turns right angles exactly', () => {
    const quarter = rotator(block).rotate(90);
    expect([quarter.width, quarter.height]).toEqual([2, 3]);
    // Clockwise: the top-right blue pixel ends at the bottom-right.
    expect(quarter.pixels[2 * 2 + 1]).toBe(B);
    expect([...rotator(block).rotate(360).pixels]).toEqual([...block.pixels]);
  });

  it('turns any angle into its bounding box, with only the block’s colors', () => {
    const r = rotator({ width: 8, height: 4, pixels: new Uint32Array(32).fill(R) }).rotate(30);
    expect([r.width, r.height]).toEqual([rotatedSize(8, 4, 30).width, rotatedSize(8, 4, 30).height]);
    expect(new Set(r.pixels)).toEqual(new Set([R, 0]));
    // The middle stays filled.
    expect(r.pixels[Math.floor(r.height / 2) * r.width + Math.floor(r.width / 2)]).toBe(R);
  });
});

describe('Editor rotate by dragging', () => {
  it('previews, then commits one undo step', () => {
    const e = new Editor();
    e.newFile(16, 16);
    const px = () => e.getState().doc.layers[0].pixels;
    for (let x = 4; x < 12; x++) px()[8 * 16 + x] = R; // a horizontal line
    expect(e.beginRotate()).toEqual({ x: 4, y: 8, w: 8, h: 1 });
    e.previewRotate(90);
    expect(px()[8 * 16 + 4]).toBe(0);
    expect([...px()].filter((c) => c === R)).toHaveLength(8);
    e.endScale();
    e.undo();
    expect(px()[8 * 16 + 4]).toBe(R);
  });
});
