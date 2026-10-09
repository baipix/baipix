import { describe, expect, it } from 'vitest';
import { pack } from '../src/engine/color';
import { Editor } from '../src/engine/editor';
import { cleanStops, gradientColor, gradientT, sortedStops } from '../src/engine/gradient';

const RED = pack(255, 0, 0);
const BLUE = pack(0, 0, 255);
const GREEN = pack(0, 255, 0);
const stops = sortedStops([
  { at: 0, color: RED },
  { at: 1, color: BLUE },
]);

describe('gradient math', () => {
  it('places pixels along each shape', () => {
    const a = { x: 0, y: 0 };
    const b = { x: 4, y: 0 };
    expect(gradientT('linear', a, b, 2, 3)).toBe(0.5);
    expect(gradientT('linear', a, b, 9, 0)).toBe(1);
    expect(gradientT('radial', a, b, 0, 2)).toBe(0.5);
    expect(gradientT('angular', a, b, 0, 4)).toBeCloseTo(0.25);
    expect(gradientT('diamond', a, b, 1, 1)).toBe(0.5);
    expect(gradientT('linear', a, a, 3, 3)).toBe(0);
  });

  it('uses only the stop colors, dithered in between', () => {
    const half = [];
    for (let y = 0; y < 4; y++)
      for (let x = 0; x < 4; x++) half.push(gradientColor(stops, 0.5, 'bayer', x, y));
    expect(half.filter((c) => c === BLUE)).toHaveLength(8);
    expect(half.every((c) => c === RED || c === BLUE)).toBe(true);
    expect(gradientColor(stops, 0.4, 'none', 0, 0)).toBe(RED);
    expect(gradientColor(stops, 0.6, 'none', 0, 0)).toBe(BLUE);
    expect([gradientColor(stops, 0.5, 'checker', 0, 0), gradientColor(stops, 0.5, 'checker', 1, 0)]).toEqual([
      RED,
      BLUE,
    ]);
    expect(gradientColor(stops, 0.2, 'checker', 1, 0)).toBe(RED);
  });

  it('reads saved stops back safely', () => {
    expect(cleanStops('nope')).toBeNull();
    expect(cleanStops([{ at: 0, color: RED }])).toBeNull();
    expect(cleanStops([{ at: -1, color: RED }, { at: 0.5, color: BLUE }, { x: 1 }])).toEqual([
      { at: 0, color: RED },
      { at: 0.5, color: BLUE },
    ]);
  });
});

describe('the gradient tool', () => {
  const setup = () => {
    const e = new Editor();
    e.newFile(8, 4);
    e.setColor('primary', RED);
    e.setColor('secondary', BLUE);
    e.setTool('gradient');
    const drag = (from: [number, number], to: [number, number], shift = false) => {
      e.beginStroke({ x: from[0], y: from[1] }, false, { shift });
      e.moveStroke({ x: to[0], y: to[1] }, { shift });
      e.endStroke();
    };
    const row = (y = 0) => [...e.getState().doc.layers[0].pixels.slice(y * 8, y * 8 + 8)];
    return { e, drag, row };
  };

  it('fills from the first color to the last, in one undo step', () => {
    const { e, drag, row } = setup();
    drag([0, 0], [7, 0]);
    expect(row()[0]).toBe(RED);
    expect(row()[7]).toBe(BLUE);
    expect(new Set(e.getState().doc.layers[0].pixels)).toEqual(new Set([RED, BLUE]));
    e.undo();
    expect(row().every((c) => c === 0)).toBe(true);
    // A click without a drag does nothing.
    drag([3, 0], [3, 0]);
    expect(e.getState().canUndo).toBe(false);
  });

  it('fills only the area under the first click, or the selection', () => {
    const { e, drag, row } = setup();
    const px = e.getState().doc.layers[0].pixels;
    for (let y = 0; y < 4; y++) px[y * 8 + 4] = GREEN; // a wall at x = 4
    drag([0, 0], [3, 0]);
    expect(row()[4]).toBe(GREEN);
    expect(row()[6]).toBe(0);
    e.undo();
    e.setOption('gradientLayer', true);
    drag([0, 0], [7, 0]);
    expect(row()[4]).not.toBe(GREEN);
    e.undo();
    e.setOption('gradientLayer', false);
    e.setTool('select');
    e.beginStroke({ x: 0, y: 1 }, false, { shift: false });
    e.moveStroke({ x: 7, y: 1 }, { shift: false });
    e.endStroke();
    e.setTool('gradient');
    drag([0, 1], [7, 1]);
    expect(row(0).every((c) => c === 0 || c === GREEN)).toBe(true);
    expect(row(1)[7]).toBe(BLUE);
  });

  it('keeps the last gradient editable: options, reversing and turning redraw it in place', () => {
    const { e, drag, row } = setup();
    drag([0, 0], [7, 0]);
    e.setOption('gradientStops', [
      { at: 0, color: GREEN },
      { at: 1, color: BLUE },
    ]);
    expect(row()[0]).toBe(GREEN);
    e.reverseGradient();
    expect(row()[0]).toBe(BLUE);
    expect(row()[7]).toBe(GREEN);
    e.setOption('gradientDither', 'none');
    expect(e.rotateGradient()).toBe(true);
    // Turned: now top to bottom, so with plain bands a row is one color.
    expect(new Set(row()).size).toBe(1);
    // Still one undo step.
    e.undo();
    expect(row().every((c) => c === 0)).toBe(true);
    // Not editable anymore once something else changed the layer.
    drag([0, 0], [7, 0]);
    e.setTool('pencil');
    e.beginStroke({ x: 0, y: 3 }, false, { shift: false });
    e.endStroke();
    e.setTool('gradient');
    expect(e.rotateGradient()).toBe(false);
  });
});
