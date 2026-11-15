import { describe, expect, it } from 'vitest';
import { createStylusInput } from '../src/ui/stylusInput';

describe('stylus input', () => {
  it('allows touch input before a pen is detected', () => {
    const stylus = createStylusInput();

    expect(stylus.isEnabled()).toBe(false);
    expect(stylus.shouldIgnoreTouch('touch')).toBe(false);
  });

  it('enables stylus mode when a pen is detected', () => {
    const stylus = createStylusInput();

    stylus.pointerDown('pen', 1);

    expect(stylus.isEnabled()).toBe(true);
    expect(stylus.hasActivePointer()).toBe(true);
  });

  it('ignores touch input while a pen is active', () => {
    const stylus = createStylusInput();

    stylus.pointerDown('pen', 1);

    expect(stylus.shouldIgnoreTouch('touch')).toBe(true);
  });

  it('allows touch input after the pen is released', () => {
    const stylus = createStylusInput();

    stylus.pointerDown('pen', 1);
    stylus.pointerEnd('pen', 1);

    expect(stylus.isEnabled()).toBe(true);
    expect(stylus.hasActivePointer()).toBe(false);
    expect(stylus.shouldIgnoreTouch('touch')).toBe(false);
  });

  it('keeps touch input blocked until all active pens are released', () => {
    const stylus = createStylusInput();

    stylus.pointerDown('pen', 1);
    stylus.pointerDown('pen', 2);

    stylus.pointerEnd('pen', 1);

    expect(stylus.hasActivePointer()).toBe(true);
    expect(stylus.shouldIgnoreTouch('touch')).toBe(true);

    stylus.pointerEnd('pen', 2);

    expect(stylus.hasActivePointer()).toBe(false);
    expect(stylus.shouldIgnoreTouch('touch')).toBe(false);
  });

  it('does not activate stylus mode for mouse input', () => {
    const stylus = createStylusInput();

    stylus.pointerDown('mouse', 1);
    stylus.pointerEnd('mouse', 1);

    expect(stylus.isEnabled()).toBe(false);
    expect(stylus.shouldIgnoreTouch('touch')).toBe(false);
  });

  it('resets stylus mode and active pointers', () => {
    const stylus = createStylusInput();

    stylus.pointerDown('pen', 1);
    stylus.pointerDown('pen', 2);

    stylus.reset();

    expect(stylus.isEnabled()).toBe(false);
    expect(stylus.hasActivePointer()).toBe(false);
    expect(stylus.shouldIgnoreTouch('touch')).toBe(false);
  });
});
