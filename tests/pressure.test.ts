import { describe, expect, it } from 'vitest';
import { pressureCurveValue } from '../src/engine/pressure';

describe('pressure curve', () => {
  it('maps the pressure range from zero to one', () => {
    expect(pressureCurveValue(0, 0.5)).toBe(0);
    expect(pressureCurveValue(1, 0.5)).toBe(1);
  });

  it('uses a linear response by default', () => {
    expect(pressureCurveValue(0.25, 0.5)).toBeCloseTo(0.25);
    expect(pressureCurveValue(0.5, 0.5)).toBeCloseTo(0.5);
    expect(pressureCurveValue(0.75, 0.5)).toBeCloseTo(0.75);
  });

  it('responds more slowly with a lower control point', () => {
    expect(pressureCurveValue(0.5, 0)).toBeCloseTo(0.25);
  });

  it('responds faster with a higher control point', () => {
    expect(pressureCurveValue(0.5, 1)).toBeCloseTo(0.75);
  });

  it('clamps pressure and curve values to the supported range', () => {
    expect(pressureCurveValue(-1, 0.5)).toBe(0);
    expect(pressureCurveValue(2, 0.5)).toBe(1);
    expect(pressureCurveValue(0.5, -1)).toBeCloseTo(0.25);
    expect(pressureCurveValue(0.5, 2)).toBeCloseTo(0.75);
  });
});
