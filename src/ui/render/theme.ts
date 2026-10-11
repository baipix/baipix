export interface Theme {
  canvas: string;
  checkA: string;
  checkB: string;
  grid: string;
  frame: string;
  accent: string;
  /** The blue of hovers, for what the pointer is about to act on. */
  highlight: string;
  /** Solid blue for badges, and the dark text on it. */
  highlightFill: string;
  highlightInk: string;
  /** Text drawn on top of the accent. */
  accentInk: string;
  muted: string;
  axis: string;
  guide: string;
  /** The isometric grid's lines. */
  isoGrid: string;
  /** Rulers: their background, edge, the band over the drawing, and the text. */
  panel: string;
  line: string;
  selected: string;
  text: string;
  /** Selection corners. */
  handle: string;
}

/**
 * Reads the canvas colors from the CSS tokens, so the renderer follows light/dark themes.
 * Tokens are written as light-dark(…), which only CSS understands: each one is resolved to a
 * plain rgb() color by applying it to a hidden element.
 */
export function readTheme(el: Element = document.documentElement): Theme {
  const probe = document.createElement('span');
  probe.style.display = 'none';
  el.appendChild(probe);
  const v = (name: string) => {
    probe.style.color = `var(${name})`;
    return getComputedStyle(probe).color;
  };
  const theme = {
    canvas: v('--canvas'),
    checkA: v('--check-a'),
    checkB: v('--check-b'),
    grid: v('--grid'),
    frame: v('--frame'),
    accent: v('--accent'),
    highlight: v('--glow-line'),
    highlightFill: v('--glow'),
    highlightInk: v('--glow-ink'),
    accentInk: v('--accent-ink'),
    muted: v('--muted'),
    axis: v('--axis'),
    guide: v('--guide'),
    isoGrid: v('--iso-grid'),
    panel: v('--menubar'),
    line: v('--line'),
    selected: v('--selected'),
    text: v('--text'),
    handle: v('--handle'),
  };
  probe.remove();
  return theme;
}

const patternCache = new WeakMap<CanvasRenderingContext2D, Map<string, CanvasPattern>>();

/** Transparency checkerboard pattern, cached per context and colors. */
export function checkerPattern(
  ctx: CanvasRenderingContext2D,
  cell: number,
  a: string,
  b: string,
): CanvasPattern {
  const key = `${cell}|${a}|${b}`;
  let cache = patternCache.get(ctx);
  if (!cache) patternCache.set(ctx, (cache = new Map()));
  const hit = cache.get(key);
  if (hit) return hit;
  const tile = document.createElement('canvas');
  tile.width = tile.height = cell * 2;
  const t = tile.getContext('2d')!;
  t.fillStyle = a;
  t.fillRect(0, 0, cell * 2, cell * 2);
  t.fillStyle = b;
  t.fillRect(0, 0, cell, cell);
  t.fillRect(cell, cell, cell, cell);
  const pattern = ctx.createPattern(tile, 'repeat')!;
  cache.set(key, pattern);
  return pattern;
}
