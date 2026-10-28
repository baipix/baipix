import { useEffect } from 'react';

/** How far Shift + up/down arrow moves a number field, as in Figma. */
const SHIFT_STEP = 10;

/**
 * Shift + up/down arrow in any number field changes it by 10 instead of 1. Browsers step by 1
 * either way; this steps the field itself (stepUp stays within its min and max) and sends the
 * input event its onChange listens to, so every field, in a panel or a dialog, behaves the same.
 */
export function useShiftArrowSteps() {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!e.shiftKey || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return;
      const input = e.target;
      if (!(input instanceof HTMLInputElement) || input.type !== 'number' || input.disabled) return;
      e.preventDefault();
      if (e.key === 'ArrowUp') input.stepUp(SHIFT_STEP);
      else input.stepDown(SHIFT_STEP);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    };
    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, []);
}
