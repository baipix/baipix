import { describe, expect, it } from 'vitest';
import { pack } from '../src/engine/color';
import {
  addInstance,
  detachInstance,
  instancesOf,
  makeComponent,
  masters,
  moveInstance,
  normalizeComponents,
  syncInstances,
} from '../src/engine/components';
import { flatten } from '../src/engine/composite';
import { Editor } from '../src/engine/editor';
import { cloneDocument, createDocument, resizeDocument, type PixelDoc } from '../src/engine/document';
import { documentFromJson, documentToJson, serializeDocument } from '../src/storage/fileFormat';

const RED = pack(255, 0, 0);
const BLUE = pack(0, 0, 255);

/** A 16×16 document whose first layer has a 2×2 sprite at (1, 1): red on top, blue below. */
function withSprite(): PixelDoc {
  const doc = createDocument('Test', 16, 16);
  const p = doc.layers[0].pixels;
  p[1 * 16 + 1] = RED;
  p[1 * 16 + 2] = RED;
  p[2 * 16 + 1] = BLUE;
  p[2 * 16 + 2] = BLUE;
  return doc;
}
const at = (doc: PixelDoc, layer: number, x: number, y: number) =>
  doc.layers[layer].pixels[y * doc.width + x];

describe('components', () => {
  it('renders an instance from its master, where it was placed', () => {
    const doc = withSprite();
    expect(makeComponent(doc, 0, { x: 1, y: 1, w: 2, h: 2 })).toBe(true);
    const i = addInstance(doc, doc.layers[0].id, 10, 5);
    expect(i).toBe(1);
    expect(at(doc, 1, 10, 5)).toBe(RED);
    expect(at(doc, 1, 11, 6)).toBe(BLUE);
    // Only the sprite: nothing else of the master's layer.
    expect(doc.layers[1].pixels.filter((c) => c !== 0)).toHaveLength(4);
    expect(masters(doc)).toEqual([doc.layers[0]]);
    expect(instancesOf(doc, doc.layers[0].id)).toEqual([doc.layers[1]]);
    // The instance is part of the picture like any layer.
    expect(flatten(doc, { includeBackground: false })[5 * 16 + 10]).toBe(RED);
  });

  it('follows the master when it changes, and moves', () => {
    const doc = withSprite();
    makeComponent(doc, 0, { x: 1, y: 1, w: 2, h: 2 });
    addInstance(doc, doc.layers[0].id, 10, 5);
    doc.layers[0].pixels[1 * 16 + 1] = BLUE;
    syncInstances(doc);
    expect(at(doc, 1, 10, 5)).toBe(BLUE);
    moveInstance(doc, doc.layers[1], 0, 15);
    expect(at(doc, 1, 10, 5)).toBe(0);
    // Past the canvas edge, the sprite is cut: only its top row shows.
    expect(at(doc, 1, 0, 15)).toBe(BLUE);
    expect(at(doc, 1, 1, 15)).toBe(RED);
    expect(doc.layers[1].pixels.filter((c) => c !== 0)).toHaveLength(2);
  });

  it("doesn't make a master of an instance, and frames stay in the canvas", () => {
    const doc = withSprite();
    makeComponent(doc, 0, { x: 14, y: 14, w: 10, h: 10 });
    expect(doc.layers[0].component).toEqual({ x: 14, y: 14, w: 2, h: 2 });
    addInstance(doc, doc.layers[0].id, 0, 0);
    expect(makeComponent(doc, 1, { x: 0, y: 0, w: 2, h: 2 })).toBe(false);
  });

  it('turns an instance back into a plain layer, and orphans too', () => {
    const doc = withSprite();
    makeComponent(doc, 0, { x: 1, y: 1, w: 2, h: 2 });
    addInstance(doc, doc.layers[0].id, 10, 5);
    addInstance(doc, doc.layers[0].id, 4, 4);
    detachInstance(doc.layers[1]);
    expect(doc.layers[1].instance).toBeUndefined();
    expect(at(doc, 1, 4, 4)).toBe(RED);
    // The master goes: its other instance keeps its pixels as a plain layer.
    doc.layers.splice(0, 1);
    normalizeComponents(doc);
    expect(doc.layers.every((l) => !l.instance && !l.component)).toBe(true);
    expect(at(doc, 1, 10, 5)).toBe(RED);
  });

  it('saves masters and instances in .baipix files, and opens them back', () => {
    const doc = withSprite();
    makeComponent(doc, 0, { x: 1, y: 1, w: 2, h: 2 });
    addInstance(doc, doc.layers[0].id, 10, 5);
    const file = serializeDocument(doc);
    expect(file.layers[0].component).toEqual({ x: 1, y: 1, w: 2, h: 2 });
    expect(file.layers[1].instance).toEqual({ of: 0, x: 10, y: 5 });
    // The instance's pixels are saved too, for a version without components.
    expect(file.layers[1].runs.length).toBeGreaterThan(2);
    const back = documentFromJson(documentToJson(doc));
    expect(back.layers[1].instance).toEqual({ of: back.layers[0].id, x: 10, y: 5 });
    expect(back.layers[0].component).toEqual({ x: 1, y: 1, w: 2, h: 2 });
    expect(at(back, 1, 11, 6)).toBe(BLUE);
  });

  it('opens files without components, and fixes broken references', () => {
    const plain = documentFromJson(documentToJson(withSprite()));
    expect(plain.layers[0].component).toBeUndefined();
    const doc = withSprite();
    makeComponent(doc, 0, { x: 1, y: 1, w: 2, h: 2 });
    addInstance(doc, doc.layers[0].id, 10, 5);
    const file = serializeDocument(doc);
    file.layers[1].instance = { of: 7, x: 10, y: 5 }; // no such layer
    const back = documentFromJson(JSON.stringify(file));
    expect(back.layers[1].instance).toBeUndefined();
    expect(at(back, 1, 10, 5)).toBe(RED);
  });

  it('keeps instances linked when the document is copied under new ids', () => {
    const doc = withSprite();
    makeComponent(doc, 0, { x: 1, y: 1, w: 2, h: 2 });
    addInstance(doc, doc.layers[0].id, 10, 5);
    const copy = cloneDocument(doc, false);
    expect(copy.layers[0].id).not.toBe(doc.layers[0].id);
    expect(copy.layers[1].instance!.of).toBe(copy.layers[0].id);
    // A copy, not a shared object.
    copy.layers[0].component!.w = 1;
    expect(doc.layers[0].component!.w).toBe(2);
  });

  it('moves frames and instances with the drawing when the canvas is resized', () => {
    const doc = withSprite();
    makeComponent(doc, 0, { x: 1, y: 1, w: 2, h: 2 });
    addInstance(doc, doc.layers[0].id, 10, 5);
    resizeDocument(doc, 20, 20, 2, 3);
    expect(doc.layers[0].component).toEqual({ x: 3, y: 4, w: 2, h: 2 });
    expect(doc.layers[1].instance).toMatchObject({ x: 12, y: 8 });
    expect(at(doc, 1, 12, 8)).toBe(RED);
  });
});

