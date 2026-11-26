// The pictures of the "Animate a car" tutorial, made like the 0.8 post's: node scripts/blog-car-shots.mjs.
// Starts the dev server, opens the editor in headless Chrome at 1440×900 (2×), in dark and light
// (?screenshot=…, see src/ui/screenshotMode.ts), loads the Ecto-1 at each step of the tutorial (the files in
// site/public/blog/animate-a-car) and writes site/public/blog/animate-a-car/<name>-<theme>.webp.
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
const out = `${root}site/public/blog/animate-a-car`;
mkdirSync(out, { recursive: true });
const PORT = 5198;
const DEBUG = 9348;
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

/** The Ecto-1 at a step of the tutorial, fitted, the timeline open or not, on frame `frame` (from 0). */
const car = (step, { timeline = true, frame = 0, layer = 4 } = {}) => `
  __ed.addDocuments(ff.fileFromJson(await (await fetch('/site/public/blog/animate-a-car/${step}.baipix')).text()));
  await wait(300);
  ui.uiStore.set((s) => ({ timeline: ${timeline}, onion: { ...s.onion, on: false } }));
  __ed.setFrame(${frame});
  __ed.selectLayer(${layer}, 'single');
  document.querySelectorAll('.floating-preview').forEach((el) => (el.style.visibility = 'hidden'));
  await wait(300);
  (await import('/src/ui/viewport.ts')).viewport.fit(__ed.getState().doc);`;
/**
 * The view zoomed on a point of the drawing, in art pixels, shown in the middle of what the toolbar
 * and the timeline (when `timeline`) leave free.
 */
const zoom = (z, x, y, timeline = true) => `
  { const vp = (await import('/src/ui/viewport.ts')).viewport; vp.zoomTo(${z});
    vp.centerOn(${x}, ${y} + ${timeline ? 190 : 60} / vp.effectiveZoom); }`;
/** A ring in the accent around an element, to point at it. */
const ring = (find) =>
  `{ const el = ${find}; if (el) Object.assign(el.style, { outline: '2px solid #6e56cf', outlineOffset: '2px' }); }`;
/** As far as the timeline's frames go, not its empty right side. */
const TIMELINE = `const t = document.querySelector('.timeline').getBoundingClientRect();
  const last = [...document.querySelectorAll('.timeline-frame')].at(-1).getBoundingClientRect();
  return JSON.stringify({ x: t.left, y: t.top, right: last.right + 60, bottom: t.bottom });`;
/** Shift-clicks frames `from` to `to` (from 0), from the one shown. */
const pick = (from, to) => `
  __ed.setFrame(${from}); await wait(200);
  document.querySelectorAll('.timeline-frame')[${to}].dispatchEvent(new MouseEvent('click', { bubbles: true, shiftKey: true }));
  await wait(200);`;

// Layers, bottom to top: 0 Speed lines, 1 Road, 2 Smoke, 3 Far wheels, 4 Body, 5 Wheels, 6 Roof rack.
const SHOTS = [
  // 1. Room on the left for the smoke: Board size, 134 wide, the drawing pinned on the right.
  {
    name: 'board-size',
    setup: `${car('ecto-1-still', { timeline: false, layer: 0 })}
      ui.openDialog({ type: 'canvasSize' }); await wait(300);
      document.querySelectorAll('.anchor-grid button')[5].click(); await wait(100);
      const w = document.querySelector('.dialog input');
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(w, '134');
      w.dispatchEvent(new Event('input', { bubbles: true })); await wait(200);`,
    frame: ['.dialog'],
  },
  // 2. The roof rack selected on the board made 134 wide, before Cut and Paste puts it on a layer of its own.
  {
    name: 'select-rack',
    setup: `${car('ecto-1-still', { timeline: false, layer: 0 })}
      __ed.resizeBoardTo({ x: -18, y: 0, w: 134, h: 84 }); await wait(200);
      __ed.setTool('select');
      __ed.beginStroke({ x: 48, y: 18 }, false, {}); __ed.moveStroke({ x: 94, y: 32 }, {}); __ed.endStroke();
      ${zoom(9, 76, 34, false)}`,
  },
  // 3. The seven layers, named, in the panel.
  { name: 'layers', setup: `${car('ecto-1-layers', { timeline: false, layer: 5 })}`, frame: ['.panel-left'] },
  // 4. A front wheel up close, redrawn whole on its layer, its dark well behind it.
  {
    name: 'wheel',
    setup: `${car('ecto-1-layers', { timeline: false, layer: 5 })} ${zoom(18, 51, 50, false)}`,
  },
  // 5. The 4-frame loop: frame 2 shown, its wheels a turn further.
  { name: 'loop', setup: `${car('ecto-1-loop', { frame: 1, layer: 5 })} ${zoom(6, 67, 44)}` },
  // 6. The body and the roof rack picked with the Move tool, on frame 2, a pixel up.
  {
    name: 'move',
    setup: `${car('ecto-1-loop', { frame: 1, layer: 4 })}
      __ed.setTool('move'); __ed.selectLayer(6, 'toggle'); ${zoom(6, 67, 44)}`,
  },
  // 7. The smoke with the onion skin: the frame before in red, the one after in blue.
  {
    name: 'smoke',
    setup: `${car('ecto-1-loop', { frame: 2, layer: 2 })}
      ui.uiStore.set((s) => ({ onion: { ...s.onion, on: true, before: 1, after: 1, opacity: 0.7 } }));
      ${zoom(12, 30, 50)} await wait(200);
      ${ring("[...document.querySelectorAll('.timeline button')].find((b) => /onion/i.test(b.getAttribute('aria-label') ?? ''))")}`,
  },
  // 8. Frames 1 to 4 picked, their menu open on Copy 4 frames.
  {
    name: 'copy-frames',
    setup: `${car('ecto-1-loop', { layer: 4 })} ${pick(0, 3)}
      const r = document.querySelectorAll('.timeline-frame')[3].getBoundingClientRect();
      document.querySelectorAll('.timeline-frame')[3].dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: r.left + 12, clientY: r.top + 12 }));`,
    frame: ['.menu'],
  },
  // 9. The loop pasted three times: 16 frames.
  { name: 'sixteen', setup: `${car('ecto-1-sixteen', { layer: 4 })}`, area: TIMELINE },
  // 10. The jump: frame 11, the car at the top, the onion skin on two frames each side.
  {
    name: 'jump',
    setup: `${car('ecto-1', { frame: 10, layer: 4 })}
      ui.uiStore.set((s) => ({ onion: { ...s.onion, on: true, before: 2, after: 2, opacity: 0.6 } }));
      ${zoom(6, 67, 40)}`,
  },
  // 11. The backfire, frame 9: the car squashed, the flash and a big puff.
  { name: 'backfire', setup: `${car('ecto-1', { frame: 8, layer: 2 })} ${zoom(12, 34, 50)}` },
  // 12. Every frame picked, their duration set to 70 ms at once.
  {
    name: 'durations',
    setup: `${car('ecto-1', { layer: 4 })} ${pick(0, 15)}
      ${ring("document.querySelector('.timeline-duration')")}`,
    area: TIMELINE,
  },
  // 13. Export as a GIF.
  {
    name: 'export-gif',
    setup: `${car('ecto-1', { layer: 4 })} ui.uiStore.set({ exportFormat: 'gif' }); ui.openDialog({ type: 'export' });`,
    frame: ['.dialog'],
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
