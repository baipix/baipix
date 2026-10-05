import { describe, expect, it } from 'vitest';
import { pack } from '../src/engine/color';
import { Editor } from '../src/engine/editor';

const RED = pack(255, 0, 0);
const doc = (e: Editor) => e.getState().doc;
const pixels = (e: Editor) => doc(e).layers[0].pixels;
const dot = (e: Editor, x: number, y: number) => {
  e.setColor('primary', RED);
  e.beginStroke({ x, y }, false, { shift: false });
  e.endStroke();
};

describe('Canvas resize with an offset', () => {
  it('places the old canvas at the offset', () => {
    const e = new Editor();
    dot(e, 0, 0);
    e.resize(40, 36, { x: 8, y: 4 });
    expect(doc(e)).toMatchObject({ width: 40, height: 36 });
    expect(pixels(e)[4 * 40 + 8]).toBe(RED);
    expect([...pixels(e)].filter(Boolean).length).toBe(1);
  });

  it('stays centered without one', () => {
    const e = new Editor();
    dot(e, 0, 0);
    e.resize(36, 34);
    expect(pixels(e)[1 * 36 + 2]).toBe(RED);
  });

  it('keeps what a crop cuts off, and brings it back', () => {
    const e = new Editor();
    dot(e, 30, 30);
    // The top-left 16 × 16 of the drawing.
    e.resize(16, 16, { x: 0, y: 0 });
    expect([...pixels(e)].filter(Boolean).length).toBe(0);
    expect(doc(e).layers[0].outside).toBeDefined();
    e.resize(32, 32, { x: 0, y: 0 });
    expect(pixels(e)[30 * 32 + 30]).toBe(RED);
  });

  it('shifts the drawing at the same size', () => {
    const e = new Editor();
    dot(e, 5, 5);
    e.resize(32, 32, { x: -2, y: 3 });
    expect(pixels(e)[8 * 32 + 3]).toBe(RED);
  });

  it('moves the guides, the axes and the reference by the same offset', () => {
    const e = new Editor();
    e.setGuide('x', null, 2);
    e.setGuide('y', null, 10);
    e.setMirrorAxis('x', 6);
    e.setMirrorAxis('y', 20.5);
    const ref = { src: 'data:image/png;base64,', width: 1, height: 1, x: 1, y: 1, w: 8, h: 8 };
    e.setReference({ ...ref, opacity: 1, visible: true });
    e.resize(48, 40, { x: 10, y: -3 });
    expect(doc(e).guides).toEqual({ x: [12], y: [7] });
    expect(doc(e)).toMatchObject({ axisX: 16, axisY: 17.5 });
    expect(doc(e).reference).toMatchObject({ x: 11, y: -2 });
  });

  it('is one undo step', () => {
    const e = new Editor();
    dot(e, 0, 0);
    e.resize(20, 24, { x: 3, y: 2 });
    e.undo();
    expect(doc(e)).toMatchObject({ width: 32, height: 32 });
    expect(pixels(e)[0]).toBe(RED);
    e.redo();
    expect(doc(e)).toMatchObject({ width: 20, height: 24 });
    expect(pixels(e)[2 * 20 + 3]).toBe(RED);
    e.undo();
    e.undo();
    expect([...pixels(e)].filter(Boolean).length).toBe(0);
  });
});
