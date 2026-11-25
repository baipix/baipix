export interface StylusPanStart {
  x: number;
  y: number;
  panX: number;
  panY: number;
}

export interface StylusTouchPosition {
  x: number;
  y: number;
}

export interface ViewportPanPosition {
  panX: number;
  panY: number;
}

/** Creates a new pan origin when exactly one finger remains after a pinch. */
export function createStylusPanStart(
  remainingTouches: readonly StylusTouchPosition[],
  viewport: ViewportPanPosition,
): StylusPanStart | null {
  if (remainingTouches.length !== 1) return null;

  const [touch] = remainingTouches;

  return {
    x: touch.x,
    y: touch.y,
    panX: viewport.panX,
    panY: viewport.panY,
  };
}
