// The 0.8 blog post's pictures, from the docs' screenshot script: node scripts/blog-shots.mjs.
// Starts the dev server, opens the editor in headless Chrome at 1440×900 (2×), in dark and light
// (?screenshot=…, see src/ui/screenshotMode.ts), and writes site/public/docs/shots/<name>-<theme>.webp:
// the whole editor with numbered badges on its parts, close-ups of each part, the files screen and the
// New file dialog. Prints each picture's size in CSS pixels, for its width in the docs.
// ONLY=name,name takes only those pictures again.
// Needs Google Chrome (or CHROME=/path/to/chrome).
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const sharp = createRequire(`${root}site/package.json`)('sharp');
const out = `${root}site/public/blog/0-8`;
mkdirSync(out, { recursive: true });
const PORT = 5197;
const DEBUG = 9347;
const WIDTH = 1440;
const HEIGHT = 900;
const CHROME =
  process.env.CHROME ??
  [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
  ].find(existsSync);
if (!CHROME) {
  console.error('Google Chrome not found: set CHROME to its path.');
  process.exit(1);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// The parts of the editor, numbered in the order the Interface page describes them.
const PARTS = [
  '.menubar-menus',
  '.panel-left',
  '.toolbar',
  '.tool-options',
  '.panel-right',
  '.floating-preview',
];

/** The board on the screen, in CSS pixels: to frame the canvas around the drawing. */
const BOARD = `const c = [...document.querySelectorAll('canvas')].sort((a, b) => b.width - a.width)[0].getBoundingClientRect();
  const vp = (await import('/src/ui/viewport.ts')).viewport;
  const d = __ed.getState().doc;
  const x = c.x + vp.originX / vp.dpr, y = c.y + vp.originY / vp.dpr, z = vp.scale / vp.dpr;
  // Room above for the board's name, below for its size.
  return JSON.stringify({ x, y: y - 22, right: x + d.width * z, bottom: y + d.height * z + 30 });`;
/** The slime from the animation page, its timeline open on a frame mid-jump, the onion skin on. */
const SLIME = `__ed.addDocuments(ff.fileFromJson(await (await fetch('/site/src/art/slime.baipix')).text()));
  await wait(300);
  ui.uiStore.set((s) => ({ timeline: true, onion: { ...s.onion, on: true, before: 2, after: 2 } }));
  __ed.setFrame(5);
  await wait(300);
  (await import('/src/ui/viewport.ts')).viewport.fit(__ed.getState().doc);`;
/** The top of the window, down to `bottom`: a screen whose content stops early. */
const TOP = (bottom) => `return JSON.stringify({ x: 0, y: 0, right: ${WIDTH}, bottom: ${bottom} });`;

/**
 * Each picture: what to set up first (in the page), and the part to frame: selectors, or `area`, code
 * that returns a box; the whole window without either. With `focus`, only those parts show, on a
 * transparent page, and the picture is composed: the parts in the middle of a plain tinted card.
 */
const BG = `__ed.setBackground(0xff3b2a1d >>> 0, true);`;
const load = (path) => `__ed.addDocuments(ff.fileFromJson(await (await fetch('${path}')).text()));
  await wait(300);
  (await import('/src/ui/viewport.ts')).viewport.fit(__ed.getState().doc);`;
/** The timeline, made as wide as its frames; with the frame menu if it's open. */
const TIMELINE = `const tl = document.querySelector('.timeline');
  const last = [...document.querySelectorAll('.timeline-frame')].at(-1).getBoundingClientRect();
  // The timeline as wide as its frames, so it keeps its own right edge.
  tl.style.width = Math.ceil(last.right + 48 - tl.getBoundingClientRect().left) + 'px';
  await new Promise((r) => setTimeout(r, 100));
  const t = tl.getBoundingClientRect();
  const m = document.querySelector('.menu')?.getBoundingClientRect();
  return JSON.stringify({ x: t.left, y: Math.min(t.top, m?.top ?? t.top), right: Math.max(t.right, m?.right ?? 0), bottom: Math.max(t.bottom, m?.bottom ?? 0) });`;
const SHOTS = [
  // The timeline alone, the onion skin off: frames, rows, durations.
  {
    name: 'timeline',
    setup: `${SLIME} ui.uiStore.set((s) => ({ onion: { ...s.onion, on: false } }));`,
    focus: ['.timeline'],
    area: TIMELINE,
  },
  // The onion skin as a close-up: the slime alone, its frames before in red and after in blue,
  // straight on the card's color, and the onion button lit beside it.
  {
    name: 'onion',
    setup: `${SLIME}
      ui.uiStore.set((s) => ({ onion: { ...s.onion, on: true, before: 2, after: 2, opacity: 0.7 } }));
      const dark = location.search.includes('dark');
      __ed.getState().doc.layers.forEach((l, i) => (l.name === 'Sky' || l.name === 'Ground') && __ed.setLayerVisible(i, false));
      // The board's background, the card's color: the slime sits on the card itself.
      __ed.setBackground((dark ? 0xff181b1d : 0xffe9f0f3) >>> 0, true);
      await wait(200);
      const vp = (await import('/src/ui/viewport.ts')).viewport;
      vp.zoomTo(14);
      vp.centerOn(32, 18);
      await wait(200);
      const canvas = [...document.querySelectorAll('canvas')].sort((a, b) => b.width - a.width)[0];
      canvas.classList.add('shot-canvas');
      const style = document.createElement('style');
      style.textContent = '.shot-canvas.shot-focus { outline: none !important; box-shadow: none !important; }';
      document.head.append(style);
      // The onion button, lit, in a small card by the slime.
      const button = [...document.querySelectorAll('.timeline button')].find((b) => /onion/i.test(b.getAttribute('aria-label') ?? ''));
      const chip = document.createElement('div');
      chip.className = 'shot-chip';
      const lit = button.cloneNode(true);
      Object.assign(lit.style, { width: '56px', height: '56px', borderRadius: '12px', background: '#6e56cf', color: '#fff', display: 'grid', placeItems: 'center' });
      lit.querySelector('svg')?.setAttribute('width', '28');
      lit.querySelector('svg')?.setAttribute('height', '28');
      chip.append(lit);
      const c = canvas.getBoundingClientRect();
      const d = __ed.getState().doc;
      const x = c.x + vp.originX / vp.dpr, y = c.y + vp.originY / vp.dpr, z = vp.scale / vp.dpr;
      Object.assign(chip.style, {
        position: 'fixed', zIndex: 9999, padding: '8px', borderRadius: '18px',
        background: dark ? '#2a2723' : '#fff',
        left: x + d.width * z - 140 + 'px', top: y + (d.height * z) / 2 - 36 + 'px',
      });
      document.body.append(chip);`,
    focus: ['.shot-canvas', '.shot-chip'],
    // Inside the board only: no editor around it, no board name.
    pad: 0,
    // The board, where the slime and its frames are.
    area: `const c = document.querySelector('.shot-canvas').getBoundingClientRect();
      const vp = (await import('/src/ui/viewport.ts')).viewport;
      const d = __ed.getState().doc;
      const x = c.x + vp.originX / vp.dpr, y = c.y + vp.originY / vp.dpr, z = vp.scale / vp.dpr;
      return JSON.stringify({ x: x + 4, y: y + 4, right: x + d.width * z - 4, bottom: y + d.height * z - 4 });`,
  },
  {
    name: 'export-frames',
    setup: `${SLIME} ui.uiStore.set({ exportFormat: 'frames', exportSheetColumns: 5 }); ui.openDialog({ type: 'export' });`,
    focus: ['.dialog'],
  },
  {
    name: 'frame-menu',
    setup: `${SLIME}
      ui.uiStore.set((s) => ({ onion: { ...s.onion, on: false } }));
      await wait(200);
      const frames = document.querySelectorAll('.timeline-frame');
      frames[8].dispatchEvent(new MouseEvent('click', { bubbles: true, shiftKey: true }));
      await wait(200);
      const r = frames[7].getBoundingClientRect();
      frames[7].dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: r.left + 12, clientY: r.top + 12 }));
      await wait(200);
      // The menu over the timeline's lower right, overlapping it, so both read together; the
      // timeline moved up first, so the menu has room under it.
      const tl = document.querySelector('.timeline');
      Object.assign(tl.style, { position: 'fixed', top: '120px', bottom: 'auto' });
      const last = [...document.querySelectorAll('.timeline-frame')].at(-1).getBoundingClientRect();
      tl.style.width = Math.ceil(last.right + 48 - tl.getBoundingClientRect().left) + 'px';
      await wait(100);
      const t = tl.getBoundingClientRect();
      const menu = document.querySelector('.menu');
      const m = menu.getBoundingClientRect();
      Object.assign(menu.style, { position: 'fixed', left: t.right - m.width * 0.6 + 'px', top: t.top + t.height * 0.4 + 'px', bottom: 'auto', right: 'auto' });`,
    focus: ['.timeline', '.menu'],
    area: TIMELINE,
  },
  {
    name: 'export-gif',
    setup: `${SLIME} ui.uiStore.set({ exportFormat: 'gif' }); ui.openDialog({ type: 'export' });`,
    focus: ['.dialog'],
  },
  // The whole editor: the slime mid-jump, the timeline and the onion skin.
  { name: 'animation', setup: SLIME },
  // The light on a drawing: the stage in the right panel, the sun and its lines over the canvas.
  {
    name: 'light',
    setup: `${load('/site/src/art/hobbit-house.baipix')}
      __ed.setLight({ angle: 135, height: 40, direction: true });
      await wait(200);
      document.getElementById('light')?.scrollIntoView({ block: 'center' });`,
    // The board and the right panel, without the toolbar.
    area: `const c = [...document.querySelectorAll('canvas')].sort((a, b) => b.width - a.width)[0].getBoundingClientRect();
      const vp = (await import('/src/ui/viewport.ts')).viewport;
      const x = c.x + vp.originX / vp.dpr - 24;
      return JSON.stringify({ x, y: 76, right: ${WIDTH}, bottom: 760 });`,
    width: 1200,
  },
  // Remap on an animated board with a background: its All frames and Also remap the background boxes.
  {
    name: 'remap',
    setup: `${SLIME} ${BG} ui.openAdjust('all', 'remap');`,
    focus: ['.adjust-panel'],
  },
  // The editor in Japanese.
  {
    name: 'japanese',
    setup: `${load('/gallery/ramen-shop.baipix')} (await import('/src/i18n/index.ts')).setLocale('ja', 'ja');`,
  },
];
const only = process.env.ONLY?.split(',');
const shots = only ? SHOTS.filter((s) => only.includes(s.name)) : SHOTS;

const server = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], { cwd: root, stdio: 'pipe' });
const chrome = spawn(
  CHROME,
  [
    '--headless=new',
    `--remote-debugging-port=${DEBUG}`,
    `--user-data-dir=${mkdtempSync(join(tmpdir(), 'baipix-docs-'))}`,
    '--hide-scrollbars',
    // In English, whatever the computer's language: Baipix opens in the browser's.
    '--lang=en-US',
    '--accept-lang=en-US',
    'about:blank',
  ],
  { stdio: 'ignore' },
);
const stop = () => {
  chrome.kill();
  server.kill();
};
process.on('exit', stop);

