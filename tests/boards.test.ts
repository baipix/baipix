import { describe, expect, it } from 'vitest';
import { pack } from '../src/engine/color';
import { Editor } from '../src/engine/editor';
import { fileFromJson, fileToJson } from '../src/storage/fileFormat';
import { fromStored, toStored } from '../src/storage/workspace';

const RED = pack(255, 0, 0);

/** An editor holding only a file named Icons, of two boards. */
function twoBoards() {
  const e = new Editor();
  const starter = e.getState().activeId;
  e.newFile(16, 16, 'Icons');
  e.discardFile(starter);
  e.getState().doc.layers[0].pixels[0] = RED;
  e.addBoard(24, 0, 8, 8, 'Small');
  return e;
}

describe('boards', () => {
  it('makes a file of its own a file of boards, opened on the new one', () => {
    const e = twoBoards();
    const s = e.getState();
    expect(s.files).toHaveLength(1);
    expect(s.files[0]).toMatchObject({ name: 'Icons', boards: 2 });
    expect(s.boards.map((b) => [b.name, b.x, b.y, b.width])).toEqual([
      ['Icons', 0, 0, 16],
      ['Small', 24, 0, 8],
    ]);
    expect(s.doc.name).toBe('Small');
    expect(s.activeId).toBe(s.files[0].id);
  });

  it('switches between boards, and reopens a file on the board last used', () => {
    const e = twoBoards();
    const [first, second] = e.getState().boards;
    e.switchBoard(first.id);
    expect(e.getState().doc.name).toBe('Icons');
    e.switchBoard(second.id);
    e.newFile(4, 4, 'Other');
    e.getState().doc.layers[0].pixels[0] = RED;
    e.switchFile(e.getState().files[0].id);
    expect(e.getState().doc.name).toBe('Small');
  });

  it('renames, moves and deletes boards, and renames the file apart from them', () => {
    const e = twoBoards();
    const small = e.getState().boards[1].id;
    e.renameBoard(small, 'Tiny');
    e.moveBoard(small, 40, 8);
    e.renameFile(e.getState().activeId, 'Sprites');
    const s = e.getState();
    expect(s.files[0].name).toBe('Sprites');
    expect(s.boards[1]).toMatchObject({ name: 'Tiny', x: 40, y: 8 });
    expect(e.deleteBoard(small)).toBe(true);
    expect(e.getState().boards).toHaveLength(1);
  });

  it('deletes, brings back and duplicates a whole file', () => {
    const e = twoBoards();
    e.newFile(4, 4, 'Other');
    e.getState().doc.layers[0].pixels[0] = RED;
    const icons = e.getState().files[0].id;
    e.duplicateFile(icons);
    expect(e.getState().files.map((f) => [f.name, f.boards])).toEqual([
      ['Icons', 2],
      ['Icons copy', 2],
      ['Other', 1],
    ]);
    e.deleteFile(icons);
    expect(e.getState().files.map((f) => f.name)).toEqual(['Icons copy', 'Other']);
    e.restoreDeleted();
    expect(e.getState().files.map((f) => f.boards)).toEqual([2, 2, 1]);
  });

  it('saves a file of boards in one .baipix file, and keeps them in the workspace', () => {
    const e = twoBoards();
    const boards = fileFromJson(fileToJson(e.fileBoards()));
    expect(boards.map((b) => [b.name, b.board?.x, b.board?.fileName])).toEqual([
      ['Icons', 0, 'Icons'],
      ['Small', 24, 'Icons'],
    ]);
    expect(boards[0].board?.file).toBe(boards[1].board?.file);
    expect(boards[0].layers[0].pixels[0]).toBe(RED);
    // A file of one board stays a plain file.
    const one = new Editor();
    void one.getState();
    expect(JSON.parse(fileToJson(one.fileBoards())).version).toBe(1);
    // The workspace keeps each board's place.
    const back = fromStored(
      toStored({
        documents: e.getDocuments(),
        activeId: e.getState().doc.id,
        preferences: e.getPreferences(),
        ui: {},
      }),
    );
    expect(back!.documents.map((d) => d.board?.x)).toEqual([0, 24]);
  });

  it('adds a board beside the active one, duplicates it, and brings back a deleted one', () => {
    const e = twoBoards();
    e.addBoardBeside();
    const added = e.getState().boards[2];
    expect(added).toMatchObject({ x: 24 + 8 + 16, y: 0, width: 8, height: 8 });
    e.duplicateBoard(added.id);
    const copy = e.getState().boards[3];
    expect(copy).toMatchObject({ x: added.x + 8 + 16, width: 8 });
    expect(copy.name).toBe(`${added.name} copy`);
    e.deleteBoard(copy.id);
    expect(e.getState().boards).toHaveLength(3);
    e.restoreDeleted();
    expect(e.getState().boards).toHaveLength(4);
    expect(e.getState().doc.id).toBe(copy.id);
  });

  it('shares the palette between a file’s boards, undo included', () => {
    const e = twoBoards();
    e.setPalettePreset('pico8');
    const [first, second] = e.getState().boards;
    e.switchBoard(first.id);
    expect(e.getState().palette.key).toBe('pico8');
    e.addToPalette(RED);
    e.switchBoard(second.id);
    expect(e.getState().palette.colors).toContain(RED);
    e.switchBoard(first.id);
    e.undo();
    e.switchBoard(second.id);
    expect(e.getState().palette.colors).not.toContain(RED);
  });

  it('selects boards, the last one becoming active, and lets go of them when drawing', () => {
    const e = twoBoards();
    const [first, second] = e.getState().boards;
    e.selectBoards([first.id]);
    expect(e.getState()).toMatchObject({ selectedBoards: [first.id] });
    expect(e.getState().doc.id).toBe(first.id);
    e.selectBoards([second.id], true);
    expect(e.getState().selectedBoards).toEqual([first.id, second.id]);
    expect(e.getState().doc.id).toBe(second.id);
    e.setTool('pencil');
    e.beginStroke({ x: 1, y: 1 }, false, { shift: false });
    e.endStroke();
    expect(e.getState().selectedBoards).toEqual([]);
  });

  it('resizes a board by its left side, the drawing staying put in the file, in one undo step', () => {
    const e = twoBoards();
    const small = e.getState().boards[1];
    e.switchBoard(small.id);
    e.getState().doc.layers[0].pixels[0] = RED;
    // Pull the left side 4 pixels further left: 4 wider, 4 pixels to the left in the file.
    e.resizeBoardTo({ x: small.x - 4, y: small.y, w: small.width + 4, h: small.height });
    const grown = e.getState().boards[1];
    expect(grown).toMatchObject({ x: small.x - 4, width: small.width + 4 });
    expect(e.getState().doc.layers[0].pixels[4]).toBe(RED);
    e.undo();
    expect(e.getState().boards[1]).toMatchObject({ x: small.x, width: small.width });
  });

  it('keeps a board where it was moved, and its new name, when a drawing step is undone', () => {
    const e = twoBoards();
    const small = e.getState().boards[1];
    e.switchBoard(small.id);
    e.setTool('pencil');
    e.beginStroke({ x: 1, y: 1 }, false, { shift: false });
    e.endStroke();
    e.moveBoard(small.id, 60, 30);
    e.renameBoard(small.id, 'Moved');
    e.undo();
    expect(e.getState().boards[1]).toMatchObject({ name: 'Moved', x: 60, y: 30 });
  });

  it('deletes the selected boards in one go, one Undo bringing them back', () => {
    const e = twoBoards();
    e.addBoardBeside();
    const ids = e.getState().boards.map((b) => b.id);
    expect(e.deleteBoards(ids.slice(1))).toBe(2);
    expect(e.getState().boards.map((b) => b.id)).toEqual([ids[0]]);
    e.restoreDeleted();
    expect(e.getState().boards).toHaveLength(3);
  });

  it('can be left with no board, then makes one or brings them back', () => {
    const e = twoBoards();
    const ids = e.getState().boards.map((b) => b.id);
    expect(e.deleteBoards(ids)).toBe(2);
    let s = e.getState();
    expect(s.boards).toEqual([]);
    expect(s.files[0]).toMatchObject({ name: 'Icons', boards: 0 });
    // Nothing to draw on.
    e.setTool('pencil');
    expect(e.beginStroke({ x: 0, y: 0 }, false, { shift: false })).toBe(false);
    // Saved and opened again, it still has none.
    const again = fileFromJson(fileToJson(e.fileBoards()));
    expect(again.map((d) => d.board?.empty)).toEqual([true]);
    // Undo brings them back, and the blank board goes.
    e.restoreDeleted();
    expect(e.getState().boards.map((b) => b.id)).toEqual(ids);
    expect(e.fileBoards()).toHaveLength(2);
    // A new board takes the blank one's place.
    e.deleteBoards(ids);
    e.addBoard(0, 0, 10, 6);
    s = e.getState();
    expect(s.boards).toHaveLength(1);
    expect(e.fileBoards()).toHaveLength(1);
    expect(s.doc).toMatchObject({ width: 10, height: 6 });
    expect(s.doc.board?.empty).toBeUndefined();
    expect(s.files[0]).toMatchObject({ name: 'Icons', boards: 1 });
  });

  it('copies a board where asked, for Alt-drag', () => {
    const e = twoBoards();
    const small = e.getState().boards[1];
    e.duplicateBoard(small.id, { x: 24, y: 20 });
    expect(e.getState().boards[2]).toMatchObject({ name: 'Small copy', x: 24, y: 20, width: 8 });
    expect(e.getState().doc.id).toBe(e.getState().boards[2].id);
  });

  it('aligns the selected boards against the box they fill together', () => {
    const e = twoBoards();
    const [icons, small] = e.getState().boards;
    e.moveBoard(small.id, 24, 30);
    e.selectBoards([icons.id, small.id]);
    e.align('top');
    expect(e.getState().boards.map((b) => b.y)).toEqual([0, 0]);
    e.align('bottom');
    // Icons is 16 tall, Small 8: their bottoms meet at 16.
    expect(e.getState().boards.map((b) => b.y + b.height)).toEqual([16, 16]);
    e.align('left');
    expect(e.getState().boards.map((b) => b.x)).toEqual([0, 0]);
  });

  it('moves a layer onto another board, where it was in the file, the first board keeping a layer', () => {
    const e = twoBoards();
    const [icons, small] = e.getState().boards;
    e.switchBoard(icons.id);
    const layer = e.getState().doc.layers[0];
    // One pixel, at (15, 1) in Icons. Small sits 24 pixels to the right of Icons.
    layer.pixels.fill(0);
    layer.pixels[1 * 16 + 15] = RED;
    expect(e.moveLayerToBoard(layer.id, small.id)).toBe(true);
    const s = e.getState();
    expect(s.doc.id).toBe(small.id);
    const moved = s.doc.layers.at(-1)!;
    expect(moved.id).toBe(layer.id);
    // (15, 1) in Icons is (-9, 1) in Small: outside it, kept outside.
    expect(moved.outside).toMatchObject({ x: -9, y: 1 });
    e.switchBoard(icons.id);
    expect(e.getState().doc.layers).toHaveLength(1);
    expect(e.getState().doc.layers[0].id).not.toBe(layer.id);
  });

  it('keeps components on their board', () => {
    const e = twoBoards();
    const [icons, small] = e.getState().boards;
    e.switchBoard(icons.id);
    e.createComponent();
    const layer = e.getState().doc.layers[e.getState().doc.activeLayer];
    expect(e.moveLayerToBoard(layer.id, small.id)).toBe(false);
    expect(e.getState().doc.id).toBe(icons.id);
  });
});
