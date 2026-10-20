import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  alpha,
  blue,
  fromHex,
  green,
  hsvToRgb,
  pack,
  red,
  rgbToHsv,
  toHex,
  withAlpha,
  type Color,
  type Hsv,
} from '../../engine/color';
import { clamp } from '../../engine/math';
import { useT } from '../../i18n';
import { useEditor, useEditorState } from '../EditorContext';
import { checkerPattern, readTheme } from '../render/theme';
import { uiStore, type ColorSlot } from '../uiStore';
import { IconButton } from './IconButton';
import { PaletteGrid } from './PaletteGrid';

const PICKER_WIDTH = 240;

/** Drags on an element, reporting the pointer position as 0..1 fractions. */
function useDrag(onDrag: (x: number, y: number) => void) {
  return (e: React.PointerEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    el.setPointerCapture(e.pointerId);
    const report = (ev: { clientX: number; clientY: number }) => {
      const r = el.getBoundingClientRect();
      onDrag(clamp((ev.clientX - r.left) / r.width, 0, 1), clamp((ev.clientY - r.top) / r.height, 0, 1));
    };
    report(e);
    const move = (ev: PointerEvent) => report(ev);
    const up = () => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
  };
}

function useCanvas(draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void, deps: unknown[]) {
  const ref = useRef<HTMLCanvasElement>(null);
  useLayoutEffect(() => {
    const c = ref.current;
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    const r = c.getBoundingClientRect();
    c.width = Math.max(1, Math.round(r.width * dpr));
    c.height = Math.max(1, Math.round(r.height * dpr));
    draw(c.getContext('2d')!, c.width, c.height);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return ref;
}

/**
 * The color fields of a picker: a saturation and brightness square, hue and opacity bars, hex and
 * opacity fields, and, when `onEyedropper` is given, the eyedropper's button. Shared by the colors'
 * picker and the gradient stops'.
 */
export function ColorFields({
  color,
  onChange,
  onEyedropper,
}: {
  color: Color;
  onChange: (color: Color) => void;
  onEyedropper?: () => void;
}) {
  const t = useT();
  const [hsv, setHsv] = useState<Hsv>(() => rgbToHsv(red(color), green(color), blue(color)));

  // Re-sync the local HSV when the color changes from outside (palette, eyedropper), keeping hue for grays.
  useEffect(() => {
    setHsv((prev) => {
      const next = rgbToHsv(red(color), green(color), blue(color));
      const [r, g, b] = hsvToRgb(prev);
      if (r === red(color) && g === green(color) && b === blue(color)) return prev;
      return {
        h: next.s === 0 || next.v === 0 ? prev.h : next.h,
        s: next.v === 0 ? prev.s : next.s,
        v: next.v,
      };
    });
  }, [color]);

  const applyHsv = (next: Hsv, a = alpha(color) || 255) => {
    setHsv(next);
    const [r, g, b] = hsvToRgb(next);
    onChange(pack(r, g, b, a));
  };

  const [hr, hg, hb] = hsvToRgb({ h: hsv.h, s: 1, v: 1 });
  const [cr, cg, cb] = hsvToRgb(hsv);
  const svRef = useCanvas(
    (ctx, w, h) => {
      ctx.fillStyle = `rgb(${hr},${hg},${hb})`;
      ctx.fillRect(0, 0, w, h);
      let g = ctx.createLinearGradient(0, 0, w, 0);
      g.addColorStop(0, '#fff');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(1, '#000');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    },
    [hr, hg, hb],
  );
  const hueRef = useCanvas((ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, w, 0);
    for (let i = 0; i <= 6; i++) g.addColorStop(i / 6, `hsl(${i * 60},100%,50%)`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }, []);
  const alphaRef = useCanvas(
    (ctx, w, h) => {
      const theme = readTheme();
      ctx.fillStyle = checkerPattern(
        ctx,
        Math.max(3, Math.round(3 * (window.devicePixelRatio || 1))),
        theme.checkA,
        theme.checkB,
      );
      ctx.fillRect(0, 0, w, h);
      const g = ctx.createLinearGradient(0, 0, w, 0);
      g.addColorStop(0, `rgba(${cr},${cg},${cb},0)`);
      g.addColorStop(1, `rgb(${cr},${cg},${cb})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    },
    [cr, cg, cb],
  );

  const onSv = useDrag((x, y) => applyHsv({ ...hsv, s: x, v: 1 - y }));
  const onHue = useDrag((x) => applyHsv({ ...hsv, h: Math.min(359.9, x * 360) }));
  const onAlpha = useDrag((x) => onChange(withAlpha(pack(cr, cg, cb), Math.round(x * 255))));

  const [hexDraft, setHexDraft] = useState('');
  useEffect(() => setHexDraft(toHex(color).slice(1).toUpperCase()), [color]);

  return (
    <>
      <div className="sv-area" onPointerDown={onSv}>
        <canvas ref={svRef} />
        <div className="knob" style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%` }} />
      </div>
      <div className="picker-row">
        {onEyedropper && (
          <IconButton icon="picker" label={t('tool.picker')} shortcut="I" onClick={onEyedropper} />
        )}
        <div className="picker-bars">
          <div className="slider" onPointerDown={onHue}>
            <canvas ref={hueRef} />
            <div className="knob" style={{ left: `${(hsv.h / 360) * 100}%` }} />
          </div>
          <div className="slider" onPointerDown={onAlpha}>
            <canvas ref={alphaRef} />
            <div className="knob" style={{ left: `${(alpha(color) / 255) * 100}%` }} />
          </div>
        </div>
      </div>
      <div className="picker-fields">
        <label className="field">
          <span className="field-label">Hex</span>
          <input
            value={hexDraft}
            maxLength={7}
            spellCheck={false}
            aria-label="Hex"
            onChange={(e) => {
              setHexDraft(e.target.value);
              const c = fromHex(e.target.value, alpha(color) || 255);
              if (c !== null && e.target.value.replace('#', '').length === 6) onChange(c);
            }}
            onBlur={() => setHexDraft(toHex(color).slice(1).toUpperCase())}
            onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          />
        </label>
        <label className="field">
          <input
            type="number"
            min={0}
            max={100}
            value={Math.round(alpha(color) / 2.55)}
            aria-label={t('common.opacity')}
            onChange={(e) =>
              onChange(withAlpha(color, Math.round(clamp(Number(e.target.value) || 0, 0, 100) * 2.55)))
            }
          />
          <span className="field-suffix">%</span>
        </label>
      </div>
    </>
  );
}

export function ColorPicker() {
  const t = useT();
  const editor = useEditor();
  const picker = uiStore.use((s) => s.picker);
  const primary = useEditorState((s) => s.primary);
  const secondary = useEditorState((s) => s.secondary);
  const background = useEditorState((s) => s.doc.background);
  const palette = useEditorState((s) => s.palette.colors);
  const ref = useRef<HTMLDivElement>(null);
  const backgroundEdited = useRef(false);

  const slot: ColorSlot | null = picker?.slot ?? null;
  const color = slot === 'primary' ? primary : slot === 'secondary' ? secondary : background;

  useEffect(() => {
    backgroundEdited.current = false;
  }, [slot]);

  useEffect(() => {
    if (!picker) return;
    const onDown = (e: PointerEvent) => {
      const target = e.target as HTMLElement;
      if (!ref.current?.contains(target) && !target.closest('.color-chip')) uiStore.set({ picker: null });
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && uiStore.set({ picker: null });
    document.addEventListener('pointerdown', onDown, true);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown, true);
      document.removeEventListener('keydown', onKey);
    };
  }, [picker]);

  const apply = (next: Color) => {
    if (!slot) return;
    if (slot === 'background') {
      if (!backgroundEdited.current) {
        backgroundEdited.current = true;
        editor.setBackground(next, true);
      } else editor.previewBackground(next);
    } else editor.setColor(slot, next);
  };

  if (!picker || !slot) return null;
  const right = document.querySelector('.panel-right')?.getBoundingClientRect();
  const style = {
    left: Math.max(8, (right?.left ?? innerWidth) - PICKER_WIDTH - 8),
    top: clamp(picker.top - 48, 8, Math.max(8, innerHeight - 520)),
  };
  const titles: Record<ColorSlot, string> = {
    primary: t('color.primary'),
    secondary: t('color.secondary'),
    background: t('color.background'),
  };

  return (
    <div ref={ref} className="popover color-picker" style={style} role="dialog" aria-label={titles[slot]}>
      <div className="popover-header">
        <span>{titles[slot]}</span>
        <IconButton icon="close" label={t('common.close')} onClick={() => uiStore.set({ picker: null })} />
      </div>
      <div className="popover-body">
        <ColorFields
          key={slot}
          color={color}
          onChange={apply}
          onEyedropper={
            slot === 'background'
              ? undefined
              : () => {
                  editor.setTool('picker');
                  uiStore.set({ picker: null });
                }
          }
        />
        <div className="popover-section">
          <span className="muted">{t('section.palette')}</span>
          <PaletteGrid
            colors={palette}
            primary={color}
            onPick={(c) => apply(withAlpha(c, alpha(color) || 255))}
          />
        </div>
      </div>
    </div>
  );
}

export const PICKER_WIDTH_PX = PICKER_WIDTH;
