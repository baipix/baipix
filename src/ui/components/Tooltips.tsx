import { useEffect, useLayoutEffect, useRef, useState } from 'react';

interface Tip {
  text: string;
  shortcut?: string;
  anchor: DOMRect;
  above: boolean;
}

/**
 * Global tooltips: any element with `data-tip` (and optional `data-kbd`) gets a dark
 * bubble after a short hover delay. Toolbar tooltips open above.
 */
export function Tooltips() {
  const [tip, setTip] = useState<Tip | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let timer = 0;
    let target: HTMLElement | null = null;
    const hide = () => {
      clearTimeout(timer);
      target = null;
      setTip(null);
    };
    const onOver = (e: PointerEvent) => {
      const el = (e.target as HTMLElement).closest<HTMLElement>('[data-tip]');
      if (el === target) return;
      hide();
      if (!el || e.pointerType === 'touch' || document.querySelector('.menu')) return;
      target = el;
      timer = window.setTimeout(() => {
        if (!el.isConnected || !el.dataset.tip) return;
        setTip({
          text: el.dataset.tip,
          shortcut: el.dataset.kbd,
          anchor: el.getBoundingClientRect(),
          above: !!el.closest('.toolbar, .help-corner'),
        });
      }, 500);
    };
    document.addEventListener('pointerover', onOver);
    document.addEventListener('pointerdown', hide, true);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('pointerover', onOver);
      document.removeEventListener('pointerdown', hide, true);
    };
  }, []);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !tip) return;
    const { anchor, above } = tip;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    let top = above ? anchor.top - h - 8 : anchor.bottom + 6;
    if (top + h > innerHeight - 8) top = anchor.top - h - 6;
    el.style.left = `${Math.min(Math.max(8, anchor.left + anchor.width / 2 - w / 2), innerWidth - w - 8)}px`;
    el.style.top = `${Math.max(8, top)}px`;
  }, [tip]);

  return (
    <div ref={ref} className={`tooltip${tip ? ' is-visible' : ''}`} role="tooltip">
      {tip?.text}
      {tip?.shortcut && <span className="tooltip-shortcut">{tip.shortcut}</span>}
    </div>
  );
}
