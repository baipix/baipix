export interface StylusInput {
  pointerDown(pointerType: string, pointerId: number): void;
  pointerHover(pointerType: string): void;
  pointerEnd(pointerType: string, pointerId: number): void;
  isEnabled(): boolean;
  hasActivePointer(): boolean;
  shouldIgnoreTouch(pointerType: string): boolean;
  reset(): void;
}

export function createStylusInput(): StylusInput {
  let enabled = false;
  const activePointers = new Set<number>();

  const stylusInput: StylusInput = {
    pointerHover(pointerType: string): void {
      if (pointerType === 'pen') enabled = true;
    },

    pointerDown(pointerType: string, pointerId: number): void {
      if (pointerType !== 'pen') return;

      enabled = true;
      activePointers.add(pointerId);
    },

    pointerEnd(pointerType: string, pointerId: number): void {
      if (pointerType === 'pen') activePointers.delete(pointerId);
    },

    isEnabled(): boolean {
      return enabled;
    },

    hasActivePointer(): boolean {
      return activePointers.size > 0;
    },

    shouldIgnoreTouch(pointerType: string): boolean {
      return pointerType === 'touch' && enabled && activePointers.size > 0;
    },

    reset(): void {
      enabled = false;
      activePointers.clear();
    },
  };

  return stylusInput;
}
