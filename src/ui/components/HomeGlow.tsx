import { useEffect, useRef } from 'react';
import { readTheme } from '../render/theme';

/** The grid's step and the squares' side, in CSS pixels. */
const CELL = 16;
const SQUARE = 4;
/** Frames per second: the light moves slowly, there's no need for more. */
const FPS = 24;

/**
 * The files screen's background: a grid of small squares lit by slow, crossing waves, a few of
 * them twinkling in the accent. Faint everywhere, fainter still in the middle where the content
 * is. Still when the system asks for reduced motion.
 */
export function HomeGlow() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current!;
    const ctx = canvas.getContext('2d')!;
    let theme = readTheme();
    let cols = 0;
    let rows = 0;
    let dpr = 1;
    // Twinkles: a cell, when it lit up, and how long it lasts (seconds).
    let sparks: { i: number; at: number; life: number }[] = [];
    const still = matchMedia('(prefers-reduced-motion: reduce)');

    const size = () => {
      dpr = window.devicePixelRatio || 1;
      const { width, height } = canvas.getBoundingClientRect();
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      cols = Math.ceil(width / CELL);
      rows = Math.ceil(height / CELL);
    };

    const draw = (t: number) => {
      const { width, height } = canvas;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);
      const cx = cols / 2;
      const cy = rows * 0.35;
      const reach = Math.max(cols, rows) * 0.55;
      const s = SQUARE;
      const off = (CELL - s) / 2;
      ctx.fillStyle = theme.text;
      for (let y = 0; y < rows; y++)
        for (let x = 0; x < cols; x++) {
          // Two slow waves crossing, and a broad swell: soft patches of light that drift.
          const wave =
            Math.sin(x * 0.11 + t * 0.31) * Math.sin(y * 0.15 - t * 0.23) +
            0.6 * Math.sin((x + y) * 0.045 - t * 0.17);
          const light = Math.max(0, wave) / 1.6;
          // Quieter around the middle, where the title and the files are.
          const d = Math.hypot(x - cx, (y - cy) * 1.4) / reach;
          const room = Math.min(1, 0.3 + d * d);
          const a = (0.03 + light * 0.15) * room;
          if (a < 0.012) continue;
          ctx.globalAlpha = a;
          ctx.fillRect(x * CELL + off, y * CELL + off, s, s);
        }
      // The twinkles: in the accent, rising and fading, with a soft glow.
      ctx.fillStyle = theme.highlightFill;
      ctx.shadowColor = theme.highlightFill;
      ctx.shadowBlur = 8;
      for (const p of sparks) {
        const k = (t - p.at) / p.life;
        if (k < 0 || k > 1) continue;
        ctx.globalAlpha = Math.sin(k * Math.PI) * 0.75;
        const x = p.i % cols;
        const y = Math.floor(p.i / cols);
        ctx.fillRect(x * CELL + off, y * CELL + off, s, s);
      }
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;
    };

    let frame = 0;
    let last = 0;
    const tick = (now: number) => {
      frame = requestAnimationFrame(tick);
      if (now - last < 1000 / FPS) return;
      last = now;
      const t = now / 1000;
      // A new twinkle now and then, a dozen at most at once.
      sparks = sparks.filter((p) => t - p.at < p.life);
      if (sparks.length < 12 && Math.random() < 0.12)
        sparks.push({ i: Math.floor(Math.random() * cols * rows), at: t, life: 2 + Math.random() * 2.5 });
      draw(t);
    };
    const start = () => {
      cancelAnimationFrame(frame);
      if (still.matches) draw(12);
      else frame = requestAnimationFrame(tick);
    };

    // The theme can change while the screen is open: the system's, or the one picked.
    const retheme = () => {
      theme = readTheme();
      if (still.matches) draw(12);
    };
    const themeWatch = new MutationObserver(retheme);
    themeWatch.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    const dark = matchMedia('(prefers-color-scheme: dark)');
    dark.addEventListener('change', retheme);
    still.addEventListener('change', start);
    const resize = new ResizeObserver(() => {
      size();
      if (still.matches) draw(12);
    });
    resize.observe(canvas);
    size();
    start();
    return () => {
      cancelAnimationFrame(frame);
      resize.disconnect();
      themeWatch.disconnect();
      dark.removeEventListener('change', retheme);
      still.removeEventListener('change', start);
    };
  }, []);
  return <canvas ref={ref} className="home-glow" aria-hidden="true" />;
}
