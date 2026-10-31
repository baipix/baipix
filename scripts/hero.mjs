// The home page's animation, taken again from the current interface: npm run screenshots:hero.
// Starts the dev server, takes the editor in headless Chrome at 1440×900 (2×) once per frame of
// docs/slime.baipix (?screenshot=…&frame=N, see src/ui/screenshotMode.ts), in dark and light, and
// joins each theme's frames into site/public/hero-dark.webp and site/public/hero-light.webp, an
// animated WebP that loops with the drawing's own durations. Lossless, so the pixels stay sharp;
// only what changes between frames is stored, so it stays light.
// Needs Google Chrome (or CHROME=/path/to/chrome), and the site's dependencies for sharp.
import { spawn, execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const sharp = createRequire(`${root}site/package.json`)('sharp');
const PORT = 5198;
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

const durations = JSON.parse(readFileSync(`${root}docs/slime.baipix`, 'utf8')).frames.map((f) => f.duration);
const shots = mkdtempSync(join(tmpdir(), 'baipix-hero-'));

const server = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], { cwd: root, stdio: 'pipe' });
const stop = () => {
  server.kill();
  rmSync(shots, { recursive: true, force: true });
};
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
  const frames = durations.map((_, f) => {
    const png = join(shots, `${theme}-${f}.png`);
    execFileSync(CHROME, [
      '--headless=new',
      '--hide-scrollbars',
      // In English, whatever the computer's language: Baipix opens in the browser's.
      '--lang=en-US',
      '--accept-lang=en-US',
      '--window-size=1440,900',
      '--force-device-scale-factor=2',
      // Time for the app to load the drawing and draw it.
      '--virtual-time-budget=6000',
      `--screenshot=${png}`,
      `http://localhost:${PORT}/?screenshot=${theme}&frame=${f}`,
    ]);
    return png;
  });
  const out = `${root}site/public/hero-${theme}.webp`;
  await sharp(frames, { join: { animated: true } })
    .webp({ lossless: true, effort: 6, loop: 0, delay: durations })
    .toFile(out);
  console.log(`Wrote ${out}`);
}
stop();