for (let i = 0; ; i++) {
  try {
    await fetch(`http://localhost:${PORT}/`);
    break;
  } catch {
    if (i > 100) throw new Error('The dev server did not start.');
    await sleep(200);
  }
}
let pages;
for (let i = 0; ; i++) {
  try {
    pages = await (await fetch(`http://127.0.0.1:${DEBUG}/json/list`)).json();
    if (pages.length) break;
  } catch {
    /* not up yet */
  }
  if (i > 100) throw new Error('Chrome did not start.');
  await sleep(100);
}
const ws = new WebSocket(pages.find((p) => p.type === 'page').webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0;
const pending = new Map();
ws.onmessage = (m) => {
  const msg = JSON.parse(m.data);
  pending.get(msg.id)?.(msg);
};
const send = (method, params = {}) =>
  new Promise((resolve, reject) => {
    const n = ++id;
    pending.set(n, (msg) => (msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result)));
    ws.send(JSON.stringify({ id: n, method, params }));
  });
const run = async (code) => {
  const r = await send('Runtime.evaluate', {
    expression: `(async () => { ${code} })()`,
    awaitPromise: true,
    returnByValue: true,
  });
  if (r.exceptionDetails)
    throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
  return r.result.value;
};

await send('Emulation.setDeviceMetricsOverride', {
  width: WIDTH,
  height: HEIGHT,
  deviceScaleFactor: 2,
  mobile: false,
});
/** The composed pictures: 1100 × 688, at 2×, a plain warm card, like the posts on Bluesky. */
const OUTLINE = { light: '#aaa49a', dark: '#5f5a53' };
const SHADOW = { light: 'rgba(70, 60, 45, 0.12)', dark: 'rgba(0, 0, 0, 0.45)' };
const CARD = { width: 2200, height: 1376, light: '#f3f0e9', dark: '#1d1b18' };
/** A part of the editor, cut out on a transparent page, in the middle of the card, as big as it fits. */
async function compose(png, theme, file) {
  const part = sharp(png);
  const { width, height } = await part.metadata();
  // As big as the card allows: the parts are the picture.
  const scale = Math.min((CARD.width * 0.9) / width, (CARD.height * 0.86) / height);
  const w = Math.round(width * scale);
  const h = Math.round(height * scale);
  const resized = await part.resize(w, h).png().toBuffer();
  await sharp({ create: { width: CARD.width, height: CARD.height, channels: 4, background: CARD[theme] } })
    .composite([
      { input: resized, left: Math.round((CARD.width - w) / 2), top: Math.round((CARD.height - h) / 2) },
    ])
    .webp({ quality: 90 })
    .toFile(file);
}

