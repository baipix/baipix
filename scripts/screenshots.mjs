// The editor's screenshots for the website and the README, taken again from the current interface:
// npm run screenshots. Starts the dev server, opens the editor in headless Chrome at 1440×900 (2×)
// in dark and light (?screenshot=…, see src/ui/screenshotMode.ts), and writes
// site/public/screenshot-dark.png, site/public/screenshot-light.png and docs/screenshot.png.
// Needs Google Chrome (or CHROME=/path/to/chrome).
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { copyFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

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

const server = await createServer({
  root,
  server: {
    port: PORT,
    strictPort: true,
  },
});

try {
  await server.listen();

  for (const theme of ['dark', 'light']) {
    const out = `${root}site/public/screenshot-${theme}.png`;

    const chrome = spawn(
      CHROME,
      [
        '--headless=new',
        '--hide-scrollbars',
        // In English, whatever the computer's language: Baipix opens in the browser's.
        '--lang=en-US',
        '--accept-lang=en-US',
        '--window-size=1440,900',
        '--force-device-scale-factor=2',
        // Time for the app to load the drawing and draw it.
        '--virtual-time-budget=6000',
        `--screenshot=${out}`,
        `http://localhost:${PORT}/?screenshot=${theme}`,
      ],
      { stdio: 'ignore' },
    );

    const [code, signal] = await once(chrome, 'close');

    if (code !== 0) {
      throw new Error(`Chrome exited with ${signal ?? `code ${code}`}.`);
    }

    console.log(`Wrote ${out}`);
  }

  copyFileSync(`${root}site/public/screenshot-dark.png`, `${root}docs/screenshot.png`);
  console.log(`Wrote ${root}docs/screenshot.png`);
} finally {
  await server.close();
}
