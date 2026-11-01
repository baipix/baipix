import { expect, test, type Page } from '@playwright/test';
import {
  activeLayerThumbnailHasPixels,
  createNewFile,
  drawAtCanvasCenter,
  waitUntilSaved,
  openEditor,
} from './helpers';

// Total time to wait for the autosave to land
const SAVE_TIMEOUT = 10_000;
// Keeps each probe short enough for several retries within SAVE_TIMEOUT.
const PROBE_TIMEOUT = 2_000;

const toolButton = (page: Page, name: 'Undo' | 'Redo') =>
  page.getByRole('toolbar', { name: 'Tools' }).getByRole('button', { name, exact: true });

test('keeps a drawing after reloading the page', async ({ page, context }) => {
  await createNewFile(page);
  await drawAtCanvasCenter(page);

  // Keep the original page open so pagehide cannot flush the pending save:
  // only the autosave can put the drawing into storage.
  await waitUntilSaved(
    context,
    async (restored) => {
      await expect(restored.locator('canvas.canvas')).toBeVisible({ timeout: PROBE_TIMEOUT });
      await expect.poll(() => activeLayerThumbnailHasPixels(restored), { timeout: PROBE_TIMEOUT }).toBe(true);
    },
    SAVE_TIMEOUT,
  );
});

test('restores Undo and Redo history after reloading the page', async ({ page, context }) => {
  await createNewFile(page);
  await drawAtCanvasCenter(page);

  // The drawing (0.6 s) and its history (2 s) are saved separately: wait for the history.
  await waitUntilSaved(
    context,
    async (restored) => {
      await expect(toolButton(restored, 'Undo')).toBeEnabled({ timeout: PROBE_TIMEOUT });
    },
    SAVE_TIMEOUT,
  );

  const restoredPage = await openEditor(context);

  await expect.poll(() => activeLayerThumbnailHasPixels(restoredPage)).toBe(true);
  await expect(toolButton(restoredPage, 'Undo')).toBeEnabled();

  await toolButton(restoredPage, 'Undo').click();
  await expect.poll(() => activeLayerThumbnailHasPixels(restoredPage)).toBe(false);

  // The Undo moved a step to Redo: wait until that history is saved too.
  await waitUntilSaved(
    context,
    async (restored) => {
      await expect(toolButton(restored, 'Redo')).toBeEnabled({ timeout: PROBE_TIMEOUT });
    },
    SAVE_TIMEOUT,
  );

  const redoPage = await openEditor(context);

  await expect(toolButton(redoPage, 'Redo')).toBeEnabled();

  await toolButton(redoPage, 'Redo').click();
  await expect.poll(() => activeLayerThumbnailHasPixels(redoPage)).toBe(true);
});
