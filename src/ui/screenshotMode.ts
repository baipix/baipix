import type { Editor } from '../engine/editor';
import { documentFromJson } from '../storage/fileFormat';
import { leaveHome } from './home';
import { playbackStore } from './playback';
import { uiStore } from './uiStore';
import { viewport } from './viewport';
import { setTheme } from './theme';

/**
 * The editor as the website and the README show it, for `npm run screenshots` (dev server only):
 * `?screenshot=dark` or `?screenshot=light` opens docs/sunset.baipix with its Middle clouds layer
 * active, in that theme, without the first-launch tour and without touching saved files.
 * `&frame=N` opens docs/slime.baipix instead, playing in the timeline and stopped on frame N, for
 * the home page's animation (`npm run screenshots:hero`).
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

/** Once the app is up: the sunset, or the slime jumping. */
export async function openScreenshotScene(editor: Editor): Promise<void> {
  const frame = new URLSearchParams(location.search).get('frame');
  if (frame !== null) return openSlime(editor, Number(frame));
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

async function openSlime(editor: Editor, frame: number): Promise<void> {
  uiStore.set((s) => ({ timeline: true, preview: { ...s.preview, x: 10, y: 330 } }));
  const text = await (await fetch('/docs/slime.baipix')).text();
  editor.addDocument(documentFromJson(text));
  leaveHome(editor);
  const { doc } = editor.getState();
  editor.setActiveLayer(doc.layers.findIndex((l) => l.name === 'Body'));
  editor.setView('grid', false);
  editor.setFrame(frame, false);
  // Once everything has settled, the same view on every frame (a fit could land differently while
  // the timeline takes its height), and the pause button, as while it plays: each screenshot is
  // one frame of the loop.
  setTimeout(() => {
    const zoom = 10;
    viewport.set({ zoom, panX: Math.round((viewport.width - doc.width * zoom) / 2), panY: 100 });
    playbackStore.set({ playing: true });
  }, 1500);
}
