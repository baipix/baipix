import { describe, expect, it } from 'vitest';
import { pack } from '../src/engine/color';
import { Editor } from '../src/engine/editor';
import { layerClipFromHtml, layerClipHtml } from '../src/storage/layerClip';

const RED = pack(255, 0, 0);
const BLUE = pack(0, 0, 255);

/** Layers a, b, c (bottom to top) in an 8×8 file, each with one red pixel at x = its index. */
function editor(w = 8, h = 8) {
  const e = new Editor();
  e.newFile(w, h);
  e.addLayer();
  e.addLayer();
  e.getState().doc.layers.forEach((l, i) => {
    l.name = 'abc'[i];
    l.pixels[i] = RED;
  });
  return e;
}
const names = (e: Editor) =>
  e
    .getState()
    .doc.layers.map((l) => l.name + (l.group ? ':g' : ''))
    .join(' ');
const pick = (e: Editor, ...which: string[]) => {
  const layers = e.getState().doc.layers;
  which.forEach((n, k) =>
    e.selectLayer(
      layers.findIndex((l) => l.name === n),
      k ? 'toggle' : 'single',
    ),
  );
};

describe('copy and paste whole layers', () => {
  it('pastes copies above the active layer, with their settings, in one undo step', () => {
    const e = editor();
    pick(e, 'a', 'b');
    e.getState().doc.layers[0].opacity = 0.5;
    e.copyLayers();
    pick(e, 'c');
    expect(e.pasteLayers()).toBe(true);
    expect(names(e)).toBe('a b c a b');
    const { doc, selectedLayers } = e.getState();
    expect(doc.layers[3].opacity).toBe(0.5);
    expect(doc.layers[3].pixels[0]).toBe(RED);
    expect(doc.layers[3].id).not.toBe(doc.layers[0].id);
    expect(selectedLayers).toEqual([doc.layers[3].id, doc.layers[4].id]);
    e.undo();
    expect(names(e)).toBe('a b c');
  });

  it('cuts layers, and pastes a group as a group', () => {
    const e = editor();
    pick(e, 'a', 'b');
    e.groupSelection();
    e.cutLayers();
    expect(names(e)).toBe('c');
    e.pasteLayers();
    e.pasteLayers();
    expect(names(e)).toBe('c a:g b:g a:g b:g');
    const { doc, selectedGroup } = e.getState();
    expect(doc.groups).toHaveLength(2);
    expect(selectedGroup).toBe(doc.layers[4].group);
  });

  it('goes to another file of another size: same place, the rest kept off the canvas', () => {
    const from = editor(8, 8);
    pick(from, 'c');
    from.getState().doc.layers[2].pixels[7 * 8 + 7] = BLUE;
    const fragment = from.copyLayers()!;
    const to = editor(4, 4);
    // Through the system clipboard's HTML, as between two tabs.
    to.pasteLayers(layerClipFromHtml(layerClipHtml(fragment)));
    const pasted = to.getState().doc.layers[3];
    expect(pasted.name).toBe('c');
    expect(pasted.pixels[2]).toBe(RED);
    expect(pasted.outside).toBeDefined(); // the blue pixel at (7, 7)
  });

  it('keeps instances linked when their component is there, else makes them plain pixels', () => {
    const e = editor();
    pick(e, 'a');
    e.createComponent();
    e.addInstanceAt(e.getState().doc.layers[0].id, { x: 5, y: 5 });
    const instance = e.copyLayers()!; // the instance, alone
    pick(e, 'a');
    e.selectLayer(1, 'toggle'); // the component and its instance
    const both = e.copyLayers()!;
    expect(both.layers).toHaveLength(2);
    // In the same file, the instance finds its component.
    e.pasteLayers(instance);
    const doc = e.getState().doc;
    expect(doc.layers[doc.activeLayer].instance?.of).toBe(doc.layers[0].id);
    // In another file: alone, plain pixels; with its component, linked to the new one.
    const other = editor();
    other.pasteLayers(layerClipFromHtml(layerClipHtml(instance)));
    let d = other.getState().doc;
    expect(d.layers[d.activeLayer].instance).toBeUndefined();
    expect(d.layers[d.activeLayer].pixels[5 * 8 + 5]).toBe(RED);
    other.pasteLayers(layerClipFromHtml(layerClipHtml(both)));
    d = other.getState().doc;
    const master = d.layers[d.activeLayer - 1];
    expect(master.component).toBeDefined();
    expect(d.layers[d.activeLayer].instance?.of).toBe(master.id);
  });

  it('tells an older copy left on the system clipboard, and ignores other HTML', () => {
    const e = editor();
    const fragment = e.copyLayers()!;
    const back = layerClipFromHtml(layerClipHtml(fragment))!;
    expect(e.isOlderCopy(back)).toBe(false);
    e.selectAll();
    e.copy(); // pixels copied since
    expect(e.isOlderCopy(back)).toBe(true);
    expect(layerClipFromHtml('<b>hello</b>')).toBeNull();
  });
});
