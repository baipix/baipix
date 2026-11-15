export interface StylusInput {
  pointerDown(pointerType: string, pointerId: number): void;
  pointerEnd(pointerType: string, pointerId: number): void;
  isEnabled(): boolean;
  hasActivePointer(): boolean;
  shouldIgnoreTouch(pointerType: string): boolean;
  reset(): void;
}

export function createStylusInput(): StylusInput {
  let enabled = false;
  const activePointers = new Set<number>();

  return {
    pointerDown(pointerType, pointerId) {
      if (pointerType !== 'pen') return;

      enabled = true;
      activePointers.add(pointerId);
    },

    pointerEnd(pointerType, pointerId) {
      if (pointerType === 'pen') activePointers.delete(pointerId);
    },

    isEnabled: () => enabled,
    hasActivePointer: () => activePointers.size > 0,

    shouldIgnoreTouch: (pointerType) => pointerType === 'touch' && enabled && activePointers.size > 0,

    reset() {
      enabled = false;
      activePointers.clear();
    },
  };
}
