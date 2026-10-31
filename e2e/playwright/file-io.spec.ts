import { Buffer } from 'node:buffer';
import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import {
  activeLayerThumbnailHasPixels,
  clickMenuItem,
  createNewFile,
  createPngBuffer,
  getLayerNames,
  drawAtCanvasCenter,
} from './helpers';

test('opens a saved .baipix file with the same layers', async ({ page, browser }) => {
  await createNewFile(page);

  const layerPanel = page.locator('aside.panel-left');
  await layerPanel.getByRole('button', { name: 'New layer' }).click();

  await expect.poll(() => getLayerNames(page)).toEqual(['Layer 2', 'Layer 1']);
  const originalLayers = await getLayerNames(page);

  // Download the document in Baipix format.
  const downloadPromise = page.waitForEvent('download');
  await clickMenuItem(page, 'File', 'Download as .baipix');

  const download = await downloadPromise;
  const filename = download.suggestedFilename();

  expect(filename).toMatch(/\.baipix$/);

  const buffer = await readFile(await download.path());

  // Use a clean browser context so the file is opened as a new workspace.
  const reopenedContext = await browser.newContext({
    baseURL: new URL(page.url()).origin,
    locale: 'en-US',
  });

  try {
    const reopenedPage = await reopenedContext.newPage();
    await createNewFile(reopenedPage);

    const fileChooserPromise = reopenedPage.waitForEvent('filechooser');
    await clickMenuItem(reopenedPage, 'File', 'Open a .baipix file…');

    const fileChooser = await fileChooserPromise;

    await fileChooser.setFiles({
      name: filename,
      mimeType: 'application/json',
      buffer,
    });
    await expect(reopenedPage.locator('canvas.canvas')).toBeVisible();
    await expect.poll(() => getLayerNames(reopenedPage)).toEqual(originalLayers);
  } finally {
    await reopenedContext.close();
  }
});

test('imports a PNG image from the home screen', async ({ page }) => {
  await page.goto('/');

  const png = await createPngBuffer(page);
  const importButton = page
    .locator('.home-welcome-actions')
    .getByRole('button', { name: 'Import', exact: true });

  const fileChooserPromise = page.waitForEvent('filechooser');
  await importButton.click();

  const fileChooser = await fileChooserPromise;

  await fileChooser.setFiles({
    name: 'pixel-pattern.png',
    mimeType: 'image/png',
    buffer: png,
  });

  await expect(page.locator('canvas.canvas')).toBeVisible();
  await expect(page.locator('.menubar-file input')).toHaveValue('pixel-pattern');
  await expect.poll(() => activeLayerThumbnailHasPixels(page)).toBe(true);
});

test('exports PNG and Aseprite files', async ({ page }) => {
  await createNewFile(page);
  await drawAtCanvasCenter(page);

  await page.locator('.menubar-export').click();

  const dialog = page.locator('dialog.export-dialog');
  await expect(dialog).toBeVisible();

  // PNG export
  await dialog.getByLabel('Format').selectOption('png');

  const pngDownloadPromise = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Export', exact: true }).click();

  const pngDownload = await pngDownloadPromise;
  expect(pngDownload.suggestedFilename()).toMatch(/\.png$/i);

  const png = await readFile(await pngDownload.path());

  // PNG file signature.
  expect(png.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));

  // Aseprite export
  await dialog.getByLabel('Format').selectOption('aseprite');

  const asepriteDownloadPromise = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Export', exact: true }).click();

  const asepriteDownload = await asepriteDownloadPromise;
  expect(asepriteDownload.suggestedFilename()).toMatch(/\.aseprite$/i);

  const aseprite = await readFile(await asepriteDownload.path());

  // Aseprite file header magic.
  expect(aseprite.readUInt16LE(4)).toBe(0xa5e0);
});
