import { useRef, useState, type ReactNode } from 'react';
import { alpha, opaque, toCss, toHex, type Color } from '../../engine/color';
import { openMenu, type MenuItem } from './Menu';

interface PaletteGridProps {
  colors: Color[];
  primary: Color;
  secondary?: Color;
  onPick: (color: Color, secondary: boolean) => void;
  /** Makes the swatches draggable to reorder them. `to` is the color's new index. */
  onMove?: (from: number, to: number) => void;
  /** A right-click menu for a swatch. Without one, right-click picks the secondary color. */
  menu?: (color: Color) => MenuItem[];
  /** After the last swatch, in the grid (the + that adds a color). */
  trailing?: ReactNode;
}

export function PaletteGrid({
  colors,
  primary,
  secondary,
  onPick,
  onMove,
  menu,
  trailing,
}: PaletteGridProps) {
  const isPrimary = (c: Color) => alpha(primary) > 0 && opaque(primary) === c;
  const isSecondary = (c: Color) =>
    secondary !== undefined && alpha(secondary) > 0 && opaque(secondary) === c;
  const gridRef = useRef<HTMLDivElement>(null);
  // Drag to reorder: `slot` is the gap (0..n, in reading order) where the swatch would land.
  const [drag, setDrag] = useState<{ from: number; slot: number } | null>(null);
  const dragged = useRef(false);

  const slotAt = (x: number, y: number): number => {
    const swatches = [...(gridRef.current?.querySelectorAll('.swatch') ?? [])];
    let best = swatches.length;
    let bestDistance = Infinity;
    swatches.forEach((el, i) => {
      const r = el.getBoundingClientRect();
      const d = Math.hypot(x - (r.left + r.width / 2), y - (r.top + r.height / 2));
      if (d < bestDistance) {
        bestDistance = d;
        best = x > r.left + r.width / 2 ? i + 1 : i;
      }
    });
    return best;
  };

  const startDrag = (e: React.PointerEvent, from: number) => {
    if (!onMove || e.button !== 0) return;
    const x0 = e.clientX;
    const y0 = e.clientY;
    let started = false;
    const move = (ev: PointerEvent) => {
      if (!started && Math.hypot(ev.clientX - x0, ev.clientY - y0) < 4) return;
      started = true;
      document.body.classList.add('is-dragging-swatch');
      setDrag({ from, slot: slotAt(ev.clientX, ev.clientY) });
    };
    const end = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
      document.body.classList.remove('is-dragging-swatch');
      setDrag(null);
      if (!started) return;
      dragged.current = true; // swallow the click that follows the drag
      const slot = slotAt(ev.clientX, ev.clientY);
      const to = slot > from ? slot - 1 : slot;
      if (ev.type === 'pointerup' && to !== from) onMove(from, to);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
  };

  // No indicator when dropping would not move the swatch.
  const dropClass = (i: number) => {
    if (!drag || drag.slot === drag.from || drag.slot === drag.from + 1) return '';
    if (drag.slot === i) return ' drop-before';
    if (drag.slot === colors.length && i === colors.length - 1) return ' drop-after';
    return '';
  };

  return (
    <div className={`palette-grid${onMove ? ' is-sortable' : ''}`} ref={gridRef}>
      {colors.map((c, i) => {
        const hex = toHex(c).slice(1).toUpperCase();
        return (
          <button
            key={c}
            type="button"
            className={`swatch${isPrimary(c) ? ' is-primary' : ''}${isSecondary(c) ? ' is-secondary' : ''}${
              drag?.from === i ? ' is-dragging' : ''
            }${dropClass(i)}`}
            style={{ background: toCss(c) }}
            aria-label={hex}
            data-tip={hex}
            onPointerDown={(e) => startDrag(e, i)}
            onClick={() => {
              if (dragged.current) dragged.current = false;
              else onPick(c, false);
            }}
            onContextMenu={(e) => {
              e.preventDefault();
              if (menu) openMenu(e.currentTarget, menu(c));
              else onPick(c, true);
            }}
          />
        );
      })}
      {trailing}
    </div>
  );
}
