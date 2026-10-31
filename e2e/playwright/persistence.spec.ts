import { expect, test } from '@playwright/test';
import {
  activeLayerThumbnailHasPixels,
  createNewFile,
  drawAtCanvasCenter,
  readSavedFiles,
  readStoredHistorySteps,
} from './helpers';

test('keeps a drawing after reloading the page', async ({ page }) => {
  await createNewFile(page);
  await drawAtCanvasCenter(page);

  // Wait for the autosave debounce and the IndexedDB transaction.
  await expect
    .poll(
      async () => {
        const files = await readSavedFiles(page);
        return files.some((file) => file.pixelCount > 0);
      },
      { timeout: 15_000 },
    )
    .toBe(true);

  await page.reload();

  await expect(page.locator('canvas.canvas')).toBeVisible();

  // The layer thumbnail is rendered from the restored document.
  await expect.poll(() => activeLayerThumbnailHasPixels(page), { timeout: 10_000 }).toBe(true);
});

test('restores Undo and Redo history after reloading the page', async ({ page }) => {
  await createNewFile(page);
  await drawAtCanvasCenter(page);

  await expect.poll(() => readStoredHistorySteps(page, 'undo'), { timeout: 20_000 }).toBeGreaterThan(0);

  await page.reload();

  const toolbar = page.getByRole('toolbar', { name: 'Tools' });
  const undo = toolbar.getByRole('button', { name: 'Undo', exact: true });

  await expect(undo).toBeEnabled();
  await undo.click();

  await expect.poll(() => activeLayerThumbnailHasPixels(page)).toBe(false);

  // Wait until the Redo history is persisted.
  await expect.poll(() => readStoredHistorySteps(page, 'redo'), { timeout: 20_000 }).toBeGreaterThan(0);

  // Redo must survive another reload.
  await page.reload();

  const redo = page
    .getByRole('toolbar', { name: 'Tools' })
    .getByRole('button', { name: 'Redo', exact: true });

  await expect(redo).toBeEnabled();
  await redo.click();

  await expect.poll(() => activeLayerThumbnailHasPixels(page)).toBe(true);
});