describe('components in the editor', () => {
  const setup = () => {
    const e = new Editor();
    e.setColor('primary', RED);
    const draw = (pts: [number, number][]) => {
      e.beginStroke({ x: pts[0][0], y: pts[0][1] }, false, { shift: false });
      for (const [x, y] of pts.slice(1)) e.moveStroke({ x, y }, { shift: false });
      e.endStroke();
    };
    draw([
      [1, 1],
      [2, 1],
    ]);
    const doc = () => e.getState().doc;
    const px = (layer: number, x: number, y: number) => doc().layers[layer].pixels[y * doc().width + x];
    return { e, draw, doc, px };
  };
  const move = (e: Editor, from: [number, number], to: [number, number], duplicate = false) => {
    e.beginStroke({ x: from[0], y: from[1] }, false, { shift: false, duplicate });
    e.moveStroke({ x: to[0], y: to[1] }, { shift: false });
    e.endStroke();
  };

  it('makes a component of what is drawn, and drops instances of it', () => {
    const { e, doc, px } = setup();
    expect(e.createComponent()).toBe(true);
    expect(doc().layers[0].component).toEqual({ x: 1, y: 1, w: 2, h: 1 });
    expect(e.addInstanceAt(doc().layers[0].id, { x: 10, y: 10 })).toBe(true);
    // Centered on the drop point, and active.
    expect(doc().activeLayer).toBe(1);
    expect(doc().layers[1].instance).toMatchObject({ x: 9, y: 10 });
    expect(px(1, 9, 10)).toBe(RED);
    expect(px(1, 10, 10)).toBe(RED);
  });

  it('keeps instances in step with their master, and keeps them from being painted', () => {
    const { e, draw, doc, px } = setup();
    e.createComponent();
    e.addInstanceAt(doc().layers[0].id, { x: 10, y: 10 });
    // Painting on the instance: nothing happens.
    expect(e.beginStroke({ x: 0, y: 0 }, false, { shift: false })).toBe(false);
    e.setActiveLayer(0);
    e.setColor('primary', BLUE);
    draw([[1, 1]]);
    expect(px(1, 9, 10)).toBe(BLUE);
    e.undo();
    expect(px(1, 9, 10)).toBe(RED);
  });

  it('moves an instance by its position, and Alt+drag copies it', () => {
    const { e, doc, px } = setup();
    e.createComponent();
    e.addInstanceAt(doc().layers[0].id, { x: 10, y: 10 });
    e.setTool('move');
    move(e, [9, 10], [12, 14]);
    expect(doc().layers[1].instance).toMatchObject({ x: 12, y: 14 });
    expect(px(1, 12, 14)).toBe(RED);
    expect(px(1, 9, 10)).toBe(0);
    move(e, [12, 14], [2, 20], true);
    expect(doc().layers).toHaveLength(3);
    expect(doc().layers[1].instance).toMatchObject({ x: 12, y: 14 });
    expect(doc().layers[2].instance).toMatchObject({ x: 2, y: 20 });
    // One undo takes the copy away.
    e.undo();
    expect(doc().layers).toHaveLength(2);
  });

  it('moves a master with its frame, so its instances stay the same', () => {
    const { e, doc, px } = setup();
    e.createComponent();
    e.addInstanceAt(doc().layers[0].id, { x: 10, y: 10 });
    e.setActiveLayer(0);
    e.setTool('move');
    move(e, [1, 1], [5, 5]);
    expect(doc().layers[0].component).toEqual({ x: 5, y: 5, w: 2, h: 1 });
    expect(px(1, 9, 10)).toBe(RED);
    expect(px(1, 10, 10)).toBe(RED);
  });

  it('turns an instance into plain pixels when a layer is merged into it', () => {
    const { e, draw, doc, px } = setup();
    e.createComponent();
    e.addInstanceAt(doc().layers[0].id, { x: 10, y: 10 });
    e.addLayer();
    draw([[20, 20]]);
    e.mergeDown();
    expect(doc().layers[1].instance).toBeUndefined();
    expect(px(1, 20, 20)).toBe(RED);
    expect(px(1, 9, 10)).toBe(RED);
  });

  it('Alt+drag on a component places an instance of it, like in Figma', () => {
    const { e, doc, px } = setup();
    e.createComponent();
    e.setTool('move');
    move(e, [1, 1], [11, 6], true);
    expect(doc().layers).toHaveLength(2);
    expect(doc().layers[0].component).toEqual({ x: 1, y: 1, w: 2, h: 1 });
    expect(doc().layers[1].instance).toMatchObject({ of: doc().layers[0].id, x: 11, y: 6 });
    expect(px(1, 11, 6)).toBe(RED);
    // The component stays where it was.
    expect(px(0, 1, 1)).toBe(RED);
    e.undo();
    expect(doc().layers).toHaveLength(1);
  });

  it('goes from an instance to its component', () => {
    const { e, doc } = setup();
    e.createComponent();
    e.addInstanceAt(doc().layers[0].id, { x: 10, y: 10 });
    expect(e.goToMaster()).toBe(true);
    expect(doc().activeLayer).toBe(0);
    // Not from the component itself.
    expect(e.goToMaster()).toBe(false);
  });

  it('detaches an instance into plain pixels, and one undo links it back', () => {
    const { e, draw, doc, px } = setup();
    e.createComponent();
    e.addInstanceAt(doc().layers[0].id, { x: 10, y: 10 });
    expect(e.detachInstance()).toBe(true);
    expect(doc().layers[1].instance).toBeUndefined();
    expect(px(1, 9, 10)).toBe(RED);
    // It's a plain layer now: it can be painted, and the component no longer changes it.
    draw([[0, 0]]);
    expect(px(1, 0, 0)).toBe(RED);
    e.setActiveLayer(0);
    e.setColor('primary', BLUE);
    draw([[1, 1]]);
    expect(px(1, 9, 10)).toBe(RED);
    e.undo();
    e.undo();
    e.undo();
    expect(doc().layers[1].instance).toMatchObject({ x: 9, y: 10 });
    expect(px(1, 0, 0)).toBe(0);
  });

  it('grows the frame when drawing outside it on the component', () => {
    const { e, draw, doc, px } = setup();
    e.createComponent();
    e.addInstanceAt(doc().layers[0].id, { x: 10, y: 10 });
    e.setActiveLayer(0);
    e.setColor('primary', BLUE);
    draw([[0, 0]]);
    expect(doc().layers[0].component).toEqual({ x: 0, y: 0, w: 3, h: 2 });
    // The instance shows the new pixel, and its sprite hasn't moved.
    expect(doc().layers[1].instance).toMatchObject({ x: 8, y: 9 });
    expect(px(1, 8, 9)).toBe(BLUE);
    expect(px(1, 9, 10)).toBe(RED);
    // One undo puts the frame back as it was.
    e.undo();
    expect(doc().layers[0].component).toEqual({ x: 1, y: 1, w: 2, h: 1 });
    expect(doc().layers[1].instance).toMatchObject({ x: 9, y: 10 });
    expect(px(1, 8, 9)).toBe(0);
  });
});
