import type { Editor } from '../engine/editor';
import { documentFromJson } from '../storage/fileFormat';
import { leaveHome } from './home';
import { uiStore } from './uiStore';
import { setTheme } from './theme';

/**
 * The editor as the website and the README show it, for `npm run screenshots` (dev server only):
 * `?screenshot=dark` or `?screenshot=light` opens docs/sunset.baipix with its Middle clouds layer
 * active, in that theme, without the first-launch tour and without touching saved files.
 */
export const screenshotTheme = (): 'dark' | 'light' | null => {
  if (!import.meta.env.DEV) return null;
  const v = new URLSearchParams(location.search).get('screenshot');
  return v === 'dark' || v === 'light' ? v : null;
};

/** Before the first render: the theme, and no tour. */
export function prepareScreenshot(theme: 'dark' | 'light'): void {
  setTheme(theme);
  try {
    localStorage.setItem('baipix.tourDone', '1');
  } catch {
    /* a fresh profile without storage: the tour may show */
  }
}

/** Once the app is up: the sunset, as on the home page. */
export async function openScreenshotScene(editor: Editor): Promise<void> {
  const text = await (await fetch('/docs/sunset.baipix')).text();
  editor.addDocument(documentFromJson(text));
  leaveHome(editor);
  const { doc } = editor.getState();
  const middle = doc.layers.findIndex((l) => l.name === 'Middle clouds');
  if (middle >= 0) editor.setActiveLayer(middle);
  // The drawing's own colors as the palette, no pixel grid, and the preview under the layers.
  editor.setPalettePreset('drawing');
  editor.setView('grid', false);
  uiStore.set((s) => ({ preview: { ...s.preview, x: 10, y: 270 } }));
}
