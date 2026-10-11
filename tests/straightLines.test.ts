import { describe, expect, it } from 'vitest';
import { pack } from '../src/engine/color';
import { Editor } from '../src/engine/editor';
import type { ToolId } from '../src/engine/tools';

const RED = pack(255, 0, 0);

function setup(tool: ToolId = 'pencil') {
  const e = new Editor();
  e.newFile(16, 16);
  e.setColor('primary', RED);
  e.setTool('pencil');
  e.setOption('pixelPerfect', false);
  const click = (x: number, y: number, mods: { shift?: boolean; snap?: boolean } = {}) => {
    e.beginStroke({ x, y }, false, { shift: !!mods.shift, snap: mods.snap });
    e.endStroke();
  };
  const painted = () => {
    const px = e.getState().doc.layers[0].pixels;
    return [...px.keys()].filter((i) => px[i]).map((i) => `${i % 16},${Math.floor(i / 16)}`);
  };
  if (tool !== 'pencil') e.setTool(tool);
  return { e, click, painted };
}

describe('Shift-click straight lines', () => {
  it('draws a line from the last point painted with the pencil', () => {
    const { click, painted } = setup();
    click(0, 0);
    click(4, 0, { shift: true });
    expect(painted()).toEqual(['0,0', '1,0', '2,0', '3,0', '4,0']);
  });

  it('snaps to 2:1 with Cmd/Ctrl, in clean steps of two pixels', () => {
    const { click, painted } = setup();
    click(0, 0);
    click(5, 2, { shift: true, snap: true });
    expect(painted().sort()).toEqual(['0,0', '1,0', '2,1', '3,1', '4,2', '5,2'].sort());
  });

  it('is a plain click without a previous point, or on another layer', () => {
    const { e, click, painted } = setup();
    click(3, 3, { shift: true });
    expect(painted()).toEqual(['3,3']);
    e.addLayer();
    click(8, 3, { shift: true });
    expect(e.getState().doc.layers[1].pixels.filter(Boolean)).toHaveLength(1);
  });

  it('erases a line too', () => {
    const { e, click, painted } = setup();
    for (let x = 0; x < 6; x++) click(x, 0);
    e.setTool('eraser');
    click(1, 0);
    click(4, 0, { shift: true });
    expect(painted()).toEqual(['0,0', '5,0']);
  });

  it('is one undo step', () => {
    const { e, click, painted } = setup();
    click(0, 0);
    click(6, 0, { shift: true });
    e.undo();
    expect(painted()).toEqual(['0,0']);
  });
});
