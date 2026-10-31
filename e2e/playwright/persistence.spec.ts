import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { activeLayerThumbnailHasPixels, createNewFile, drawAtCanvasCenter } from './helpers';

const SAVE_TIMEOUT = 10_000; // total time to wait for the autosave to land
const PROBE_TIMEOUT = 2_000; // time for a single attempt, so several retries fit into SAVE_TIMEOUT

const toolButton = (page: Page, name: 'Undo' | 'Redo') =>
  page.getByRole('toolbar', { name: 'Tools' }).getByRole('button', { name, exact: true });

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
async function waitUntilSaved(context: BrowserContext, check: (page: Page) => Promise<void>) {
  await expect(async () => {
    const probe = await context.newPage();

    try {
      await probe.addInitScript(blockSaving);
      await probe.goto('/');
      await check(probe);
    } finally {
      await probe.close();
    }
  }).toPass({ timeout: SAVE_TIMEOUT });
}

/** A normal page, opened only once `waitUntilSaved` has shown that storage holds the state. */
async function openEditor(context: BrowserContext): Promise<Page> {
  const page = await context.newPage();

  await page.goto('/');
  await expect(page.locator('canvas.canvas')).toBeVisible();

  return page;
}

test('keeps a drawing after reloading the page', async ({ page, context }) => {
  await createNewFile(page);
  await drawAtCanvasCenter(page);

  // Keep the original page open so pagehide cannot flush the pending save:
  // only the autosave can put the drawing into storage.
  await waitUntilSaved(context, async (restored) => {
    await expect(restored.locator('canvas.canvas')).toBeVisible({ timeout: PROBE_TIMEOUT });
    await expect.poll(() => activeLayerThumbnailHasPixels(restored), { timeout: PROBE_TIMEOUT }).toBe(true);
  });
});

test('restores Undo and Redo history after reloading the page', async ({ page, context }) => {
  await createNewFile(page);
  await drawAtCanvasCenter(page);

  // The drawing (0.6 s) and its history (2 s) are saved separately: wait for the history.
  await waitUntilSaved(context, async (restored) => {
    await expect(toolButton(restored, 'Undo')).toBeEnabled({ timeout: PROBE_TIMEOUT });
  });

  const restoredPage = await openEditor(context);

  await expect.poll(() => activeLayerThumbnailHasPixels(restoredPage)).toBe(true);
  await expect(toolButton(restoredPage, 'Undo')).toBeEnabled();

  await toolButton(restoredPage, 'Undo').click();
  await expect.poll(() => activeLayerThumbnailHasPixels(restoredPage)).toBe(false);

  // The Undo moved a step to Redo: wait until that history is saved too.
  await waitUntilSaved(context, async (restored) => {
    await expect(toolButton(restored, 'Redo')).toBeEnabled({ timeout: PROBE_TIMEOUT });
  });

  const redoPage = await openEditor(context);

  await expect(toolButton(redoPage, 'Redo')).toBeEnabled();

  await toolButton(redoPage, 'Redo').click();
  await expect.poll(() => activeLayerThumbnailHasPixels(redoPage)).toBe(true);
});