for (const theme of ['dark', 'light']) {
  for (const shot of shots) {
    // A fresh editor for each picture, as the screenshot mode opens it.
    // Close-ups are drawn at 4×, so they stay sharp once enlarged on the card.
    await send('Emulation.setDeviceMetricsOverride', {
      width: WIDTH,
      height: HEIGHT,
      deviceScaleFactor: shot.focus ? 4 : 2,
      mobile: false,
    });
    await send('Page.navigate', { url: `http://localhost:${PORT}/?screenshot=${theme}` });
    await sleep(4000);
    await run(`
      const root = document.getElementById('root');
      const key = Object.keys(root).find((k) => k.startsWith('__reactContainer'));
      const stack = [root[key]];
      while (stack.length) {
        const f = stack.pop();
        if (!f) continue;
        const v = f.memoizedProps?.editor;
        if (v && typeof v.getState === 'function') { window.__ed = v; break; }
        if (f.child) stack.push(f.child);
        if (f.sibling) stack.push(f.sibling);
      }
      window.ui = await import('/src/ui/uiStore.ts');
      window.wait = (t) => new Promise((r) => setTimeout(r, t));
      window.ff = await import('/src/storage/fileFormat.ts');`);
    if (shot.setup) await run(`${shot.setup} await new Promise((r) => setTimeout(r, 600));`);
    // Numbered badges on the parts, in the accent, at their top left corner.
    if (shot.badges)
      await run(`
        ${JSON.stringify(PARTS)}.forEach((sel, i) => {
          const r = document.querySelector(sel).getBoundingClientRect();
          const b = document.createElement('div');
          b.textContent = i + 1;
          Object.assign(b.style, {
            position: 'fixed', zIndex: 9999, left: Math.max(4, r.left - 10) + 'px', top: Math.max(4, r.top - 10) + 'px',
            width: '24px', height: '24px', borderRadius: '50%', display: 'grid', placeItems: 'center',
            background: 'var(--glow)', color: '#fff', font: '600 13px/1 Inter, system-ui, sans-serif',
            boxShadow: '0 0 0 2px var(--canvas), 0 2px 6px rgba(0,0,0,0.3)',
          });
          document.body.appendChild(b);
        });`);
    // The mouse out of the way, so nothing shows its hover state.
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: WIDTH - 2, y: HEIGHT - 2 });
    await sleep(400);
    if (shot.focus) {
      // Only the parts show: everything else hidden, the page transparent behind them.
      await run(`
        const style = document.createElement('style');
        style.textContent = 'html, body { background: transparent !important; } ::backdrop { background: transparent !important; } body * { visibility: hidden !important; } .shot-focus, .shot-focus * { visibility: visible !important; }'
          // Drawn like the site's pixel buttons: a firm outline and a hard shadow, not a soft one.
          + '.shot-focus { outline: 1.5px solid ${OUTLINE[theme]} !important; outline-offset: 0 !important; box-shadow: 8px 8px 0 ${SHADOW[theme]} !important; }';
        document.head.append(style);
        ${JSON.stringify(shot.focus)}.forEach((sel) => document.querySelectorAll(sel).forEach((el) => el.classList.add('shot-focus')));`);
      await send('Emulation.setDefaultBackgroundColorOverride', { color: { r: 0, g: 0, b: 0, a: 0 } });
      await sleep(200);
      const box = JSON.parse(
        await run(
          shot.area ??
            `const rects = ${JSON.stringify(shot.focus)}.map((s) => document.querySelector(s).getBoundingClientRect());
          return JSON.stringify({ x: Math.min(...rects.map((r) => r.left)), y: Math.min(...rects.map((r) => r.top)),
            right: Math.max(...rects.map((r) => r.right)), bottom: Math.max(...rects.map((r) => r.bottom)) });`,
        ),
      );
      // Room around the parts for their outline and hard shadow.
      const pad = shot.pad ?? 24;
      const x = Math.max(0, Math.floor(box.x - pad));
      const y = Math.max(0, Math.floor(box.y - pad));
      const part = await send('Page.captureScreenshot', {
        format: 'png',
        clip: {
          x,
          y,
          width: Math.min(WIDTH, Math.ceil(box.right + pad)) - x,
          height: Math.min(HEIGHT, Math.ceil(box.bottom + pad)) - y,
          scale: 1,
        },
      });
      await send('Emulation.setDefaultBackgroundColorOverride', {});
      const file = `${out}/${shot.name}-${theme}.webp`;
      await compose(Buffer.from(part.data, 'base64'), theme, file);
      console.log(`Wrote ${file} (composed)`);
      continue;
    }
    let clip = { x: 0, y: 0, width: WIDTH, height: HEIGHT, scale: 1 };
    if (shot.frame || shot.area) {
      const box = JSON.parse(
        await run(
          shot.area ??
            `const rects = ${JSON.stringify(shot.frame)}.map((s) => document.querySelector(s).getBoundingClientRect());
          return JSON.stringify({ x: Math.min(...rects.map((r) => r.left)), y: Math.min(...rects.map((r) => r.top)),
            right: Math.max(...rects.map((r) => r.right)), bottom: Math.max(...rects.map((r) => r.bottom)) });`,
        ),
      );
      // Every picture the same shape, 16:10, centered on the part with the editor around it.
      const w = shot.width ?? 1100;
      const h = Math.round((w * 10) / 16);
      const cx = (box.x + box.right) / 2;
      const cy = (box.y + box.bottom) / 2;
      clip = {
        x: Math.round(Math.min(WIDTH - w, Math.max(0, cx - w / 2))),
        y: Math.round(Math.min(HEIGHT - h, Math.max(0, cy - h / 2))),
        width: w,
        height: h,
        scale: 1,
      };
    }
    const { data } = await send('Page.captureScreenshot', { format: 'png', clip });
    const file = `${out}/${shot.name}-${theme}.webp`;
    await sharp(Buffer.from(data, 'base64')).webp({ quality: 88 }).toFile(file);
    console.log(`Wrote ${file} (${clip.width} × ${clip.height})`);
  }
}
ws.close();
stop();
