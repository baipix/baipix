/** Maps normalized pen pressure through a quadratic response curve. */
export function pressureCurveValue(pressure: number, control: number): number {
  const p = Number.isFinite(pressure) ? Math.max(0, Math.min(1, pressure)) : 1;
  const c = Number.isFinite(control) ? Math.max(0, Math.min(1, control)) : 0.5;

  return 2 * (1 - p) * p * c + p * p;
}

/** Maps pressure to an integer value between the configured minimum and maximum. */
export function pressureRangeValue(min: number, max: number, pressure: number, control: number): number {
  return Math.round(min + (max - min) * pressureCurveValue(pressure, control));
}
