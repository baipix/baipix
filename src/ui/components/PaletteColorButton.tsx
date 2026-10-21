import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { alpha, toCss, toHex, withAlpha, type Color } from '../../engine/color';
import { ColorChoices } from './ColorChoices';
import { ColorFields } from './ColorPicker';

/**
 * A color for something drawn with it (an effect): a swatch that opens a popover with the colors'
 * fields (any color, and its opacity) above the palette's colors. A color picked from the palette
 * keeps the opacity set. Not opaque, the opacity shows beside the swatch.
 */
export function PaletteColorButton({
  color,
  label,
  onChange,
}: {
  color: Color;
  label: string;
  /** `final` is false while a field is dragged, true once the color is chosen. */
  onChange: (c: Color, final: boolean) => void;
}) {
  const [at, setAt] = useState<{ left: number; top: number } | null>(null);
  /** A color dragged in the fields, not chosen yet: chosen when the popover closes. */
  const dragged = useRef<Color | null>(null);
  const close = () => {
    if (dragged.current !== null) onChange(dragged.current, true);
    dragged.current = null;
    setAt(null);
  };
  const ref = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!at) return;
    const onDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (!popRef.current?.contains(target) && !ref.current?.contains(target)) close();
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    window.addEventListener('pointerdown', onDown, true);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('keydown', onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `close` reads refs only
  }, [at]);

  // Taller than the room under the swatch: above it, or as low as the window allows.
  useLayoutEffect(() => {
    const pop = popRef.current;
    if (!at || !pop) return;
    const h = pop.offsetHeight;
    if (at.top + h <= window.innerHeight - 8) return;
    const swatch = ref.current!.getBoundingClientRect();
    const above = swatch.top - 6 - h;
    const top = above >= 8 ? above : Math.max(8, window.innerHeight - 8 - h);
    if (top !== at.top) setAt({ ...at, top });
  }, [at]);

  const open = () => {
    if (at) return close();
    const r = ref.current!.getBoundingClientRect();
    // Under the swatch, kept inside the window (the right panel is on the right edge).
    setAt({ left: Math.min(r.left, window.innerWidth - 236), top: r.bottom + 6 });
  };
  const a = alpha(color);
  return (
    <>
      <button
        ref={ref}
        type="button"
        className={`palette-color${a === 255 ? '' : ' is-clear'}`}
        style={a ? ({ '--swatch': toCss(color) } as CSSProperties) : undefined}
        aria-label={`${label}: ${toHex(color)}`}
        data-tip={label}
        aria-expanded={!!at}
        onClick={open}
      />
      {a > 0 && a < 255 && (
        <button type="button" className="palette-color-opacity" tabIndex={-1} onClick={open}>
          {Math.round((a / 255) * 100)} %
        </button>
      )}
      {at &&
        createPortal(
          <div ref={popRef} className="gradient-pop" role="dialog" aria-label={label} style={at}>
            <div className="gradient-pop-fields">
              <ColorFields
                color={color}
                onChange={(c) => {
                  dragged.current = c;
                  onChange(c, false);
                }}
              />
            </div>
            <ColorChoices
              color={color}
              hexField={false}
              onPick={(c) => {
                dragged.current = null;
                onChange(a ? withAlpha(c, a) : c, true);
                setAt(null);
              }}
            />
          </div>,
          document.body,
        )}
    </>
  );
}
