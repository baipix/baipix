import { describe, expect, it } from 'vitest';
import { createStylusPanStart } from '../src/ui/stylusPan';

describe('stylus pan', () => {
  it('starts panning from the remaining finger after a pinch', () => {
    const remainingTouches = [{ x: 120, y: 240 }];
    const viewport = { panX: 32, panY: 48 };

    expect(createStylusPanStart(remainingTouches, viewport)).toEqual({
      x: 120,
      y: 240,
      panX: 32,
      panY: 48,
    });
  });

  it('does not start panning when no fingers remain', () => {
    const viewport = { panX: 32, panY: 48 };
    expect(createStylusPanStart([], viewport)).toBeNull();
  });

  it('does not start panning while multiple fingers remain', () => {
    const remainingTouches = [
      { x: 120, y: 240 },
      { x: 180, y: 240 },
    ];
    const viewport = { panX: 32, panY: 48 };

    expect(createStylusPanStart(remainingTouches, viewport)).toBeNull();
  });
});
