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
    expect(e.deleteBoard(e.getState().boards[0].id)).toBe(false);
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
});
