import { describe, expect, it } from 'vitest';
import { pack } from '../src/engine/color';
import { flatten } from '../src/engine/composite';
import { createDocument, createLayer, type PixelDoc } from '../src/engine/document';
import { Editor } from '../src/engine/editor';
import { deserializeDocument, serializeDocument } from '../src/storage/fileFormat';
import { layerTree, moveItems, normalizeGroups, pickedItems } from '../src/engine/groups';

const GREY = pack(128, 128, 128);
const RED = pack(255, 0, 0);

/** Layers a…e bottom to top; c and d in group G, d also in group H (inside G). */
function doc(): PixelDoc {
  const d = createDocument('t', 1, 1);
  d.layers = ['a', 'b', 'c', 'd', 'e'].map((n) => ({ ...createLayer(n, 1, 1), id: n }));
  d.groups = [
    { id: 'G', name: 'G', visible: true, locked: false, opacity: 1 },
    { id: 'H', name: 'H', visible: true, locked: false, opacity: 1, parent: 'G' },
  ];
  d.layers[2].group = 'G';
  d.layers[3].group = 'H';
  return d;
}
const names = (d: PixelDoc) => d.layers.map((l) => l.id + (l.group ? `:${l.group}` : '')).join(' ');
const shape = (nodes: ReturnType<typeof layerTree>): unknown =>
  nodes.map((n) => (n.kind === 'layer' ? n.layer.name : { [n.group.name]: shape(n.children) }));

describe('layerTree', () => {
  it('nests contiguous layers in their groups', () => {
    expect(shape(layerTree(doc()))).toEqual(['a', 'b', { G: ['c', { H: ['d'] }] }, 'e']);
  });
});

describe('normalizeGroups', () => {
  it('drops empty groups and ungroups split ones', () => {
    const d = doc();
    d.layers.splice(3, 1); // d (the only layer of H) is gone
    normalizeGroups(d);
    expect(d.groups?.map((g) => g.id)).toEqual(['G']);
    const split = doc();
    split.layers[0].group = 'G'; // a in G, but b isn't: not contiguous
    normalizeGroups(split);
    expect(names(split)).toBe('a b c d:H e');
  });
});

describe('moveItems', () => {
  it('moves a layer into a group, above a given layer', () => {
    const d = doc();
    expect(moveItems(d, [{ kind: 'layer', id: 'a' }], { parent: 'G', aboveLayer: 'c' })).toBe(true);
    expect(names(d)).toBe('b c:G a:G d:H e');
  });

  it('moves a whole group out to the top level', () => {
    const d = doc();
    expect(moveItems(d, [{ kind: 'group', id: 'H' }], { parent: undefined, aboveLayer: 'e' })).toBe(true);
    expect(names(d)).toBe('a b c:G e d:H');
    expect(d.groups?.find((g) => g.id === 'H')?.parent).toBeUndefined();
  });

  it('refuses a third level, and a group into itself', () => {
    const d = doc();
    expect(moveItems(d, [{ kind: 'group', id: 'G' }], { parent: 'H', aboveLayer: 'd' })).toBe(false);
    d.groups!.push({ id: 'K', name: 'K', visible: true, locked: false, opacity: 1 });
    d.layers[4].group = 'K';
    d.groups!.push({ id: 'L', name: 'L', visible: true, locked: false, opacity: 1, parent: 'K' });
    d.layers[4].group = 'L';
    expect(moveItems(d, [{ kind: 'group', id: 'K' }], { parent: 'G', aboveLayer: 'c' })).toBe(false);
  });
});

describe('pickedItems', () => {
  it('takes a group whole when all its layers are picked', () => {
    expect(pickedItems(doc(), ['c', 'd', 'e'])).toEqual([
      { kind: 'group', id: 'G' },
      { kind: 'layer', id: 'e' },
    ]);
    expect(pickedItems(doc(), ['d'])).toEqual([{ kind: 'group', id: 'H' }]);
  });
});

