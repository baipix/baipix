import { describe, expect, it } from 'vitest';
import { pack } from '../src/engine/color';
import { Editor } from '../src/engine/editor';
import { presetColors } from '../src/engine/palette';
import { documentFromJson, documentToJson } from '../src/storage/fileFormat';

const RED = pack(255, 0, 0);
const BLUE = pack(0, 0, 255);

const dot = (e: Editor, x: number, color: number) => {
  e.setColor('primary', color);
  e.setTool('pencil');
  e.beginStroke({ x, y: 0 }, false, { shift: false });
  e.endStroke();
};

describe('the palette belongs to the file', () => {
  it('starts as the colors of the drawing, which follow what is drawn', () => {
    const e = new Editor();
    expect(e.getState().palette).toMatchObject({ key: 'drawing', colors: [] });
    dot(e, 0, RED);
    dot(e, 1, BLUE);
    expect(new Set(e.getState().palette.colors)).toEqual(new Set([RED, BLUE]));
    e.undo();
    expect(e.getState().palette.colors).toEqual([RED]);
  });

  it('is each file’s own: switching files switches palettes', () => {
    const e = new Editor();
    e.setPalettePreset('pico8');
    const first = e.getState().activeId;
    e.newFile(16, 16);
    expect(e.getState().palette.key).toBe('drawing');
    e.setPalettePreset('sweetie16');
    e.switchFile(first);
    expect(e.getState().palette).toMatchObject({ key: 'pico8', colors: presetColors('pico8') });
  });

  it('is saved in .baipix files; older files open with the colors of the drawing', () => {
    const e = new Editor();
    e.setPaletteColors([RED, BLUE]);
    const back = documentFromJson(documentToJson(e.getState().doc));
    expect(back.palette).toMatchObject({ key: 'custom', colors: [RED, BLUE] });
    e.setPalettePreset('gameboy');
    expect(documentFromJson(documentToJson(e.getState().doc)).palette).toMatchObject({
      key: 'gameboy',
      colors: presetColors('gameboy'),
    });
    const old = JSON.parse(documentToJson(e.getState().doc));
    delete old.palette;
    expect(documentFromJson(JSON.stringify(old)).palette).toBeUndefined();
    old.palette = { key: 'nope', colors: [1] };
    expect(documentFromJson(JSON.stringify(old)).palette).toBeUndefined();
  });

  it('stays as edited when a drawing step is undone', () => {
    const e = new Editor();
    e.setPalettePreset('sweetie16');
    dot(e, 0, RED);
    e.addToPalette(RED);
    e.undo(); // the dot, not the palette
    expect(e.getState().palette.colors).toContain(RED);
  });

  it('a color adjustment leaves the colors of the drawing in that mode', () => {
    const e = new Editor();
    dot(e, 0, RED);
    e.beginAdjust(true);
    e.applyAdjust({ hue: 120, saturation: 100, brightness: 100 }, true);
    const { palette, doc } = e.getState();
    expect(palette.key).toBe('drawing');
    expect(palette.colors).toEqual([doc.layers[0].pixels[0]]);
  });
});

describe('my palettes', () => {
  it('saves the file’s palette under a name, and copies it into another file', () => {
    const e = new Editor();
    e.setPaletteColors([RED, BLUE]);
    const id = e.savePalette('Sunset')!;
    expect(e.getState().myPalettes).toEqual([{ id, name: 'Sunset', colors: [RED, BLUE] }]);
    e.newFile(8, 8);
    e.useMyPalette(id);
    expect(e.getState().palette).toMatchObject({ key: `mine:${id}`, colors: [RED, BLUE] });
    // A copy: editing the file's palette doesn't change mine, and the other way round.
    e.addToPalette(pack(0, 255, 0));
    expect(e.getState().palette.key).toBe('custom');
    expect(e.getState().myPalettes[0].colors).toEqual([RED, BLUE]);
  });

  it('renames, replaces with the file’s palette, deletes, and is kept in the preferences', () => {
    const e = new Editor();
    e.setPaletteColors([RED]);
    const id = e.savePalette('')!;
    expect(e.getState().myPalettes[0].name).toBe('My palette 1');
    e.renamePalette(id, 'Reds');
    e.setPaletteColors([BLUE]);
    e.updatePalette(id);
    expect(e.getState().myPalettes[0]).toMatchObject({ name: 'Reds', colors: [BLUE] });
    const other = new Editor();
    other.setPreferences(e.getPreferences());
    expect(other.getState().myPalettes).toEqual(e.getState().myPalettes);
    e.deletePalette(id);
    expect(e.getState().myPalettes).toEqual([]);
  });

  it('keeps a file’s palette taken from mine when saved, even where mine is gone', () => {
    const e = new Editor();
    e.setPaletteColors([RED, BLUE]);
    e.useMyPalette(e.savePalette('Two')!);
    const back = documentFromJson(documentToJson(e.getState().doc));
    expect(back.palette?.key.startsWith('mine:')).toBe(true);
    expect(back.palette?.colors).toEqual([RED, BLUE]);
  });
});
