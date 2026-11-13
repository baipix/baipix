import { Buffer } from 'node:buffer';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
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

test('opens an Aseprite file', async ({ page }) => {
  await createNewFile(page);

  // Open the Aseprite file through the regular File menu.
  const fileChooserPromise = page.waitForEvent('filechooser');
  await clickMenuItem(page, 'File', 'Open a .baipix file…');

  const fileChooser = await fileChooserPromise;

  await fileChooser.setFiles(
    fileURLToPath(new URL('../../tests/fixtures/aseprite/abcd.aseprite', import.meta.url)),
  );

  // Verify that the file was opened as a new document.
  await expect(page.locator('.menubar-file input')).toHaveValue('abcd');
  await expect(page.locator('canvas.canvas')).toBeVisible();

  // Verify that all four source layers are available in the editor.
  await expect.poll(() => getLayerNames(page)).toHaveLength(4);
  expect((await getLayerNames(page)).sort()).toEqual(['a', 'b', 'c', 'd']);
});

test('imports a sprite sheet as animation frames from File menu', async ({ page }) => {
  await createNewFile(page);

  // Generate an 8×4 PNG buffer with two 4×4 cells side by side.
  const pngBytes = await page.evaluate(async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 8;
    canvas.height = 4;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Could not create canvas context.');
    ctx.fillStyle = '#ff0000';
    ctx.fillRect(0, 0, 4, 4);
    ctx.fillStyle = '#0000ff';
    ctx.fillRect(4, 0, 4, 4);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('Failed to encode PNG.');
    return Array.from(new Uint8Array(await blob.arrayBuffer()));
  });

  const fileChooserPromise = page.waitForEvent('filechooser');
  await clickMenuItem(page, 'File', 'Import a sprite sheet…');
  const fileChooser = await fileChooserPromise;

  await fileChooser.setFiles({
    name: 'sheet.png',
    mimeType: 'image/png',
    buffer: Buffer.from(pngBytes),
  });

  const dialog = page.locator('dialog.sprite-sheet-dialog');
  await expect(dialog).toBeVisible();

  // Enter 2 columns (which automatically recalculates cell width to 4).
  const colsInput = dialog.getByLabel('Columns');
  await colsInput.fill('2');

  await dialog.getByRole('button', { name: 'Import 2 frames' }).click();
  await expect(dialog).toBeHidden();

  // Open the timeline to verify the imported frames.
  await page.locator('.animate-button').click();
  await expect(page.locator('.timeline-frame')).toHaveCount(2);
  await expect(page.locator('.timeline-count')).toHaveText('1 / 2');
});
