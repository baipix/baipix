import { useEffect, useRef, useState, type ReactNode } from 'react';
import { clamp } from '../../engine/math';

interface NumberFieldProps {
  value: number;
  min: number;
  max: number;
  /** Called while typing or scrubbing (`final` is true on commit / release). */
  onChange: (value: number, final: boolean) => void;
  /** Label on the left: drag it horizontally to scrub the value. */
  label?: ReactNode;
  suffix?: string;
  ariaLabel: string;
  /** Pixels of drag per unit. */
  sensitivity?: number;
  scrubHint?: string;
}

export function NumberField({
  value,
  min,
  max,
  onChange,
  label,
  suffix,
  ariaLabel,
  sensitivity = 4,
  scrubHint,
}: NumberFieldProps) {
  const [draft, setDraft] = useState(String(value));
  const focused = useRef(false);

  useEffect(() => {
    if (!focused.current) setDraft(String(value));
  }, [value]);

  const commit = (raw: string) => {
    const n = clamp(Math.round(Number(raw)) || min, min, max);
    setDraft(String(n));
    onChange(n, true);
  };

  const startScrub = (e: React.PointerEvent<HTMLSpanElement>) => {
    e.preventDefault();
    const x0 = e.clientX;
    const v0 = value;
    let last = v0;
    document.body.classList.add('is-scrubbing');
    const move = (ev: PointerEvent) => {
      const next = clamp(v0 + Math.round((ev.clientX - x0) / sensitivity), min, max);
      if (next !== last) {
        last = next;
        setDraft(String(next));
        onChange(next, false);
      }
    };
    // On the window, not the label: the change can redraw the panel and replace the label (a
    // board's size does), and the label's own events would then never come, leaving the cursor stuck.
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      window.removeEventListener('blur', up);
      document.body.classList.remove('is-scrubbing');
      onChange(last, true);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    window.addEventListener('blur', up);
  };

  return (
    <label className="field">
      {label !== undefined && (
        <span className="field-label is-scrubbable" onPointerDown={startScrub} data-tip={scrubHint}>
          {label}
        </span>
      )}
      <input
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        value={draft}
        aria-label={ariaLabel}
        onFocus={() => (focused.current = true)}
        onChange={(e) => {
          setDraft(e.target.value);
          const n = Number(e.target.value);
          if (e.target.value !== '' && Number.isFinite(n) && n >= min && n <= max)
            onChange(Math.round(n), false);
        }}
        onBlur={(e) => {
          focused.current = false;
          commit(e.target.value);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        }}
      />
      {suffix && <span className="field-suffix">{suffix}</span>}
    </label>
  );
}
