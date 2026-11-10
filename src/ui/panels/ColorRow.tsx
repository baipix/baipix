import { useEffect, useState, type ReactNode } from 'react';
import { alpha, fromHex, toCss, toHex, withAlpha, type Color } from '../../engine/color';
import { clamp } from '../../engine/math';
import { useT } from '../../i18n';
import { NumberField } from '../components/NumberField';
import { uiStore, type ColorSlot } from '../uiStore';

interface ColorRowProps {
  slot: ColorSlot;
  color: Color;
  /** `done` is false while the opacity is being scrubbed, true when the change is final. */
  onChange: (color: Color, done?: boolean) => void;
  /** What this color is for ("Primary color · Left click"): the swatch's tooltip and label. */
  role?: string;
  /** Extra controls on the right (visibility…). */
  trailing?: ReactNode;
  dimmed?: boolean;
}

/** Fill row: swatch (opens the picker) + hex + opacity. */
export function ColorRow({ slot, color, onChange, role, trailing, dimmed }: ColorRowProps) {
  const t = useT();
  const editing = uiStore.use((s) => s.picker?.slot === slot);
  const [hex, setHex] = useState('');
  useEffect(() => setHex(toHex(color).slice(1).toUpperCase()), [color]);

  return (
    <div className={`color-row${dimmed ? ' is-dimmed' : ''}`}>
      <div className={`field hex-field${editing ? ' is-editing' : ''}`}>
        <button
          type="button"
          className="color-chip"
          aria-label={role ? `${role}. ${t('color.choose')}` : t('color.choose')}
          data-tip={role}
          onClick={(e) =>
            uiStore.set((s) => ({
              picker:
                s.picker?.slot === slot ? null : { slot, top: e.currentTarget.getBoundingClientRect().top },
            }))
          }
        >
          <i style={{ background: toCss(color) }} />
        </button>
        <input
          value={hex}
          maxLength={7}
          spellCheck={false}
          aria-label="Hex"
          onChange={(e) => {
            setHex(e.target.value);
            const c = fromHex(e.target.value, alpha(color) || 255);
            if (c !== null && e.target.value.replace('#', '').length === 6) onChange(c);
          }}
          onBlur={() => setHex(toHex(color).slice(1).toUpperCase())}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        />
      </div>
      {/* Like the canvas fields: drag the label left or right to scrub the opacity, or type it. */}
      <div className="opacity-field">
        <NumberField
          slider
          value={Math.round(alpha(color) / 2.55)}
          min={0}
          max={100}
          label="◐"
          suffix="%"
          ariaLabel={t('common.opacity')}
          scrubHint={t('common.dragToAdjust')}
          sensitivity={2}
          onChange={(v, final) => onChange(withAlpha(color, Math.round(clamp(v, 0, 100) * 2.55)), final)}
        />
      </div>
      {trailing}
    </div>
  );
}
