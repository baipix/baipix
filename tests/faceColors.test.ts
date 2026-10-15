import { describe, expect, it } from 'vitest';
import { pack } from '../src/engine/color';
import { Editor } from '../src/engine/editor';

const RED = pack(200, 40, 40);
const GREEN = pack(40, 200, 40);
const BLUE = pack(40, 40, 200);

describe('a color per face on isometric volumes', () => {
  it('paints each face of the box in the color picked for it, and redraws the last box', () => {
    const e = new Editor();
    e.newFile(32, 32);
    e.setColor('primary', RED);
    e.setTool('box');
    e.setOption('boxHeight', 4);
    e.beginStroke({ x: 16, y: 2 }, false, { shift: false });
    e.moveStroke({ x: 16, y: 10 }, { shift: false });
    e.endStroke();
    const px = (x: number, y: number) => e.getState().doc.layers[0].pixels[y * 32 + x];
    // Shaded from red at first: the left face darker than the top.
    const top = px(15, 5);
    expect(top).toBe(RED);
    expect(px(10, 9)).not.toBe(RED);
    // The left face in green, the right one in blue: the box is redrawn with them.
    e.setColor('primary', GREEN);
    e.setVolumeFace('left');
    e.setColor('primary', BLUE);
    e.setVolumeFace('right');
    expect(e.getState().options.boxFaces).toEqual({ top: RED, left: GREEN, right: BLUE });
    expect(px(15, 5)).toBe(RED);
    expect(px(10, 9)).toBe(GREEN);
    expect(px(21, 9)).toBe(BLUE);
    // Back to shading from the color: the box's own, red, while it can still be changed.
    e.setOption('boxFaces', null);
    expect(e.volumeFaces().top).toBe(RED);
    expect(px(21, 9)).not.toBe(BLUE);
    expect(px(10, 9)).not.toBe(GREEN);
  });
});

describe('inner edges on isometric volumes', () => {
  it('draws a line between the faces of the box, in the outline color', () => {
    const e = new Editor();
    e.newFile(32, 32);
    e.setColor('primary', RED);
    e.setTool('box');
    e.setOption('boxHeight', 4);
    e.setOption('boxFaces', { top: RED, left: GREEN, right: BLUE });
    e.beginStroke({ x: 16, y: 2 }, false, { shift: false });
    e.moveStroke({ x: 16, y: 10 }, { shift: false });
    e.endStroke();
    const px = (x: number, y: number) => e.getState().doc.layers[0].pixels[y * 32 + x];
    const sides = (y: number) => [...Array(32).keys()].map((x) => px(x, y));
    const before = new Set(e.getState().doc.layers[0].pixels);
    e.setOption('boxEdges', true);
    const after = new Set(e.getState().doc.layers[0].pixels);
    // A new color, the outline's: under the top, and down the front corner.
    const edge = [...after].find((c) => !before.has(c))!;
    expect(edge).toBeDefined();
    expect(sides(13).filter((c) => c === edge)).toHaveLength(1);
    expect(px(10, 9)).toBe(GREEN);
  });
});
