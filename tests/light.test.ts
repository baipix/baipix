import { describe, expect, it } from 'vitest';
import { pack } from '../src/engine/color';
import { Editor } from '../src/engine/editor';
import { DEFAULT_LIGHT, MAX_LIGHT_SHADOW, readLight, shadowOffset } from '../src/engine/light';
import { documentFromJson, documentToJson } from '../src/storage/fileFormat';

const INK = pack(0, 0, 0);

describe('readLight', () => {
  it('keeps the angle within a turn and the height within its range', () => {
    expect(readLight({ angle: -90, height: 200 })).toEqual({
      angle: 270,
      height: 80,
      direction: true,
    });
    expect(readLight({ angle: 370.4, height: 2, direction: false })).toMatchObject({
      angle: 10,
      height: 10,
      direction: false,
    });
  });

  it('turns down what is not a light', () => {
    expect(readLight(null)).toBeUndefined();
    expect(readLight({ height: 30 })).toBeUndefined();
  });
});

describe('a board light', () => {
  it('is saved in the file and read back', () => {
    const e = new Editor();
    e.setLight({ ...DEFAULT_LIGHT, angle: 60 });
    const back = documentFromJson(documentToJson(e.getState().doc));
    expect(back.light).toEqual({ ...DEFAULT_LIGHT, angle: 60 });
  });

  it("isn't undone with the drawing", () => {
    const e = new Editor();
    e.setLight(DEFAULT_LIGHT);
    e.setColor('primary', INK);
    e.setTool('pencil');
    e.beginStroke({ x: 1, y: 1 }, false, { shift: false });
    e.endStroke();
    e.undo();
    expect(e.getState().doc.light).toEqual(DEFAULT_LIGHT);
  });

  it('goes away with null', () => {
    const e = new Editor();
    e.setLight(DEFAULT_LIGHT);
    e.setLight(null);
    expect(e.getState().doc.light).toBeUndefined();
  });
});

describe('shadowOffset', () => {
  it('casts the shadow away from the light, longer the lower it is', () => {
    // From the top left at 45°: 2 pixels down and to the right, along each axis rounded.
    expect(shadowOffset({ angle: 135, height: 45 })).toEqual({ x: 1, y: 1 });
    expect(shadowOffset({ angle: 180, height: 45 })).toEqual({ x: 2, y: 0 });
    expect(shadowOffset({ angle: 180, height: 10 })).toEqual({ x: MAX_LIGHT_SHADOW, y: 0 });
  });

  it('keeps at least a pixel under a high light', () => {
    expect(shadowOffset({ angle: 90, height: 80 })).toEqual({ x: 0, y: 1 });
  });
});

describe('a shadow that follows the light', () => {
  it('moves when the light does, and stops following once moved by hand', () => {
    const e = new Editor();
    e.addEffect('shadow');
    e.setEffect(0, { followLight: true });
    e.setLight({ ...DEFAULT_LIGHT, angle: 180, height: 45 });
    expect(e.getState().doc.layers[0].effects?.[0]).toMatchObject({ x: 2, y: 0 });
    e.setLight({ ...DEFAULT_LIGHT, angle: 0, height: 45 });
    expect(e.getState().doc.layers[0].effects?.[0]).toMatchObject({ x: -2, y: 0 });
    e.setEffect(0, { x: 3, followLight: false });
    e.setLight({ ...DEFAULT_LIGHT, angle: 90, height: 45 });
    expect(e.getState().doc.layers[0].effects?.[0]).toMatchObject({ x: 3, y: 0 });
  });

  it('is saved in the file', () => {
    const e = new Editor();
    e.addEffect('shadow');
    e.setEffect(0, { followLight: true });
    const back = documentFromJson(documentToJson(e.getState().doc));
    expect(back.layers[0].effects?.[0]).toMatchObject({ followLight: true });
  });
});
