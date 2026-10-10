import { describe, expect, it } from 'vitest';
import { pack } from '../src/engine/color';
import { cleanEffects, newEffect, withEffects, type LayerEffect } from '../src/engine/effects';
import { Editor } from '../src/engine/editor';
import { documentFromJson, documentToJson } from '../src/storage/fileFormat';

const RED = pack(255, 0, 0);
const INK = pack(0, 0, 0);
const W = 7;

/** A 7×7 picture with one red pixel in the middle. */
const dot = () => {
  const p = new Uint32Array(W * W);
  p[3 * W + 3] = RED;
  return p;
};
const at = (p: Uint32Array, x: number, y: number) => p[y * W + x];
const count = (p: Uint32Array, c: number) => p.filter((x) => x === c).length;

describe('effects', () => {
  it('outlines around the drawing, with or without corners, thicker, or inside', () => {
    const outline = (patch: Partial<LayerEffect>) =>
      withEffects(dot(), W, W, [{ ...newEffect('outline', INK), ...patch } as LayerEffect]);
    expect(count(outline({}), INK)).toBe(4);
    expect(count(outline({ corners: true } as Partial<LayerEffect>), INK)).toBe(8);
    expect(count(outline({ size: 2 } as Partial<LayerEffect>), INK)).toBe(12);
    const inside = outline({ place: 'inside' } as Partial<LayerEffect>);
    expect(at(inside, 3, 3)).toBe(INK);
    expect(count(inside, INK)).toBe(1);
  });

  it('drops a shadow under the drawing, offset', () => {
    const p = withEffects(dot(), W, W, [{ type: 'shadow', visible: true, color: INK, x: 1, y: 2 }]);
    expect(at(p, 4, 5)).toBe(INK);
    expect(at(p, 3, 3)).toBe(RED);
  });

  it('glows: solid next to the drawing, thinning out in dithering', () => {
    const p = withEffects(dot(), W, W, [{ type: 'glow', visible: true, color: INK, size: 3 }]);
    expect([at(p, 2, 3), at(p, 4, 3), at(p, 3, 2), at(p, 3, 4)]).toEqual([INK, INK, INK, INK]);
    const far = [at(p, 0, 3), at(p, 6, 3), at(p, 3, 0), at(p, 3, 6)];
    expect(far.filter((c) => c === INK).length).toBeLessThan(4);
    expect(at(p, 3, 3)).toBe(RED);
  });

  it('leaves the pixels alone, and hidden effects out', () => {
    const p = dot();
    expect(withEffects(p, W, W, [{ ...newEffect('outline', INK), visible: false }])).toBe(p);
    expect(count(p, INK)).toBe(0);
  });

  it('reads effects back safely from a file', () => {
    expect(cleanEffects('x')).toBeUndefined();
    expect(cleanEffects([{ type: 'blur' }])).toBeUndefined();
    expect(cleanEffects([{ type: 'glow', color: INK, size: 99 }])).toEqual([
      { type: 'glow', visible: true, color: INK, size: 16 },
    ]);
  });
});

describe('effects in the editor', () => {
  const setup = () => {
    const e = new Editor();
    e.newFile(W, W);
    e.getState().doc.layers[0].pixels[3 * W + 3] = RED;
    return e;
  };

  it('shows on the canvas and in exports, without touching the pixels; undo takes it off', () => {
    const e = setup();
    e.addEffect('outline');
    const layer = e.getState().doc.layers[0];
    expect(layer.effects).toHaveLength(1);
    expect(count(layer.pixels, RED)).toBe(1);
    expect(count(e.flatten({ includeBackground: false }), layer.effects![0].color)).toBe(4);
    e.setEffect(0, { size: 2 } as Partial<LayerEffect>, false);
    e.setEffect(0, { size: 3 } as Partial<LayerEffect>, false);
    e.setEffect(0, { size: 2 } as Partial<LayerEffect>, true);
    e.undo(); // the whole drag at once
    expect((e.getState().doc.layers[0].effects![0] as { size: number }).size).toBe(1);
    e.undo();
    expect(e.getState().doc.layers[0].effects).toBeUndefined();
  });

  it('is saved in .baipix files', () => {
    const e = setup();
    e.addEffect('shadow');
    const back = documentFromJson(documentToJson(e.getState().doc));
    expect(back.layers[0].effects).toEqual(e.getState().doc.layers[0].effects);
  });

  it('is written into the pixels when applied, or when the layer is merged', () => {
    const e = setup();
    e.addEffect('outline');
    const ink = e.getState().doc.layers[0].effects![0].color;
    e.applyEffects();
    expect(e.getState().doc.layers[0].effects).toBeUndefined();
    expect(count(e.getState().doc.layers[0].pixels, ink)).toBe(4);
    e.undo();
    e.addLayer();
    e.mergeDown();
    expect(count(e.getState().doc.layers[0].pixels, ink)).toBe(4);
  });
});
