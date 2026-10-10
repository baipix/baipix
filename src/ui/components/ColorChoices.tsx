import { useEffect, useState } from 'react';
import { alpha, fromHex, opaque, toCss, toHex, type Color } from '../../engine/color';
import { useT } from '../../i18n';
import { useEditor, useEditorState } from '../EditorContext';
import { IconButton } from './IconButton';

/**
 * Colors to pick from, for a gradient stop or an effect: the palette first, then the primary,
 * secondary and recent colors, and any color typed in hex. A color that isn't in the palette
 * can be added to it in one click, so the drawing doesn't drift away from it unnoticed.
 */
export function ColorChoices({
  color,
  onPick,
  allowClear = false,
}: {
  color: Color;
  onPick: (c: Color) => void;
  /** Offer transparent too (a gradient fading out). */
  allowClear?: boolean;
}) {
  const t = useT();
  const editor = useEditor();
  const palette = useEditorState((s) => s.palette.colors);
  const primary = useEditorState((s) => s.primary);
  const secondary = useEditorState((s) => s.secondary);
  const recent = useEditorState((s) => s.recent);
  const [hex, setHex] = useState(toHex(color).slice(1));
  useEffect(() => setHex(toHex(color).slice(1)), [color]);

  // The colors in use, without those already in the palette, opaque, and each once.
  const others = [...new Set([primary, secondary, ...recent].filter((c) => alpha(c)).map(opaque))]
    .filter((c) => !palette.includes(c))
    .slice(0, 8);
  const inPalette = !alpha(color) || palette.includes(opaque(color));
  const swatch = (c: Color, key: string) => (
    <button
      key={key}
      type="button"
      className={`gradient-swatch${c === color ? ' is-active' : ''}`}
      style={{ background: toCss(c) }}
      aria-label={toHex(c)}
      data-tip={toHex(c)}
      onClick={() => onPick(c)}
    />
  );
  const typed = () => {
    const c = fromHex(hex);
    if (c !== null) onPick(c);
    else setHex(toHex(color).slice(1));
  };
  return (
    <div className="color-choices">
      <div className="gradient-swatches">
        {palette.map((c, i) => swatch(c, `p${i}`))}
        {allowClear && (
          <button
            type="button"
            className={`gradient-swatch is-clear${alpha(color) ? '' : ' is-active'}`}
            aria-label={t('gradient.transparent')}
            data-tip={t('gradient.transparent')}
            onClick={() => onPick(0)}
          />
        )}
      </div>
      {others.length > 0 && (
        <>
          <div className="color-choices-title">{t('color.recent')}</div>
          <div className="gradient-swatches">{others.map((c, i) => swatch(c, `r${i}`))}</div>
        </>
      )}
      <div className="color-choices-hex">
        <label className="field">
          <span className="field-label">#</span>
          <input
            value={hex}
            maxLength={6}
            spellCheck={false}
            aria-label={t('colorChoices.hex')}
            onChange={(e) => setHex(e.target.value.replace(/[^0-9a-f]/gi, ''))}
            onBlur={typed}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === 'Enter') typed();
            }}
          />
        </label>
        {!inPalette && (
          <IconButton
            icon="plus"
            label={t('colorChoices.addToPalette')}
            onClick={() => editor.addToPalette(color)}
          />
        )}
      </div>
    </div>
  );
}
