import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { t as translate, useT, type MessageKey } from '../../i18n';
import { uiStore } from '../uiStore';

const DONE_KEY = 'baipix.tourDone';

interface Step {
  title: MessageKey;
  text: MessageKey;
  /** What the bubble points at: one element, or several taken together (a group of tools). */
  target: () => Element[];
  /** Brings the target into view first (a tab, a section). */
  prepare?: () => void;
}

const all = (selector: string) => () => [...document.querySelectorAll(selector)];
const tools = (...ids: string[]) => all(ids.map((id) => `.toolbar [data-tool="${id}"]`).join(', '));
const showDesign = (section?: string) => () =>
  uiStore.set((u) => ({
    rightTab: 'design',
    collapsed: section ? u.collapsed.filter((x) => x !== section) : u.collapsed,
  }));

const STEPS: Step[] = [
  {
    title: 'tour.drawTitle',
    text: 'tour.draw',
    target: tools('pencil', 'lassoFill', 'eraser', 'bucket', 'gradient'),
  },
  { title: 'tour.shapesTitle', text: 'tour.shapes', target: all('.toolbar .tool-split') },
  { title: 'tour.colorsTitle', text: 'tour.colors', target: tools('shade', 'lighten', 'blur', 'spray') },
  { title: 'tour.warpTitle', text: 'tour.warp', target: tools('jumble', 'liquify') },
  {
    title: 'tour.paletteTitle',
    text: 'tour.palette',
    prepare: showDesign('palette'),
    target: () =>
      [document.querySelector('.panel-right .palette-picker')?.closest('.section')].filter(
        (x) => !!x,
      ) as Element[],
  },
  {
    title: 'tour.gapTitle',
    text: 'tour.gap',
    prepare: showDesign('canvas'),
    target: () => {
      const gap = document.querySelector(`.panel-right input[aria-label="${translate('render.gap')}"]`);
      return [gap?.closest('.row') ?? gap].filter((x) => !!x) as Element[];
    },
  },
  { title: 'tour.exportTitle', text: 'tour.export', target: all('#panel-tab-export') },
];

/** The tour was shown (finished or skipped): it isn't offered again. */
const isDone = () => {
  try {
    return localStorage.getItem(DONE_KEY) === '1';
  } catch {
    return true;
  }
};
const finish = () => {
  try {
    localStorage.setItem(DONE_KEY, '1');
  } catch {
    /* not remembered: it would only come back once */
  }
  uiStore.set({ tour: null });
};

/** Starts the tour the first time the editor shows on a large enough screen. */
export function startTourOnce(): void {
  if (!isDone() && window.innerWidth > 820 && uiStore.get().tour === null) uiStore.set({ tour: 0 });
}

const unionRect = (els: Element[]) => {
  const rects = els.map((e) => e.getBoundingClientRect()).filter((r) => r.width && r.height);
  if (!rects.length) return null;
  const left = Math.min(...rects.map((r) => r.left));
  const top = Math.min(...rects.map((r) => r.top));
  const right = Math.max(...rects.map((r) => r.right));
  const bottom = Math.max(...rects.map((r) => r.bottom));
  return { left, top, width: right - left, height: bottom - top };
};

/**
 * A few tips the first time: one bubble at a time, pointing at what it's about, with Next and Skip.
 * Nothing is blocked meanwhile. Help › Take the tour shows it again.
 */
export function Tour() {
  const step = uiStore.use((s) => s.tour);
  return step === null ? null : <Bubble index={step} />;
}

function Bubble({ index }: { index: number }) {
  const t = useT();
  const step = STEPS[index];
  const bubble = useRef<HTMLDivElement>(null);
  const [, redraw] = useState(0);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const target = step ? unionRect(step.target()) : null;

  useEffect(() => {
    step?.prepare?.();
    // Let the tab or section open, then measure.
    const id = requestAnimationFrame(() => redraw((n) => n + 1));
    return () => cancelAnimationFrame(id);
  }, [step]);
  useEffect(() => {
    const onResize = () => redraw((n) => n + 1);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && finish();
    window.addEventListener('resize', onResize);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('keydown', onKey);
    };
  }, []);

  // Above what's low on the screen, to the left of the right panel, else below.
  useLayoutEffect(() => {
    const b = bubble.current;
    if (!b || !target) return setPos(null);
    const { offsetWidth: w, offsetHeight: h } = b;
    const gap = 14;
    let left: number;
    let top: number;
    if (target.left > innerWidth * 0.6) {
      left = target.left - w - gap;
      top = target.top + target.height / 2 - h / 2;
    } else if (target.top > innerHeight / 2) {
      left = target.left + target.width / 2 - w / 2;
      top = target.top - h - gap;
    } else {
      left = target.left + target.width / 2 - w / 2;
      top = target.top + target.height + gap;
    }
    setPos({
      left: Math.max(8, Math.min(innerWidth - w - 8, left)),
      top: Math.max(8, Math.min(innerHeight - h - 8, top)),
    });
  }, [index, target?.left, target?.top, target?.width, target?.height]);

  if (!step) return null;
  const last = index === STEPS.length - 1;
  return (
    <>
      {target && (
        <div
          className="tour-ring"
          aria-hidden="true"
          style={{
            left: target.left - 4,
            top: target.top - 4,
            width: target.width + 8,
            height: target.height + 8,
          }}
        />
      )}
      <div
        ref={bubble}
        className="tour-bubble popover"
        role="dialog"
        aria-label={t(step.title)}
        style={pos ?? { left: '50%', top: '40%', transform: 'translate(-50%, -50%)' }}
      >
        <strong>{t(step.title)}</strong>
        <p>{t(step.text)}</p>
        <div className="tour-footer">
          <span className="muted">{t('tour.count', { n: index + 1, total: STEPS.length })}</span>
          <button type="button" className="tour-skip" onClick={finish}>
            {t('tour.skip')}
          </button>
          <button
            type="button"
            className="btn btn-primary"
            autoFocus
            onClick={() => (last ? finish() : uiStore.set({ tour: index + 1 }))}
          >
            {t(last ? 'tour.done' : 'tour.next')}
          </button>
        </div>
      </div>
    </>
  );
}
