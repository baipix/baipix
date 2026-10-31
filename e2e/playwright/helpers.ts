import { Buffer } from 'node:buffer';
import { expect, type Page } from '@playwright/test';

export async function createNewFile(page: Page, width = 32, height = 32) {
  await page.goto('/');
  const welcome = page.locator('.home-welcome-actions');

  await expect(welcome).toBeVisible();
  await welcome.getByRole('button', { name: 'Create', exact: true }).click();

  const dialog = page.locator('dialog.new-file-dialog');

  await dialog.getByLabel('Board width').fill(String(width));
  await dialog.getByLabel('Board height').fill(String(height));
  await dialog.getByRole('button', { name: 'Create', exact: true }).click();

  await expect(dialog).toBeHidden();
  await expect(page.locator('canvas.canvas')).toBeVisible();
}

export async function drawAtCanvasCenter(page: Page) {
  await page
    .getByRole('toolbar', { name: 'Tools' })
    .getByRole('button', { name: 'Pencil', exact: true })
    .click();

  const canvas = page.locator('canvas.canvas');
  const box = await canvas.boundingBox();

  if (!box) {
    throw new Error('The drawing canvas is not visible.');
  }

  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.move(0, 0);
}

/** Checks whether the layer thumbnail currently displays any non-transparent pixels. */
export async function activeLayerThumbnailHasPixels(page: Page): Promise<boolean> {
  const thumbnail = page.locator('.panel-left .item-list > .item.is-active canvas.thumb');

  if (!(await thumbnail.count())) {
    return false;
  }

  return thumbnail.evaluate((canvas: HTMLCanvasElement) => {
    const context = canvas.getContext('2d');

    if (!context) return false;

    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;

    for (let i = 3; i < pixels.length; i += 4) {
      if (pixels[i] > 0) return true;
    }

    return false;
  });
}
