import { describe, expect, it } from 'vitest';
import { DEFAULT_ISO_CELL, Editor, isoCellSize } from '../src/engine/editor';

describe('isometric grid', () => {
  it('is off at first, with 16 pixel wide diamonds', () => {
    const { view } = new Editor().getState();
    expect(view.isoGrid).toBe(false);
    expect(view.isoCell).toBe(DEFAULT_ISO_CELL);
  });

  it('keeps cells even, so the lines meet on pixel corners, from 4 to 256 pixels', () => {
    expect(isoCellSize(15)).toBe(16);
    expect(isoCellSize(17)).toBe(18);
    expect(isoCellSize(1)).toBe(4);
    expect(isoCellSize(1000)).toBe(256);
  });

  it('is remembered with the other view settings, older saves without it included', () => {
    const e = new Editor();
    e.toggleView('isoGrid');
    e.setView('isoCell', 32);
    const again = new Editor();
    again.setPreferences(e.getPreferences());
    expect(again.getState().view).toMatchObject({ isoGrid: true, isoCell: 32 });
    const old = new Editor();
    old.setPreferences({ view: { grid: false } as never });
    expect(old.getState().view).toMatchObject({ grid: false, isoGrid: false, isoCell: DEFAULT_ISO_CELL });
  });
});
