import { useEffect, useState } from 'react';
import { clamp } from '../../engine/math';
import { useT } from '../../i18n';
import { PANEL_LIMITS, uiStore } from '../uiStore';

/** Drag handle on the inner edge of a side panel. Double-click resets the width. */
export function PanelResizer({ side }: { side: 'left' | 'right' }) {
  const t = useT();
  const limits = PANEL_LIMITS[side];
  // The panels fit their content and float with a margin: the handle follows its panel's edge,
  // between its rounded corners, wherever the panel is (rulers shown or not) and however tall.
  const [place, setPlace] = useState<{ top: number; height: number } | null>(null);
  useEffect(() => {
    const panel = document.querySelector<HTMLElement>(`.panel-${side}`);
    if (!panel) return;
    const measure = () => {
      const handle = document.querySelector<HTMLElement>(`.resizer-${side}`);
      const parent = handle?.offsetParent?.getBoundingClientRect();
      const r = panel.getBoundingClientRect();
      if (!parent) return;
      const inset = Math.min(12, r.height / 4);
      setPlace({ top: r.top - parent.top + inset, height: Math.max(0, r.height - inset * 2) });
    };
    const ro = new ResizeObserver(measure);
    ro.observe(panel);
    // Showing the rulers moves the panels down without resizing them.
    const app = panel.closest('.app');
    const mo = new MutationObserver(measure);
    if (app) mo.observe(app, { attributes: true, attributeFilter: ['class'] });
    window.addEventListener('resize', measure);
    measure();
    return () => {
      ro.disconnect();
      mo.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [side]);
  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    const el = e.currentTarget;
    el.setPointerCapture(e.pointerId);
    const x0 = e.clientX;
    const w0 = uiStore.get().panelWidths[side];
    el.classList.add('is-dragging');
    document.body.classList.add('is-resizing');
    uiStore.set({ picker: null });
    const move = (ev: PointerEvent) => {
      const dx = ev.clientX - x0;
      const width = clamp(Math.round(side === 'left' ? w0 + dx : w0 - dx), limits.min, limits.max);
      uiStore.set((s) => ({ panelWidths: { ...s.panelWidths, [side]: width } }));
    };
    const up = () => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
      el.classList.remove('is-dragging');
      document.body.classList.remove('is-resizing');
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  };
  return (
    <div
      className={`resizer resizer-${side}`}
      style={place ? { top: place.top, height: place.height, bottom: 'auto' } : undefined}
      role="separator"
      aria-orientation="vertical"
      aria-label={t(side === 'left' ? 'panel.resizeLeft' : 'panel.resizeRight')}
      data-tip={t('panel.resizeHint')}
      onPointerDown={onPointerDown}
      onDoubleClick={() =>
        uiStore.set((s) => ({ panelWidths: { ...s.panelWidths, [side]: limits.default } }))
      }
    />
  );
}
