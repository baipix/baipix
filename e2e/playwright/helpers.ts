import { Buffer } from 'node:buffer';
import { expect, type BrowserContext, type Page } from '@playwright/test';

/** Runs in a probe page before the app starts: it may read saved work, never write it. */
function blockSaving() {
  const store = IDBObjectStore.prototype as unknown as Record<string, unknown>;

  store.put = () => {
    throw new DOMException('Probe pages must not save.', 'ReadOnlyError');
  };
}

/**
 * Retries with a fresh page until `check` passes, instead of waiting a fixed time.
 *
 * Baipix rewrites what it loaded on mount (after 600 ms) and on pagehide, so a probe that
 * loaded a stale state would overwrite the newer save and every later attempt would fail.
 * Probes are therefore read-only, and closed after each attempt.
 */
export async function waitUntilSaved(
  context: BrowserContext,
  check: (page: Page) => Promise<void>,
  timeout = 10_000,
) {
  await expect(async () => {
    const probe = await context.newPage();

    try {
      await probe.addInitScript(blockSaving);
      await probe.goto('/');

      await check(probe);
    } finally {
      await probe.close();
    }
  }).toPass({ timeout });
}

/** A normal page, opened only once `waitUntilSaved` has shown that storage holds the state. */
export async function openEditor(context: BrowserContext): Promise<Page> {
  const page = await context.newPage();

  await page.goto('/');
  await expect(page.locator('canvas.canvas')).toBeVisible();

  return page;
}

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

export async function clickMenuItem(page: Page, menuName: string, itemName: string) {
  const menubar = page.getByRole('menubar', { name: 'Main menu' });

  await menubar.getByRole('menuitem', { name: menuName, exact: true }).click();
  await page.getByRole('menuitem', { name: itemName }).click();
}

/** Reads the layer names displayed in the Layers panel. */
export async function getLayerNames(page: Page): Promise<string[]> {
  const names = await page
    .locator('.panel-left .item-list > .item:not(.group-item):not(.reference-item) .item-name')
    .allTextContents();

  return names.map((name) => name.trim());
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

/** Creates a 4×4 PNG that doesn't trigger Baipix's pixel-grid recovery dialog. */
export async function createPngBuffer(page: Page): Promise<Buffer> {
  const bytes = await page.evaluate(async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 4;
    canvas.height = 4;

    const context = canvas.getContext('2d');

    if (!context) throw new Error('Could not create a 2D canvas context.');

    for (let y = 0; y < 4; y++) {
      for (let x = 0; x < 4; x++) {
        context.fillStyle = `rgb(${x * 61}, ${y * 59}, ${(x * 37 + y * 29) % 256})`;
        context.fillRect(x, y, 1, 1);
      }
    }

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((value) => {
        if (value) resolve(value);
        else reject(new Error('Could not encode PNG.'));
      }, 'image/png');
    });

    return Array.from(new Uint8Array(await blob.arrayBuffer()));
  });

  return Buffer.from(bytes);
}
