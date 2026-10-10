// The editor's screenshots for the website and the README, taken again from the current interface:
// npm run screenshots. Starts the dev server, opens the editor in headless Chrome at 1440×900 (2×)
// in dark and light (?screenshot=…, see src/ui/screenshotMode.ts), and writes
// site/public/screenshot-dark.png, site/public/screenshot-light.png and docs/screenshot.png.
// Needs Google Chrome (or CHROME=/path/to/chrome).
import { spawn, execFileSync } from 'node:child_process';
import { copyFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const PORT = 5199;
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

const server = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], { cwd: root, stdio: 'pipe' });
const stop = () => server.kill();
process.on('exit', stop);

// Waits for the dev server to answer.
for (let i = 0; ; i++) {
  try {
    await fetch(`http://localhost:${PORT}/`);
    break;
  } catch {
    if (i > 100) throw new Error('The dev server did not start.');
    await new Promise((r) => setTimeout(r, 200));
  }
}

for (const theme of ['dark', 'light']) {
  const out = `${root}site/public/screenshot-${theme}.png`;
  execFileSync(CHROME, [
    '--headless=new',
    '--hide-scrollbars',
    '--window-size=1440,900',
    '--force-device-scale-factor=2',
    // Time for the app to load the drawing and draw it.
    '--virtual-time-budget=6000',
    `--screenshot=${out}`,
    `http://localhost:${PORT}/?screenshot=${theme}`,
  ]);
  console.log(`Wrote ${out}`);
}
copyFileSync(`${root}site/public/screenshot-dark.png`, `${root}docs/screenshot.png`);
console.log(`Wrote ${root}docs/screenshot.png`);
stop();
