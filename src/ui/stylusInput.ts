export interface StylusInput {
  pointerDown(pointerType: string, pointerId: number): void;
  pointerHover(pointerType: string): boolean;
  pointerPressure(pointerType: string, pointerId: number, pressure: number): boolean;
  pointerEnd(pointerType: string, pointerId: number): void;
  isEnabled(): boolean;
  hasActivePointer(): boolean;
  shouldIgnoreTouch(pointerType: string): boolean;
  reset(): void;
}

export function createStylusInput(): StylusInput {
  let enabled = false;
  const activePointers = new Set<number>();
  const pressurePointers = new Set<number>();

  const stylusInput: StylusInput = {
    pointerHover(pointerType: string): boolean {
      if (pointerType !== 'pen' || enabled) {
        return false;
      }

      enabled = true;
      return true;
    },

    pointerDown(pointerType: string, pointerId: number): void {
      if (pointerType !== 'pen') return;

      enabled = true;
      activePointers.add(pointerId);
    },

    pointerPressure(pointerType: string, pointerId: number, pressure: number): boolean {
      if (pointerType !== 'pen' || !activePointers.has(pointerId)) return false;

      // Browsers report 0.5 while a pressure-insensitive pen is in contact.
      if (!pressurePointers.has(pointerId) && Number.isFinite(pressure) && Math.abs(pressure - 0.5) > 0.01) {
        pressurePointers.add(pointerId);
      }

      return pressurePointers.has(pointerId);
    },

    pointerEnd(pointerType: string, pointerId: number): void {
      if (pointerType === 'pen') {
        activePointers.delete(pointerId);
        pressurePointers.delete(pointerId);
      }
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
      pressurePointers.clear();
    },
  };

  return stylusInput;
}
