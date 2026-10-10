import { describe, expect, it } from 'vitest';
import { pack } from '../src/engine/color';
import { Editor } from '../src/engine/editor';
import { deserializeDocument, serializeDocument } from '../src/storage/fileFormat';

const guides = (e: Editor) => e.getState().doc.guides;

describe('Guides', () => {
  it('are added, moved and removed, on whole pixels', () => {
    const e = new Editor();
    expect(e.setGuide('x', null, 4.4)).toBe(0);
    expect(e.setGuide('y', null, 10)).toBe(0);
    expect(guides(e)).toEqual({ x: [4], y: [10] });
    e.setGuide('x', 0, 7.6);
    expect(guides(e)).toEqual({ x: [8], y: [10] });
    expect(e.setGuide('x', 0, null)).toBe(-1);
    e.setGuide('y', 0, null);
    expect(guides(e)).toBeUndefined();
  });

  it('stay put when undoing a drawing step', () => {
    const e = new Editor();
    e.setColor('primary', pack(255, 0, 0));
    e.beginStroke({ x: 0, y: 0 }, false, { shift: false });
    e.endStroke();
    e.setGuide('x', null, 3);
    e.undo();
    expect(guides(e)).toEqual({ x: [3], y: [] });
  });

  it('follow the drawing when the canvas is resized', () => {
    const e = new Editor();
    const { width, height } = e.getState().doc;
    e.setGuide('x', null, 2);
    e.resize(width + 4, height);
    expect(guides(e)).toEqual({ x: [4], y: [] });
    // Undoing the resize puts them back with the drawing, and redoing moves them again.
    e.undo();
    expect(e.getState().doc.width).toBe(width);
    expect(guides(e)).toEqual({ x: [2], y: [] });
    e.redo();
    expect(guides(e)).toEqual({ x: [4], y: [] });
    // Other steps still leave them where they are.
    e.setGuide('x', 0, 6);
    e.setColor('primary', 0xff0000ff);
    e.beginStroke({ x: 0, y: 0 }, false, { shift: false });
    e.endStroke();
    e.undo();
    expect(guides(e)).toEqual({ x: [6], y: [] });
  });

  it('are saved in .baipix files, and checked when read', () => {
    const e = new Editor();
    e.setGuide('y', null, 5);
    const json = JSON.parse(JSON.stringify(serializeDocument(e.getState().doc)));
    expect(deserializeDocument(json).guides).toEqual({ x: [], y: [5] });
    expect(deserializeDocument({ ...json, guides: { x: ['a', 2.6], y: 'no' } }).guides).toEqual({
      x: [3],
      y: [],
    });
    expect(deserializeDocument({ ...json, guides: undefined }).guides).toBeUndefined();
  });
});
