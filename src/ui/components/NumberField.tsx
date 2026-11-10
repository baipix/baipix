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
  /**
   * The whole field is a slider: its background fills up to the value, a drag anywhere on it
   * changes the value, and a click without a drag selects the number to type it.
   */
  slider?: boolean;
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
  slider = false,
}: NumberFieldProps) {
  const [draft, setDraft] = useState(String(value));
  const [sliding, setSliding] = useState(false);
  const focused = useRef(false);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!focused.current) setDraft(String(value));
  }, [value]);

  const commit = (raw: string) => {
    const typed = Math.round(Number(raw));
    const n = clamp(Number.isFinite(typed) ? typed : min, min, max);
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
      // A click without a drag changes nothing: no step for it.
      if (last !== v0) onChange(last, true);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    window.addEventListener('blur', up);
  };

  // Past a few pixels a press is a drag; before that, a click. The thumb follows the pointer: a
  // field's width spans min to max.
  const startSlide = (e: React.PointerEvent<HTMLLabelElement>) => {
    if (focused.current || e.button !== 0) return;
    e.preventDefault();
    const width = e.currentTarget.getBoundingClientRect().width;
    const x0 = e.clientX;
    const v0 = value;
    let last = v0;
    let dragging = false;
    let moved = false;
    const move = (ev: PointerEvent) => {
      if (!dragging && Math.abs(ev.clientX - x0) < 3) return;
      if (!dragging) {
        dragging = true;
        setSliding(true);
        document.body.classList.add('is-scrubbing');
      }
      const next = clamp(v0 + Math.round(((ev.clientX - x0) / width) * (max - min)), min, max);
      if (next !== last) {
        last = next;
        moved = true;
        setDraft(String(next));
        onChange(next, false);
      }
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      window.removeEventListener('blur', up);
      document.body.classList.remove('is-scrubbing');
      setSliding(false);
      if (!dragging) {
        input.current?.focus();
        input.current?.select();
      } else if (moved) onChange(last, true);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    window.addEventListener('blur', up);
  };

  // From the draft, not the value: some fields only store the value on release, and the fill
  // follows the pointer meanwhile.
  const shown = draft !== '' && Number.isFinite(Number(draft)) ? Number(draft) : value;
  const fill = max > min ? ((clamp(shown, min, max) - min) / (max - min)) * 100 : 0;

  return (
    <label
      className={`field${slider ? ' is-slider' : ''}${sliding ? ' is-sliding' : ''}`}
      style={slider ? ({ '--fill': `${fill}%` } as React.CSSProperties) : undefined}
      onPointerDown={slider ? startSlide : undefined}
      // A label's click focuses its input: the slider decides that itself, on release.
      onClick={slider ? (e) => e.target !== input.current && e.preventDefault() : undefined}
      data-tip={slider ? scrubHint : undefined}
    >
      {slider && <span className="field-fill" aria-hidden="true" />}
      {label !== undefined && (
        <span
          className={`field-label${slider ? '' : ' is-scrubbable'}`}
          onPointerDown={slider ? undefined : startScrub}
          data-tip={slider ? undefined : scrubHint}
        >
          {label}
        </span>
      )}
      <input
        ref={input}
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
