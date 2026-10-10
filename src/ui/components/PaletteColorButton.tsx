import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { alpha, toCss, toHex, type Color } from '../../engine/color';
import { useT } from '../../i18n';
import { useEditorState } from '../EditorContext';

/**
 * A color picked from the palette: a swatch that opens the palette's colors in a popover, so
 * what it colors never brings a color the palette doesn't have.
 */
export function PaletteColorButton({
  color,
  label,
  onChange,
}: {
  color: Color;
  label: string;
  onChange: (c: Color) => void;
}) {
  const t = useT();
  const palette = useEditorState((s) => s.palette.colors);
  const [at, setAt] = useState<{ left: number; top: number } | null>(null);
  const ref = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!at) return;
    const onDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (!popRef.current?.contains(target) && !ref.current?.contains(target)) setAt(null);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setAt(null);
    window.addEventListener('pointerdown', onDown, true);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('keydown', onKey);
    };
  }, [at]);

  const open = () => {
    if (at) return setAt(null);
    const r = ref.current!.getBoundingClientRect();
    // Under the swatch, kept inside the window (the right panel is on the right edge).
    setAt({ left: Math.min(r.left, window.innerWidth - 216), top: r.bottom + 6 });
  };
  return (
    <>
      <button
        ref={ref}
        type="button"
        className={`palette-color${alpha(color) ? '' : ' is-clear'}`}
        style={{ background: alpha(color) ? toCss(color) : undefined }}
        aria-label={`${label}: ${toHex(color)}`}
        data-tip={label}
        aria-expanded={!!at}
        onClick={open}
      />
      {at &&
        createPortal(
          <div ref={popRef} className="gradient-pop" role="dialog" aria-label={label} style={at}>
            <div className="gradient-swatches">
              {palette.map((c, i) => (
                <button
                  key={i}
                  type="button"
                  className={`gradient-swatch${c === color ? ' is-active' : ''}`}
                  style={{ background: toCss(c) }}
                  aria-label={toHex(c)}
                  onClick={() => {
                    onChange(c);
                    setAt(null);
                  }}
                />
              ))}
            </div>
            {!palette.length && <p className="hint">{t('effects.noPalette')}</p>}
          </div>,
          document.body,
        )}
    </>
  );
}
