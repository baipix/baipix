import { alpha, withAlpha, type Color } from '../color';
import type { Point } from '../math';
import { followPointer, mirrorsOf, pressureAdjustedValue, setPixel, strokeColors } from './paint';
import type { Stroke, Tool } from './types';

/**
 * Drops random pixels inside a circle around the pointer, like a spray can. Each step of the pointer
 * sprays once, and holding still keeps spraying (the canvas repeats the last position). With
 * `sprayOpacity`, each pixel gets a random opacity between 30% and the color's own.
 */
function spray(s: Stroke, p: Point, random: () => number = Math.random): void {
  const [color] = strokeColors(s);
  const r = s.options.spraySize / 2;
  const density = pressureAdjustedValue(s, s.options.sprayDensity);

  // How many pixels per dab: a share of the circle's area, at least one.
  const count = Math.max(1, Math.round(Math.PI * r * r * (density / 100) * 0.1));
  for (let k = 0; k < count; k++) {
    const d = r * Math.sqrt(random());
    const a = random() * Math.PI * 2;
    const x = Math.round(p.x + d * Math.cos(a));
    const y = Math.round(p.y + d * Math.sin(a));
    const c: Color = s.options.sprayOpacity
      ? withAlpha(color, Math.round(alpha(color) * (0.3 + 0.7 * random())))
      : color;
    for (const m of mirrorsOf(s, x, y)) setPixel(s, m.x, m.y, c);
  }
}

export const sprayTool: Tool = {
  id: 'spray',
  editsPixels: true,
  paintsColor: true,
  onDown: (s, p) => spray(s, p),
  onMove: (s, p) => {
    if (p.x === s.last.x && p.y === s.last.y) spray(s, p);
    else followPointer(s, p, (q) => spray(s, q));
  },
};