describe('flatten with groups', () => {
  const stack = () => {
    const d = createDocument('t', 1, 1);
    d.layers[0].pixels[0] = GREY;
    const top = createLayer('top', 1, 1);
    top.pixels[0] = RED;
    top.group = 'G';
    d.layers.push(top);
    d.groups = [{ id: 'G', name: 'G', visible: true, locked: false, opacity: 1 }];
    return d;
  };
  const px = (d: PixelDoc) => flatten(d, { includeBackground: false })[0];

  it('hides a hidden group, and lets a pass-through group blend each layer', () => {
    const d = stack();
    expect(px(d)).toBe(RED);
    d.groups![0].visible = false;
    expect(px(d)).toBe(GREY);
  });

  it('lays the group down in its own mode and opacity', () => {
    const d = stack();
    d.groups![0].blendMode = 'multiply';
    expect(px(d)).toBe(pack(128, 0, 0));
    d.groups![0].blendMode = undefined;
    d.groups![0].opacity = 0;
    expect(px(d)).toBe(GREY);
  });
});

describe('Editor groups', () => {
  /** Four layers a, b, c, d (bottom to top), each with one pixel at x = its index. */
  function editor() {
    const e = new Editor();
    e.newFile(8, 8);
    for (let i = 1; i < 4; i++) e.addLayer();
    const doc = e.getState().doc;
    doc.layers.forEach((l, i) => {
      l.name = 'abcd'[i];
      l.pixels[i] = RED;
    });
    return e;
  }
  const order = (e: Editor) =>
    e
      .getState()
      .doc.layers.map(
        (l) => l.name + (l.group ? `:${e.getState().doc.groups!.find((g) => g.id === l.group)!.name}` : ''),
      )
      .join(' ');
  const pick = (e: Editor, ...names: string[]) => {
    const layers = e.getState().doc.layers;
    e.selectLayer(
      layers.findIndex((l) => l.name === names[0]),
      'single',
    );
    for (const n of names.slice(1))
      e.selectLayer(
        layers.findIndex((l) => l.name === n),
        'toggle',
      );
  };

  it('groups the selected layers where the top one was, then ungroups them', () => {
    const e = editor();
    pick(e, 'a', 'c');
    expect(e.groupSelection()).toBe(true);
    expect(order(e)).toBe('b a:Group 1 c:Group 1 d');
    expect(e.getState().selectedGroup).not.toBeNull();
    e.ungroup(e.getState().selectedGroup!);
    expect(order(e)).toBe('b a c d');
    expect(e.getState().doc.groups).toBeUndefined();
  });

  it('nests two levels deep, not three', () => {
    const e = editor();
    pick(e, 'b', 'c');
    e.groupSelection();
    e.groupSelection();
    expect(e.getState().doc.groups).toHaveLength(2);
    expect(e.groupSelection()).toBe(false);
  });

  it('moves a whole group with the Move tool, and undoes it in one step', () => {
    const e = editor();
    pick(e, 'a', 'b');
    e.groupSelection();
    e.setTool('move');
    e.beginStroke({ x: 0, y: 0 }, false, { shift: false });
    e.moveStroke({ x: 0, y: 2 }, { shift: false });
    e.endStroke();
    const [a, b, c] = e.getState().doc.layers;
    expect(a.pixels[16]).toBe(RED); // a's pixel at (0, 0) went down 2 rows
    expect(b.pixels[17]).toBe(RED);
    expect(c.pixels[2]).toBe(RED); // c isn't in the group
    e.undo();
    expect(e.getState().doc.layers[0].pixels[0]).toBe(RED);
  });

  it('locks and hides through the group', () => {
    const e = editor();
    pick(e, 'd');
    e.groupSelection();
    const id = e.getState().selectedGroup!;
    e.setGroupLocked(id, true);
    pick(e, 'd');
    e.setTool('pencil');
    expect(e.beginStroke({ x: 5, y: 5 }, false, { shift: false })).toBe(false);
    e.setGroupLocked(id, false);
    e.setGroupVisible(id, false);
    expect(e.flatten({ includeBackground: false })[3]).toBe(0);
  });

  it('merges a group into one layer, and duplicates one', () => {
    const e = editor();
    pick(e, 'b', 'c');
    e.groupSelection();
    const id = e.getState().selectedGroup!;
    e.duplicateLayer();
    expect(order(e)).toBe('a b:Group 1 c:Group 1 b:Group 1 copy c:Group 1 copy d');
    e.selectGroup(id);
    e.mergeGroup(id);
    expect(order(e)).toBe('a Group 1 b:Group 1 copy c:Group 1 copy d');
    const merged = e.getState().doc.layers[1];
    expect([merged.pixels[1], merged.pixels[2]]).toEqual([RED, RED]);
  });

  it('brings a deleted group back with Undo in the toast', () => {
    const e = editor();
    pick(e, 'b', 'c');
    e.groupSelection();
    expect(e.deleteLayers()).toBe(2);
    expect(order(e)).toBe('a d');
    e.restoreDeleted();
    expect(order(e)).toBe('a b:Group 1 c:Group 1 d');
  });

  it('moves a layer up and down within its group', () => {
    const e = editor();
    pick(e, 'b', 'c');
    e.groupSelection();
    pick(e, 'b');
    expect(e.canMoveLayer(1)).toBe(true);
    e.moveLayer(1);
    expect(order(e)).toBe('a c:Group 1 b:Group 1 d');
    expect(e.canMoveLayer(1)).toBe(false);
  });
  const click = (
    e: Editor,
    x: number,
    mods: { add?: boolean; duplicate?: boolean } = {},
    to?: [number, number],
    y = 0,
  ) => {
    e.beginStroke({ x, y }, false, { shift: !!mods.add, ...mods });
    if (to) e.moveStroke({ x: to[0], y: to[1] }, { shift: false });
    e.endStroke();
  };
  const selected = (e: Editor) => {
    const { doc, selectedLayers } = e.getState();
    return doc.layers.filter((l) => selectedLayers.includes(l.id)).map((l) => l.name);
  };

  it('Shift+click on the canvas adds layers to the selection, or takes them out', () => {
    const e = editor();
    e.setTool('move');
    click(e, 0);
    click(e, 2, { add: true });
    expect(selected(e)).toEqual(['a', 'c']);
    // Shift+drag on one of them still moves them all.
    click(e, 2, { add: true }, [2, 3]);
    expect(selected(e)).toEqual(['a', 'c']);
    const [a, , c] = e.getState().doc.layers;
    expect([a.pixels[3 * 8], c.pixels[3 * 8 + 2]]).toEqual([RED, RED]);
    // A plain click on one keeps both; Shift+click without a drag takes one out.
    click(e, 0, {}, undefined, 3);
    expect(selected(e)).toEqual(['a', 'c']);
    click(e, 2, { add: true }, undefined, 3);
    expect(selected(e)).toEqual(['a']);
  });

  it('duplicates every selected layer at once, in one undo step', () => {
    const e = editor();
    pick(e, 'a', 'c');
    e.duplicateLayer();
    expect(order(e)).toBe('a a copy b c c copy d');
    expect(selected(e)).toEqual(['a copy', 'c copy']);
    e.undo();
    expect(order(e)).toBe('a b c d');
  });

  it('Alt+drag copies the layers taken, and the copies move', () => {
    const e = editor();
    e.setTool('move');
    click(e, 1);
    click(e, 3, { add: true });
    click(e, 1, { duplicate: true }, [1, 2]);
    expect(order(e)).toBe('a b b copy c d d copy');
    const layers = e.getState().doc.layers;
    expect(layers[1].pixels[1]).toBe(RED); // b stays
    expect(layers[2].pixels[2 * 8 + 1]).toBe(RED); // its copy moved down
    expect(layers[5].pixels[2 * 8 + 3]).toBe(RED);
    e.undo();
    expect(order(e)).toBe('a b c d');
    // A single plain layer too.
    click(e, 0, { duplicate: true }, [0, 1]);
    expect(order(e)).toBe('a a copy b c d');
    expect(e.getState().doc.layers[0].pixels[0]).toBe(RED);
  });

  it('goes into a group with a double-click on the canvas, and back out with Escape', () => {
    const e = editor();
    pick(e, 'b', 'c');
    e.groupSelection();
    e.groupSelection(); // Group 2, around Group 1
    const groups = e.getState().doc.groups!;
    const [inner, outer] = [groups.find((g) => g.parent)!.id, groups.find((g) => !g.parent)!.id];
    pick(e, 'd');
    e.setTool('move');
    // A click on b's pixel takes the outer group, a double-click goes one level in each time.
    e.beginStroke({ x: 1, y: 0 }, false, { shift: false });
    e.endStroke();
    expect(e.getState().selectedGroup).toBe(outer);
    expect(e.enterAt({ x: 1, y: 0 })).toBe(true);
    expect(e.getState().selectedGroup).toBe(inner);
    expect(e.enterAt({ x: 1, y: 0 })).toBe(true);
    expect(e.getState().selectedGroup).toBeNull();
    expect(e.getState().doc.layers[e.getState().doc.activeLayer].name).toBe('b');
    expect(e.enterAt({ x: 1, y: 0 })).toBe(false);
    // Clicking c now takes c alone: we're inside the group.
    e.beginStroke({ x: 2, y: 0 }, false, { shift: false });
    e.endStroke();
    expect(e.getState().doc.layers[e.getState().doc.activeLayer].name).toBe('c');
    expect(e.getState().selectedGroup).toBeNull();
    expect(e.selectParent()).toBe(true);
    expect(e.getState().selectedGroup).toBe(inner);
    expect(e.selectParent()).toBe(true);
    expect(e.getState().selectedGroup).toBe(outer);
    expect(e.selectParent()).toBe(false);
    // Nothing to go into on a layer outside any group.
    expect(e.enterAt({ x: 3, y: 0 })).toBe(false);
  });
});

