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
 * that returns a box; the whole window without either.
 */
const BG = `__ed.setBackground(0xff3b2a1d >>> 0, true);`;
const load = (path) => `__ed.addDocuments(ff.fileFromJson(await (await fetch('${path}')).text()));
  await wait(300);
  (await import('/src/ui/viewport.ts')).viewport.fit(__ed.getState().doc);`;
const SHOTS = [
  // The timeline alone, the onion skin off: frames, rows, durations.
  {
    name: 'timeline',
    setup: `${SLIME} ui.uiStore.set((s) => ({ onion: { ...s.onion, on: false } }));`,
    // As far as its frames go, not its empty right side.
    area: `const t = document.querySelector('.timeline').getBoundingClientRect();
      const last = [...document.querySelectorAll('.timeline-frame')].at(-1).getBoundingClientRect();
      return JSON.stringify({ x: t.left, y: t.top, right: last.right + 60, bottom: t.bottom });`,
  },
  // The onion skin up close: the board with the frames around it in red and blue.
  {
    name: 'onion',
    // The canvas and the timeline only, the onion button ringed in the accent.
    setup: `${SLIME}
      ui.uiStore.set((s) => ({ onion: { ...s.onion, on: true, before: 3, after: 3, opacity: 0.7 } }));
      await wait(200);
      for (const sel of ['.panel-left', '.panel-right', '.floating-preview', '.toolbar', '.tool-options'])
        document.querySelectorAll(sel).forEach((el) => (el.style.visibility = 'hidden'));
      const vp = (await import('/src/ui/viewport.ts')).viewport;
      vp.zoomTo(14);
      vp.centerOn(32, 19 + 90 / vp.effectiveZoom);
      const onion = [...document.querySelectorAll('.timeline button')].find((b) => /onion/i.test(b.getAttribute('aria-label') ?? ''));
      Object.assign(onion.style, { outline: '2px solid #6e56cf', outlineOffset: '2px' });`,
  },
  {
    name: 'export-sequence',
    setup: `${SLIME} ui.uiStore.set({ exportFormat: 'sequence' }); ui.openDialog({ type: 'export' });`,
    frame: ['.dialog'],
  },
  {
    name: 'export-frames',
    setup: `${SLIME} ui.uiStore.set({ exportFormat: 'frames', exportSheetColumns: 5 }); ui.openDialog({ type: 'export' });`,
    frame: ['.dialog'],
  },
  {
    name: 'export-aseprite',
    setup: `${SLIME} ui.uiStore.set({ exportFormat: 'aseprite' }); ui.openDialog({ type: 'export' });`,
    frame: ['.dialog'],
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
      frames[7].dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: r.left + 12, clientY: r.top + 12 }));`,
    frame: ['.menu'],
  },
  {
    name: 'export-gif',
    setup: `${SLIME} ui.uiStore.set({ exportFormat: 'gif' }); ui.openDialog({ type: 'export' });`,
    frame: ['.dialog'],
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
  // Remap on a board with a background: the panel and its Also remap the background box.
  {
    name: 'remap',
    setup: `${load('/gallery/starry-night.baipix')} ${BG} ui.openAdjust('all', 'remap');`,
    frame: ['.adjust-panel'],
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
for (const theme of ['dark', 'light']) {
  for (const shot of shots) {
    // A fresh editor for each picture, as the screenshot mode opens it.
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
