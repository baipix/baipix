import { expect, test, type Page } from '@playwright/test';
import { clickMenuItem, createNewFile, drawAtCanvasCenter, getLayerNames } from './helpers';

// Baipix opens in the browser's language (#565), and these tests look for English labels.
test.use({ locale: 'en-US' });

/** The layer rows of the open board (board rows sit outside `.item-list`). */
const layerRows = (page: Page) => page.locator('.panel-left .item-list > .item');

test('adds, hides, reorders and merges layers', async ({ page }) => {
  await createNewFile(page);

  const panel = page.locator('aside.panel-left');
  const addLayerButton = panel.getByRole('button', { name: 'New layer' });

  await addLayerButton.click();
  await addLayerButton.click();

  const rows = layerRows(page);

  await expect(rows).toHaveCount(3);
  await expect.poll(() => getLayerNames(page)).toEqual(['Layer 3', 'Layer 2', 'Layer 1']);

  // Hide the top layer.
  const topLayer = rows.first();
  const hideButton = topLayer.getByRole('button', { name: 'Hide' });

  await topLayer.hover();
  await expect(hideButton).toHaveCSS('opacity', '1');
  await hideButton.click();

  await expect(topLayer).toHaveClass(/is-hidden/);

  // Select the top layer and move it down through the Layer menu.
  await topLayer.click();
  await clickMenuItem(page, 'Layer', 'Move layer down');

  await expect.poll(() => getLayerNames(page)).toEqual(['Layer 2', 'Layer 3', 'Layer 1']);

  // Select the middle layer and merge it down.
  await rows.nth(1).click();
  await clickMenuItem(page, 'Layer', 'Merge down');

  await expect(rows).toHaveCount(2);
  await expect.poll(() => getLayerNames(page)).toEqual(['Layer 2', 'Layer 1']);
});

test('creates and switches between boards in one file', async ({ page }) => {
  await createNewFile(page);

  await clickMenuItem(page, 'File', 'New board');

  // A file of several boards lists them in the Layers panel, and the open one is marked.
  const boards = page.locator('.panel-left .board-item');

  await expect(boards).toHaveCount(2);

  await boards.nth(0).click();
  await expect(boards.nth(0)).toHaveClass(/is-open/);
  await expect(boards.nth(1)).not.toHaveClass(/is-open/);

  await boards.nth(1).click();
  await expect(boards.nth(1)).toHaveClass(/is-open/);
  await expect(boards.nth(0)).not.toHaveClass(/is-open/);
});

test('copies and pastes a canvas selection', async ({ page }) => {
  await createNewFile(page);
  await drawAtCanvasCenter(page);

  const rows = layerRows(page);

  await expect(rows).toHaveCount(1);

  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.press('ControlOrMeta+C');
  await page.keyboard.press('ControlOrMeta+V');

  // Pasting the selected pixels creates a new layer.
  await expect(rows).toHaveCount(2);
});

test('switches the interface language', async ({ page }) => {
  await createNewFile(page);

  const menubar = page.getByRole('menubar', { name: 'Main menu' });

  await menubar.getByRole('menuitem', { name: 'View', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Language', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Français', exact: true }).click();

  const frenchMenubar = page.getByRole('menubar', { name: 'Menu principal' });

  await expect(frenchMenubar.getByRole('menuitem', { name: 'Fichier', exact: true })).toBeVisible();
});
