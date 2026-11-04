import { describe, expect, it } from 'vitest';
import { createAgentApi, parseColor, colorToHex } from '../src/agent/api';
import { Editor } from '../src/engine/editor';

const setup = (w = 8, h = 8) => {
  const api = createAgentApi(new Editor());
  api.newFile(w, h, 'Agent');
  return api;
};

describe('agent API', () => {
  it('parses and prints colors', () => {
    expect(colorToHex(parseColor('#f00'))).toBe('#ff0000');
    expect(colorToHex(parseColor('12345680'))).toBe('#12345680');
    expect(colorToHex(parseColor('#00000000'))).toBeNull();
    expect(() => parseColor('red')).toThrow(/Invalid color/);
  });

  it('creates a file and describes it', () => {
    const api = setup(16, 12);
    const s = api.state();
    expect(s).toMatchObject({ file: 'Agent', width: 16, height: 12, frames: 1, canUndo: false });
    expect(s.layers).toHaveLength(1);
    expect(api.help()).toContain('stroke(points');
  });

  it('draws a stroke with the pencil, as one undo step', () => {
    const api = setup();
    api.stroke(
      [
        [0, 0],
        [3, 0],
      ],
      { tool: 'pencil', color: '#ff0000' },
    );
    expect(api.pixel(0, 0)).toBe('#ff0000');
    expect(api.pixel(3, 0)).toBe('#ff0000');
    expect(api.pixel(4, 0)).toBeNull();
    expect(api.state()).toMatchObject({ tool: 'pencil', primary: '#ff0000' });
    api.undo();
    expect(api.pixel(0, 0)).toBeNull();
  });

  it('draws shapes and fills with the same tools', () => {
    const api = setup();
    api.rect(1, 1, 6, 6, { color: '#000000' });
    expect(api.ascii().rows).toEqual([
      '........',
      '.AAAAAA.',
      '.A....A.',
      '.A....A.',
      '.A....A.',
      '.A....A.',
      '.AAAAAA.',
      '........',
    ]);
    api.fill(3, 3, { color: '#00ff00' });
    expect(api.pixel(3, 3)).toBe('#00ff00');
    expect(api.pixel(0, 0)).toBeNull();
    expect(api.ascii().legend).toEqual({ A: '#000000', B: '#00ff00' });
    api.line(0, 7, 7, 7, { color: '#0000ff' });
    expect(api.pixels()[7].every((c) => c === '#0000ff')).toBe(true);
  });

  it('plots many pixels at once, as one undo step', () => {
    const api = setup(4, 4);
    api.plot([
      [0, 0, '#ff0000'],
      [1, 1, '#00ff00'],
      [9, 9, '#0000ff'],
    ]);
    expect(api.pixel(0, 0)).toBe('#ff0000');
    expect(api.pixel(1, 1)).toBe('#00ff00');
    api.plot([[0, 0, null]]);
    expect(api.pixel(0, 0)).toBeNull();
    api.undo();
    expect(api.pixel(0, 0)).toBe('#ff0000');
    api.undo();
    expect(api.pixel(1, 1)).toBeNull();
  });

  it('works with layers by name', () => {
    const api = setup(4, 4);
    api.addLayer('Ink');
    api.click(0, 0, { tool: 'pencil', color: '#123456' });
    expect(api.pixels('Ink')[0][0]).toBe('#123456');
    expect(api.pixels(0)[0][0]).toBeNull();
    api.setLayerVisible('Ink', false);
    expect(api.pixel(0, 0)).toBeNull();
    expect(() => api.click(1, 1)).toThrow(/layerHidden/);
    expect(() => api.selectLayer('Nope')).toThrow(/No layer/);
  });

  it('keeps tools inside a selection', () => {
    const api = setup(8, 8);
    api.select(0, 0, 4, 4);
    expect(api.state().selection).toEqual({ x: 0, y: 0, w: 4, h: 4 });
    api.line(0, 0, 7, 0, { color: '#ffffff' });
    expect(api.pixel(3, 0)).toBe('#ffffff');
    expect(api.pixel(4, 0)).toBeNull();
  });

  it("gives a stroke's options to that stroke only, never to the box drawn before", () => {
    const api = setup(32, 32);
    const box = (x: number, height: number, top: string) =>
      api.stroke(
        [
          [x, 4],
          [x, 8],
        ],
        { tool: 'box', options: { boxHeight: height, boxFaces: { top, left: '#00ff00', right: '#0000ff' } } },
      );
    box(6, 4, '#ff0000');
    const first = api.pixels();
    box(22, 10, '#ffff00');
    const after = api.pixels();
    // The first box is as it was drawn: its own height and colors, on the left half.
    for (let y = 0; y < 32; y++) expect(after[y].slice(0, 14)).toEqual(first[y].slice(0, 14));
    expect(api.pixel(6, 6)).toBe('#ff0000');
    expect(api.pixel(22, 6)).toBe('#ffff00');
    // On its own, setOptions still tweaks the last box, as it does for a person.
    api.setOptions({ boxFaces: { top: '#ffffff', left: '#00ff00', right: '#0000ff' } });
    expect(api.pixel(22, 6)).toBe('#ffffff');
    expect(api.pixel(6, 6)).toBe('#ff0000');
  });

  it('saves and opens .baipix text', () => {
    const api = setup(4, 4);
    api.click(2, 2, { tool: 'pencil', color: '#abcdef' });
    const json = api.save();
    const other = createAgentApi(new Editor());
    other.open(json);
    expect(other.pixel(2, 2)).toBe('#abcdef');
  });

  it('refuses what a person could not do, with a reason', () => {
    const api = setup();
    expect(() => api.setTool('brush' as never)).toThrow(/Unknown tool/);
    expect(() => api.setOptions({ nope: 1 } as never)).toThrow(/Unknown option/);
    expect(() => api.png()).toThrow(/browser/);
    expect(() => api.stroke([])).toThrow(/at least one point/);
  });

  it('lists, picks, duplicates and renames boards', () => {
    const api = setup(4, 4);
    api.plot([[0, 0, '#ff0000']]);
    expect(api.boards()).toMatchObject([{ index: 0, name: 'Agent', active: true }]);
    api.duplicateBoard('Hurt');
    expect(api.boards().map((b) => [b.name, b.active])).toEqual([
      ['Agent', false],
      ['Hurt', true],
    ]);
    // The copy is a variation to rework: drawing on it leaves the original as it was.
    expect(api.pixel(0, 0)).toBe('#ff0000');
    api.plot([[0, 0, '#ffffff']]);
    api.selectBoard('Agent');
    expect(api.pixel(0, 0)).toBe('#ff0000');
    api.renameBoard('Idle');
    expect(api.state()).toMatchObject({ board: 'Idle', boards: 2 });
    expect(() => api.selectBoard('Nope')).toThrow(/No board "Nope"/);
    api.resizeBoard(6, 5, [0, 0]);
    expect(api.state()).toMatchObject({ width: 6, height: 5 });
    expect(api.pixel(0, 0)).toBe('#ff0000');
  });

  it('lists the files and opens one by name', () => {
    const api = setup(4, 4);
    api.plot([[0, 0, '#ff0000']]); // A file left untouched goes away once another one opens.
    api.newFile(6, 6, 'Other');
    expect(
      api
        .files()
        .filter((f) => f.name !== 'Untitled')
        .map((f) => [f.name, f.active]),
    ).toEqual([
      ['Agent', false],
      ['Other', true],
    ]);
    expect(api.selectFile('Agent')).toMatchObject({ file: 'Agent', width: 4 });
  });

  it('remaps every board and frame with one table, one undo step each', () => {
    const api = setup(2, 1);
    api.plot([
      [0, 0, '#202020'],
      [1, 0, '#e0e0e0'],
    ]);
    api.addFrame();
    api.plot([[0, 0, '#e0e0e0']]);
    api.setFrame(0);
    api.duplicateBoard('Copy');
    api.plot([[1, 0, '#202020']]);
    const table = api.remap({ palette: ['#000000', '#ffffff'], boards: 'all', replacePalette: true });
    expect(table).toEqual({ '#202020': '#000000', '#e0e0e0': '#ffffff' });
    expect(api.ascii().rows).toEqual(['AA']);
    expect(api.state().palette).toEqual(['#000000', '#ffffff']);
    api.setFrame(1);
    expect(api.pixel(0, 0)).toBe('#ffffff');
    api.selectBoard(0);
    expect([api.pixel(0, 0), api.pixel(1, 0)]).toEqual(['#000000', '#ffffff']);
    // One step per frame, the last one first: undoing it shows that frame as it was.
    api.undo();
    expect(api.state().frame).toBe(1);
    expect(api.pixel(0, 0)).toBe('#e0e0e0');
    api.undo();
    expect(api.state().frame).toBe(0);
    expect(api.pixel(0, 0)).toBe('#202020');
    expect(() => api.remap({ palette: 'nope' })).toThrow(/No palette "nope"/);
    expect(api.palettes().pico8.colors[0]).toBe('#000000');
  });
});
