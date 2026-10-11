import { describe, expect, it } from 'vitest';
import { pack } from '../src/engine/color';
import { Editor } from '../src/engine/editor';
import type { ToolId } from '../src/engine/tools';

const ORANGE = pack(220, 120, 40);

function draw(tool: ToolId, a: [number, number], b: [number, number], height: number) {
  const e = new Editor();
  e.newFile(64, 64);
  e.setColor('primary', ORANGE);
  e.setTool(tool);
  e.beginStroke({ x: a[0], y: a[1] }, false, { shift: false });
  e.moveStroke({ x: b[0], y: b[1] }, { shift: false });
  e.endStroke();
  // Like in the options bar: the height redraws the volume just drawn.
  e.setOption('boxHeight', height);
  const px = e.getState().doc.layers[0].pixels;
  const pts = [...px.keys()].filter((i) => px[i]).map((i) => [i % 64, Math.floor(i / 64)]);
  return {
    e,
    rows: [Math.min(...pts.map(([, y]) => y)), Math.max(...pts.map(([, y]) => y))],
    colors: new Set([...px].filter(Boolean)),
  };
}

describe('isometric cylinder and pyramid', () => {
  it('pulls a cylinder down from its top ellipse by the height, its sides darker', () => {
    const { rows, colors } = draw('cylinder', [10, 10], [33, 21], 16);
    // The ellipse is 24 wide, so 12 tall: rows 10 to 21, and the sides go 16 rows further.
    expect(rows).toEqual([10, 37]);
    expect(colors.has(ORANGE)).toBe(true);
    expect(colors.size).toBe(3);
  });

  it('raises a pyramid’s apex above the middle of its base', () => {
    const { rows } = draw('pyramid', [32, 30], [32, 46], 20);
    // The base's middle is at row 38: the apex 20 above.
    expect(rows).toEqual([18, 46]);
  });

  it('shows the back faces of a low pyramid, like a roof, but only the front ones of a tall one', () => {
    expect(draw('pyramid', [32, 20], [32, 44], 3).colors.size).toBe(4);
    expect(draw('pyramid', [32, 20], [32, 44], 30).colors.size).toBe(2);
  });

  it('is one undo step, its height included', () => {
    const { e } = draw('pyramid', [32, 30], [32, 46], 20);
    e.undo();
    expect(e.getState().doc.layers[0].pixels.some(Boolean)).toBe(false);
  });
});
