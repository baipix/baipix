import { expect, type Page } from '@playwright/test';

export interface SavedFileSummary {
  id: string;
  fileId: string;
  name: string;
  layerNames: string[];
  pixelCount: number;
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

export async function activeLayerThumbnailHasPixels(page: Page): Promise<boolean> {
  const thumbnail = page.locator('.panel-left .item-list > .item canvas.thumb').first();

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

/** Reads a summary of the documents actually saved in IndexedDB. */
export async function readSavedFiles(page: Page): Promise<SavedFileSummary[]> {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('baipix');

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    const result = await new Promise<SavedFileSummary[]>((resolve, reject) => {
      const transaction = db.transaction('files', 'readonly');
      const request = transaction.objectStore('files').getAll();

      let summaries: SavedFileSummary[] = [];

      request.onsuccess = () => {
        const documents = request.result as Array<{
          id: string;
          name: string;
          board?: { file?: string };
          layers: Array<{
            name: string;
            colors: number[];
            runs: number[];
          }>;
        }>;

        summaries = documents.map((document) => {
          let pixelCount = 0;

          for (const layer of document.layers) {
            for (let i = 0; i < layer.runs.length; i += 2) {
              const colorIndex = layer.runs[i];
              const runLength = layer.runs[i + 1];

              if (layer.colors[colorIndex] !== 0) {
                pixelCount += runLength;
              }
            }
          }

          return {
            id: document.id,
            fileId: document.board?.file ?? document.id,
            name: document.name,
            layerNames: document.layers.map((layer) => layer.name),
            pixelCount,
          };
        });
      };

      transaction.oncomplete = () => resolve(summaries);
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });

    db.close();
    return result;
  });
}

/** Counts saved Undo steps across all stored board histories. */
export async function readStoredHistorySteps(page: Page, direction: 'undo' | 'redo'): Promise<number> {
  return page.evaluate(async (side) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('baipix');

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    const count = await new Promise<number>((resolve, reject) => {
      const transaction = db.transaction('histories', 'readonly');
      const request = transaction.objectStore('histories').getAll();

      let steps = 0;

      request.onsuccess = () => {
        const histories = request.result as Array<{
          boards?: Array<{
            undo?: unknown[];
            redo?: unknown[];
          }>;
        }>;

        steps = histories.reduce(
          (total, history) =>
            total +
            (history.boards ?? []).reduce((boardTotal, board) => boardTotal + (board[side]?.length ?? 0), 0),
          0,
        );
      };

      transaction.oncomplete = () => resolve(steps);
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });

    db.close();
    return count;
  }, direction);
}
