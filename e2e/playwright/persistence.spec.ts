import { expect, test } from '@playwright/test';
import { activeLayerThumbnailHasPixels, createNewFile, drawAtCanvasCenter } from './helpers';

test('keeps a drawing after reloading the page', async ({ page, context }) => {
  await createNewFile(page);
  await drawAtCanvasCenter(page);

  // Keep the original page open so pagehide cannot flush the pending save.
  // Wait for the autosave debounce before opening another page.
  await page.waitForTimeout(1_000);

  const restoredPage = await context.newPage();
  await restoredPage.goto('/');

  await expect(restoredPage.locator('canvas.canvas')).toBeVisible();
  await expect.poll(() => activeLayerThumbnailHasPixels(restoredPage), { timeout: 10_000 }).toBe(true);
});

test('restores Undo and Redo history after reloading the page', async ({ page, context }) => {
  await createNewFile(page);
  await drawAtCanvasCenter(page);

  // Wait for the drawing and its Undo history to be saved.
  await page.waitForTimeout(2_500);

  const restoredPage = await context.newPage();
  await restoredPage.goto('/');

  const toolbar = restoredPage.getByRole('toolbar', { name: 'Tools' });
  const undo = toolbar.getByRole('button', { name: 'Undo', exact: true });

  await expect(restoredPage.locator('canvas.canvas')).toBeVisible();
  await expect(undo).toBeEnabled();

  await undo.click();

  await expect.poll(() => activeLayerThumbnailHasPixels(restoredPage)).toBe(false);

  // Wait for the updated Redo history to be saved.
  await restoredPage.waitForTimeout(2_500);

  const redoPage = await context.newPage();
  await redoPage.goto('/');

  const redo = redoPage
    .getByRole('toolbar', { name: 'Tools' })
    .getByRole('button', { name: 'Redo', exact: true });

  await expect(redoPage.locator('canvas.canvas')).toBeVisible();
  await expect(redo).toBeEnabled();

  await redo.click();

  await expect.poll(() => activeLayerThumbnailHasPixels(redoPage)).toBe(true);
});
