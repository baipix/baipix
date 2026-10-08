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
