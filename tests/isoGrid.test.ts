import { describe, expect, it } from 'vitest';
import { pack } from '../src/engine/color';
import { isoCellSize } from '../src/engine/document';
import { DEFAULT_ISO_CELL, Editor } from '../src/engine/editor';
import { documentFromJson, documentToJson } from '../src/storage/fileFormat';

const RED = pack(255, 0, 0);

describe('isometric grid', () => {
  it('is off in a new file, and turns on with 16 pixel wide diamonds', () => {
    const e = new Editor();
    expect(e.getState().doc.isoGrid).toBeUndefined();
    e.toggleIsoGrid();
    expect(e.getState().doc.isoGrid).toBe(DEFAULT_ISO_CELL);
  });

  it('keeps cells a multiple of 4, so the diamonds’ corners fall on pixel corners', () => {
    expect(isoCellSize(15)).toBe(16);
    expect(isoCellSize(18)).toBe(20);
    expect(isoCellSize(1)).toBe(4);
    expect(isoCellSize(1000)).toBe(256);
  });

  it('belongs to the file: saved in it, and switching files switches it', () => {
    const e = new Editor();
    e.setIsoGrid(32);
    const first = e.getState().activeId;
    expect(documentFromJson(documentToJson(e.getState().doc)).isoGrid).toBe(32);
    e.newFile(16, 16);
    expect(e.getState().doc.isoGrid).toBeUndefined();
    // Turned on in another file, it takes the width last picked.
    e.toggleIsoGrid();
    expect(e.getState().doc.isoGrid).toBe(32);
    e.setIsoGrid(null);
    e.switchFile(first);
    expect(e.getState().doc.isoGrid).toBe(32);
  });

  it('stays as it is across undo', () => {
    const e = new Editor();
    e.setColor('primary', RED);
    e.setTool('pencil');
    e.beginStroke({ x: 0, y: 0 }, false, { shift: false });
    e.endStroke();
    e.setIsoGrid(24);
    e.undo();
    expect(e.getState().doc.isoGrid).toBe(24);
  });

  it('remembers the width last picked with the preferences', () => {
    const e = new Editor();
    e.setIsoGrid(40);
    const again = new Editor();
    again.setPreferences(e.getPreferences());
    again.toggleIsoGrid();
    expect(again.getState().doc.isoGrid).toBe(40);
  });
});

describe('snapping to the isometric grid', () => {
  const painted = (e: Editor) => {
    const { width, layers } = e.getState().doc;
    const px = layers[0].pixels;
    return [...px.keys()].filter((i) => px[i]).map((i) => [i % width, Math.floor(i / width)]);
  };

  it('puts the box’s top corner on a corner of the diamonds, its sides whole diamond edges', () => {
    const e = new Editor();
    e.newFile(64, 64);
    e.setIsoGrid(16);
    e.setColor('primary', RED);
    e.setTool('box');
    e.beginStroke({ x: 25, y: 3 }, false, { shift: false });
    e.moveStroke({ x: 26, y: 13 }, { shift: false });
    e.endStroke();
    // Corners every 8 pixels across and 4 down: (24, 4) is one.
    const top = Math.min(...painted(e).map(([, y]) => y));
    expect(top).toBe(4);
    expect(
      painted(e)
        .filter(([, y]) => y === top)
        .map(([x]) => x),
    ).toEqual([23, 24]);
    const { boxWidth, boxDepth } = e.getState().options;
    expect(boxWidth % 4).toBe(0);
    expect(boxDepth % 4).toBe(0);
  });

  it('keeps Shift-click pencil lines to the isometric angles', () => {
    const e = new Editor();
    e.newFile(16, 16);
    e.setIsoGrid(16);
    e.setColor('primary', RED);
    e.setTool('pencil');
    e.setOption('pixelPerfect', false);
    e.beginStroke({ x: 0, y: 0 }, false, { shift: false });
    e.endStroke();
    e.beginStroke({ x: 5, y: 2 }, false, { shift: true });
    e.endStroke();
    expect(painted(e).map(([x, y]) => `${x},${y}`)).toEqual(['0,0', '1,0', '2,1', '3,1', '4,2', '5,2']);
  });
});

describe('the Isometric scene template', () => {
  it('starts with the grid on', async () => {
    const { TEMPLATES, createFromTemplate } = await import('../src/ui/templates');
    const e = new Editor();
    createFromTemplate(
      e,
      TEMPLATES.find((t) => t.id === 'iso')!,
    );
    expect(e.getState().doc).toMatchObject({ width: 128, height: 128, isoGrid: 16 });
  });
});

describe('vertical lines in the isometric grid', () => {
  it('are saved with the file and stay across undo', () => {
    const e = new Editor();
    e.setIsoGrid(16);
    e.setIsoGridVertical(true);
    expect(documentFromJson(documentToJson(e.getState().doc)).isoGridVertical).toBe(true);
    e.setColor('primary', RED);
    e.setTool('pencil');
    e.beginStroke({ x: 0, y: 0 }, false, { shift: false });
    e.endStroke();
    e.undo();
    expect(e.getState().doc.isoGridVertical).toBe(true);
    e.setIsoGridVertical(false);
    expect(documentFromJson(documentToJson(e.getState().doc)).isoGridVertical).toBeUndefined();
  });
});
