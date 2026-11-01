import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import {
  activeLayerThumbnailHasPixels,
  clickMenuItem,
  createNewFile,
  drawAtCanvasCenter,
  waitUntilSaved,
} from './helpers';

// Keeps each probe short enough for several retries within SAVE_TIMEOUT.
const PROBE_TIMEOUT = 2_000;
// Adopting changes from other tabs (changedElsewhere) has no UI signal, so give it a moment.
const SYNC_SETTLE_MS = 300;

const boardItems = (page: Page) => page.locator('.panel-left .board-item');

/** Opens the board at `index`, unless it is already open (clicking it again might fold it). */
async function openBoard(page: Page, index: number) {
  const board = boardItems(page).nth(index);

  const isOpen = await board.evaluate((element) => element.classList.contains('is-open'));

  if (!isOpen) {
    await board.click();
  }

  await expect(board).toHaveClass(/is-open/);
}

/** Opens the board at `index` and reports whether it shows a drawing. */
async function openBoardHasPixels(page: Page, index: number) {
  await openBoard(page, index);

  return activeLayerThumbnailHasPixels(page);
}

/**
 * Draws one pixel in the center of the selected board.
 * The board is fitted into view before drawing, so the click
 * always lands inside the intended board.
 */
async function drawOnBoard(page: Page, index: number) {
  await page.bringToFront();

  await openBoard(page, index);
  await clickMenuItem(page, 'View', 'Zoom to fit');
  await drawAtCanvasCenter(page);
  await expect(boardItems(page).nth(index)).toHaveClass(/is-open/);
}

/** Brings the tab to the front and fires the focus event that makes it adopt other tabs' changes. */
async function focusTab(page: Page) {
  await page.bringToFront();
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await page.waitForTimeout(SYNC_SETTLE_MS);
}

/**
 * Syncs the tab, then checks whether the board at `index` has a drawing.
 * A tab keeps its open board as it is, so while the board is still empty we go back to
 * `fallbackIndex`. Otherwise the board we are waiting for would stay open and never be updated.
 */
async function syncAndCheckBoard(page: Page, index: number, fallbackIndex: number) {
  await focusTab(page);

  const hasPixels = await openBoardHasPixels(page, index);

  if (!hasPixels) {
    await openBoard(page, fallbackIndex);
  }

  return hasPixels;
}

/** Waits until storage holds both boards, with a drawing on each of `drawnIndexes`. */
async function waitUntilBoardsSaved(context: BrowserContext, drawnIndexes: number[]) {
  await waitUntilSaved(context, async (restored) => {
    await expect(boardItems(restored)).toHaveCount(2, { timeout: PROBE_TIMEOUT });

    for (const index of drawnIndexes) {
      await openBoard(restored, index);
      await expect.poll(() => activeLayerThumbnailHasPixels(restored), { timeout: PROBE_TIMEOUT }).toBe(true);
    }
  });
}

test('keeps changes from two tabs without overwriting either board', async ({ page, context }) => {
  await createNewFile(page);

  // Create a second board in the same file.
  await clickMenuItem(page, 'File', 'New board');
  await expect(boardItems(page)).toHaveCount(2);

  // Tab A stays on the first board while Tab B edits the second one.
  await openBoard(page, 0);

  // Tab A is never reloaded: it keeps its own in-memory state, like a real second tab.
  // Tab B must only open once storage holds both boards, or it would rewrite a stale state.
  await waitUntilBoardsSaved(context, []);

  const pageB = await context.newPage();

  try {
    await pageB.goto('/');
    await expect(pageB.locator('canvas.canvas')).toBeVisible();
    await expect(boardItems(pageB)).toHaveCount(2);

    // Tab B draws on the second board.
    await drawOnBoard(pageB, 1);
    await waitUntilBoardsSaved(context, [1]);

    // Tab A (idle on the first board) should receive Tab B's drawing.
    await expect.poll(() => syncAndCheckBoard(page, 1, 0), { timeout: 15_000 }).toBe(true);

    // Tab A draws on the first board.
    await drawOnBoard(page, 0);
    await waitUntilBoardsSaved(context, [0, 1]);

    // Tab B (idle on the second board) should receive Tab A's drawing.
    await expect.poll(() => syncAndCheckBoard(pageB, 0, 1), { timeout: 15_000 }).toBe(true);

    // Both drawings are visible in both tabs...
    for (const tab of [page, pageB]) {
      await tab.bringToFront();

      for (const index of [0, 1]) {
        await expect.poll(() => openBoardHasPixels(tab, index), { timeout: 10_000 }).toBe(true);
      }
    }

    // ...and neither board was overwritten in storage.
    await waitUntilBoardsSaved(context, [0, 1]);
  } finally {
    await pageB.close();
  }
});