describe('Groups in .baipix files', () => {
  it('are saved and read back, nested, with their settings', () => {
    const d = doc();
    d.groups![0].blendMode = 'screen';
    d.groups![1].collapsed = true;
    const back = deserializeDocument(JSON.parse(JSON.stringify(serializeDocument(d))));
    expect(shape(layerTree(back))).toEqual(['a', 'b', { G: ['c', { H: ['d'] }] }, 'e']);
    expect(back.groups!.map((g) => [g.name, g.blendMode, g.collapsed, !!g.parent])).toEqual([
      ['G', 'screen', undefined, false],
      ['H', undefined, true, true],
    ]);
  });

  it('opens files without groups, and drops broken ones', () => {
    const json = JSON.parse(JSON.stringify(serializeDocument(doc())));
    expect(deserializeDocument({ ...json, groups: undefined }).groups).toBeUndefined();
    const broken = {
      ...json,
      layers: json.layers.map((l: object, i: number) => ({ ...l, group: i === 0 ? 9 : undefined })),
    };
    expect(deserializeDocument(broken).groups).toBeUndefined();
  });
});

describe('Align a group', () => {
  it('moves the group as one, against the edge', () => {
    const e = new Editor();
    e.newFile(8, 8);
    e.addLayer();
    const [a, b] = e.getState().doc.layers;
    a.pixels[2 * 8 + 3] = RED; // (3, 2)
    b.pixels[4 * 8 + 5] = RED; // (5, 4)
    e.selectLayer(0, 'single');
    e.selectLayer(1, 'toggle');
    e.groupSelection();
    e.align('left');
    const [a2, b2] = e.getState().doc.layers;
    expect(a2.pixels[2 * 8 + 0]).toBe(RED);
    expect(b2.pixels[4 * 8 + 2]).toBe(RED);
  });
});
