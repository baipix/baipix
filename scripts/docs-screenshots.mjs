// The docs' screenshots, taken again from the current interface: npm run screenshots:docs.
// Starts the dev server, opens the editor in headless Chrome at 1440×900 (2×), in dark and light
// (?screenshot=…, see src/ui/screenshotMode.ts), and writes site/public/docs/shots/<name>-<theme>.webp:
// the whole editor with numbered badges on its parts, close-ups of each part, the files screen and the
// New file dialog. Prints each picture's size in CSS pixels, for its width in the docs.
// Needs Google Chrome (or CHROME=/path/to/chrome).
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const sharp = createRequire(`${root}site/package.json`)('sharp');
const out = `${root}site/public/docs/shots`;
mkdirSync(out, { recursive: true });
const PORT = 5196;
const DEBUG = 9346;
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

/** Each picture: what to set up first (in the page), and the part to frame (or the whole window). */
const SHOTS = [
  { name: 'interface', badges: true },
  { name: 'layers', frame: ['.panel-left'] },
  { name: 'toolbar', frame: ['.tool-options', '.toolbar'] },
  { name: 'right-panel', frame: ['.panel-right'] },
  { name: 'preview', frame: ['.floating-preview'] },
  {
    name: 'files',
    setup: `for (const f of ['starfighter', 'knight', 'mount-fuji', 'ramen-shop', 'starry-night']) {
        __ed.addDocuments(ff.fileFromJson(await (await fetch('/gallery/' + f + '.baipix')).text()));
      }
      ui.uiStore.set({ home: true });`,
  },
  { name: 'new-file', setup: `ui.openDialog({ type: 'newFile' });`, frame: ['.dialog'] },
  // Drawing and Colors: a tool's options and menus, opened as you'd see them.
  {
    name: 'pencil-more',
    setup: `__ed.setTool('pencil'); await new Promise((r) => setTimeout(r, 200));
      document.querySelector('.options-more').click();`,
    frame: ['.tool-options', '.menu'],
  },
  { name: 'gradient', setup: `__ed.setTool('gradient');`, frame: ['.tool-options', '.toolbar'] },
  {
    name: 'shapes-menu',
    setup: `[...document.querySelectorAll('.tool-split')]
      .find((s) => s.querySelector('[data-tool="line"], [data-tool="rect"], [data-tool="ellipse"]'))
      .querySelector('.tool-caret').click();`,
    frame: ['.menu', '.toolbar'],
  },
  {
    name: 'palette-menu',
    setup: `document.querySelector('[aria-label="Preset palette"]').click();`,
    frame: ['.menu'],
  },
  { name: 'adjustments', setup: `ui.openAdjust('layer', 'colors');`, frame: ['.adjust-panel'] },
];

const server = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], { cwd: root, stdio: 'pipe' });
const chrome = spawn(
  CHROME,
  [
    '--headless=new',
    `--remote-debugging-port=${DEBUG}`,
    `--user-data-dir=${mkdtempSync(join(tmpdir(), 'baipix-docs-'))}`,
    '--hide-scrollbars',
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
  for (const shot of SHOTS) {
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
    if (shot.frame) {
      const box = JSON.parse(
        await run(`const rects = ${JSON.stringify(shot.frame)}.map((s) => document.querySelector(s).getBoundingClientRect());
          return JSON.stringify({ x: Math.min(...rects.map((r) => r.left)), y: Math.min(...rects.map((r) => r.top)),
            right: Math.max(...rects.map((r) => r.right)), bottom: Math.max(...rects.map((r) => r.bottom)) });`),
      );
      // Room around the part for its shadow, on the canvas behind it.
      const pad = 16;
      const x = Math.max(0, Math.floor(box.x - pad));
      const y = Math.max(0, Math.floor(box.y - pad));
      clip = {
        x,
        y,
        width: Math.min(WIDTH, Math.ceil(box.right + pad)) - x,
        height: Math.min(HEIGHT, Math.ceil(box.bottom + pad)) - y,
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
