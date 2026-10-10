import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Editor } from './engine/editor';
import { getLocale } from './i18n';
import { IndexedDbStorage } from './storage/indexedDb';
import type { StorageAdapter } from './storage/workspace';
import { App, editorLabels } from './ui/App';
import { initTheme } from './ui/theme';
import { openScreenshotScene, prepareScreenshot, screenshotTheme } from './ui/screenshotMode';
import './ui/styles/tokens.css';
import './ui/styles/app.css';

/** Storage falls back to memory only when IndexedDB is unavailable (private mode, sandboxed iframes). */
const memoryStorage: StorageAdapter = { load: async () => null, save: async () => {} };
let storage: StorageAdapter = memoryStorage;
// The screenshots (dev only) never read or write the saved files.
const shot = screenshotTheme();
try {
  if (typeof indexedDB !== 'undefined' && !shot) storage = new IndexedDbStorage();
} catch {
  storage = memoryStorage;
}
if (shot) prepareScreenshot(shot);

document.documentElement.lang = getLocale();
initTheme();
const editor = new Editor(editorLabels());

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App editor={editor} storage={storage} />
  </StrictMode>,
);
// After the app has loaded its (empty) workspace.
if (shot) setTimeout(() => void openScreenshotScene(editor), 300);
